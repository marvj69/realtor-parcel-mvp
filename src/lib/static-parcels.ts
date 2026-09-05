import type { DatabaseSync as SQLiteDatabase } from "node:sqlite";
import { createRequire } from "node:module";
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { booleanPointInPolygon, simplify } from "@turf/turf";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";
import { query } from "./db";
import { hasDatabaseConfig } from "./env";
import { decodeParcel, type DatasetManifest, type StoredParcel } from "./static-parcel-format";
import { parcelRowToFeature, parcelPropertiesFromRow, parsePoint } from "./parcels";
import type { ParcelFeature, ParcelSearchResult } from "../types/parcel";

// Node's built-in SQLite is loaded through a real Node require; Turbopack's
// generated external wrapper does not support node:sqlite on all supported runtimes.
const { DatabaseSync } = createRequire(join(process.cwd(), "package.json"))("node:sqlite") as typeof import("node:sqlite");
const dataPath = () => join(process.cwd(), "data/static-parcels");
// A production backend with missing deployment data must fail closed after pruning.
// A checkout without DATABASE_URL retains the existing demo behavior.
export const hasStaticParcels = () => hasDatabaseConfig() &&
  (process.env.NODE_ENV === "production" || existsSync(join(dataPath(), "manifest.json")));
let pending: Promise<StaticParcelStore> | undefined;

export async function getStaticParcels(): Promise<StaticParcelStore> {
  pending ??= openDataset().catch(error => { pending = undefined; throw error; });
  return pending;
}

async function openDataset() {
  const manifest: DatasetManifest = JSON.parse(await readFile(join(dataPath(),"manifest.json"),"utf8"));
  if (manifest.format !== 1 || !/^[0-9]+$/.test(manifest.version)) throw new Error("Unsupported parcel dataset");
  const [key] = await query<{key_hex:string}>("SELECT key_hex FROM parcel_dataset_keys WHERE version=$1",[manifest.version]);
  if (!key) throw new Error("Parcel dataset key unavailable");
  const destination = join(tmpdir(),`parcel-${manifest.version}.sqlite`);
  const partial = destination + `.${randomUUID()}.partial`;
  if (existsSync(destination)) {
    const existingHash=createHash("sha256");
    for await (const chunk of createReadStream(destination)) existingHash.update(chunk);
    if (existingHash.digest("hex") === manifest.sha256) return new StaticParcelStore(destination,manifest);
    await rm(destination,{force:true});
  }
  const decipher = createDecipheriv("aes-256-gcm",Buffer.from(key.key_hex,"hex"),Buffer.from(manifest.iv,"hex"));
  decipher.setAuthTag(Buffer.from(manifest.tag,"hex"));
  async function* chunks() {
    for (const part of manifest.parts) {
      if (!/^[0-9]+\.[0-9]+\.enc$/.test(part)) throw new Error("Invalid dataset part");
      for await (const chunk of createReadStream(join(dataPath(),part))) yield chunk;
    }
  }
  try {
    await pipeline(Readable.from(chunks()),decipher,createGunzip(),createWriteStream(partial,{mode:0o600}));
    const hash=createHash("sha256");
    for await (const chunk of createReadStream(partial)) hash.update(chunk);
    if (hash.digest("hex") !== manifest.sha256) throw new Error("Parcel dataset checksum mismatch");
    await rename(partial,destination);
    const store = new StaticParcelStore(destination,manifest);
    if (store.count !== manifest.count) { store.close(); throw new Error("Parcel dataset count mismatch"); }
    return store;
  } catch (error) {
    await rm(partial,{force:true});
    await rm(destination,{force:true});
    throw error;
  }
}

type Box = [number,number,number,number];
type PayloadRow = {payload:Uint8Array; area:number};
const matchesBounds = `FROM bounds b JOIN parcels p ON p.n=b.n
  WHERE b.west<=? AND b.east>=? AND b.south<=? AND b.north>=?
  AND p.west<=? AND p.east>=? AND p.south<=? AND p.north>=?`;
function bboxParams([west,south,east,north]:Box) { return [east,west,north,south,east,west,north,south]; }

// This is an immutable deployment file, never a writable replacement for the user database.
export class StaticParcelStore {
  readonly db: SQLiteDatabase;
  readonly count: number;
  constructor(path:string, readonly manifest?:DatasetManifest) {
    this.db=new DatabaseSync(path,{readOnly:true});
    this.db.exec("PRAGMA query_only=ON; PRAGMA cache_size=-16384;");
    this.count = Number(this.db.prepare("SELECT count(*) n FROM parcels").get()!.n);
  }
  close() { this.db.close(); }
  get(id:string):StoredParcel|null {
    const row=this.db.prepare("SELECT payload FROM parcels WHERE id=?").get(id);
    return row ? decodeParcel(row.payload as Uint8Array) : null;
  }
  countBbox(box:Box) { return Number(this.db.prepare(`SELECT count(*) n ${matchesBounds}`).get(...bboxParams(box))!.n); }
  private candidates(box:Box, limit:number) {
    return this.db.prepare(`SELECT p.payload,p.area ${matchesBounds} ORDER BY p.source_key,p.source_feature_id LIMIT ?`)
      .all(...bboxParams(box),limit) as unknown as PayloadRow[];
  }
  bbox(box:Box,limit:number,tolerance=0) {
    const features = this.candidates(box,limit).map(r=>parcelRowToFeature(decodeParcel(r.payload))!).filter(Boolean);
    return {type:"FeatureCollection" as const,features: tolerance ? features.map(f=>simplify(f,{tolerance,highQuality:true})) : features};
  }
  lookup(lng:number,lat:number):ParcelFeature|null {
    // No candidate cap: overlapping source polygons are ranked just as in the PostGIS lookup.
    const matches=this.candidates([lng,lat,lng,lat],this.count).map(r=>({row:decodeParcel(r.payload),area:r.area}))
      .map(r=>({...r,feature:parcelRowToFeature(r.row)!}))
      .filter(r=>r.feature && booleanPointInPolygon([lng,lat],r.feature));
    matches.sort((a,b)=>Number(!a.row.owner_name)-Number(!b.row.owner_name)
      || Number(!(a.row.apn||a.row.parcel_id))-Number(!(b.row.apn||b.row.parcel_id))
      || Number(!a.row.site_address)-Number(!b.row.site_address) || a.area-b.area);
    return matches[0]?.feature ?? null;
  }
  search(text:string,limit:number):ParcelSearchResult[] {
    const q=text.toLowerCase(), norm=q.replace(/[^a-z0-9]/g,"");
    const fields=["apn","parcel_id","site_address","owner_name","mailing_address","land_use"] as const;
    const weights=[[1000,920,650],[980,910,640],[780,700,500],[760,690,480],[740,660,440],[520,430,260]];
    const scores=fields.map((f,i)=>`CASE WHEN lower(${f})=$q THEN ${weights[i][0]}
      ${i<2?`WHEN $norm<>'' AND ${i===0?"apn_norm":"parcel_norm"}=$norm THEN ${i===0?990:970}`:""}
      WHEN instr(lower(${f}),$q)=1 THEN ${weights[i][1]}
      ${i<2?`WHEN $norm<>'' AND instr(${i===0?"apn_norm":"parcel_norm"},$norm)=1 THEN ${i===0?900:890}`:""}
      WHEN instr(lower(${f}),$q)>0 THEN ${weights[i][2]} ELSE 0 END`);
    const rows=this.db.prepare(`SELECT payload,${scores.map((s,i)=>`${s} AS s${i}`).join(",")}
      FROM parcels WHERE ${fields.map(f=>`instr(lower(${f}),$q)>0`).join(" OR ")}
      OR ($norm<>'' AND (instr(apn_norm,$norm)=1 OR instr(parcel_norm,$norm)=1))
      ORDER BY max(${scores.join(",")}) DESC, id LIMIT $limit`).all({q,norm,limit});
    return rows.map(r=>{
      const row=decodeParcel(r.payload as Uint8Array);
      const best=fields.reduce((a,_,i)=>Number(r[`s${i}`])>Number(r[`s${a}`])?i:a,0);
      return {...parcelPropertiesFromRow(row),center:parsePoint(row.center),matchKind:fields[best],
        matchLabel:row[fields[best]],rank:Number(r[`s${best}`])};
    });
  }
  tile(z:number,x:number,y:number):Uint8Array|null {
    const longitude=(n:number)=>n/2**z*360-180;
    const latitude=(n:number)=>Math.atan(Math.sinh(Math.PI*(1-2*n/2**z)))*180/Math.PI;
    const pad=64/4096;
    const box:Box=[longitude(x-pad),latitude(y+1+pad),longitude(x+1+pad),latitude(y-pad)];
    const features=this.candidates(box,this.count).map(r=>{
      const row=decodeParcel(r.payload), feature=parcelRowToFeature(row)!;
      return {...feature,properties:{id:row.id,source_key:row.source_key,source_feature_id:row.source_feature_id,
        parcel_id:row.parcel_id,apn:row.apn}};
    });
    if (!features.length) return null;
    const index=new geojsonvt({type:"FeatureCollection",features},{maxZoom:z,indexMaxZoom:0,extent:4096,buffer:64,tolerance:3});
    const tile=index.getTile(z,x,y);
    return tile ? vtpbf.fromGeojsonVt({parcels:tile}) : null;
  }
}
