import type { DatabaseSync as SQLiteDatabase } from "node:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { booleanPointInPolygon, simplify } from "@turf/turf";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";
import { hasDatabaseConfig } from "./env";
import { decodeParcel, type DatasetManifest, type StoredParcel } from "./static-parcel-format";
import { parcelRowToFeature } from "./parcels";
import type { ParcelFeature } from "../types/parcel";

import { DatabaseSync, dataPath, getParcelManifest, openParcelAsset } from "./static-parcel-assets";
import { ParcelSearch } from "./parcel-search";
import { BoundedCache } from "./bounded-cache";

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
  const manifest = await getParcelManifest();
  const path = await openParcelAsset(manifest, manifest, "runtime");
  const store = new StaticParcelStore(path, manifest);
  if (store.count !== manifest.count) { store.close(); throw new Error("Parcel dataset count mismatch"); }
  return store;
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
  private readonly tiles = new BoundedCache<Uint8Array | null>(256, 16 * 1024 ** 2);
  private searcher: ParcelSearch | undefined;
  constructor(path:string, readonly manifest?:DatasetManifest) {
    this.db=new DatabaseSync(path,{readOnly:true});
    this.db.exec("PRAGMA query_only=ON; PRAGMA cache_size=-16384;");
    this.count = Number(this.db.prepare("SELECT count(*) n FROM parcels").get()!.n);
  }
  close() { this.tiles.clear(); this.db.close(); }
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
  search(text:string,limit:number) {
    this.searcher ??= new ParcelSearch(this.db);
    return this.searcher.search(text, limit);
  }
  tile(z:number,x:number,y:number):Uint8Array|null {
    const key = `${z}/${x}/${y}`;
    const cached = this.tiles.get(key);
    if (cached !== undefined) return cached?.slice() ?? null;
    const longitude=(n:number)=>n/2**z*360-180;
    const latitude=(n:number)=>Math.atan(Math.sinh(Math.PI*(1-2*n/2**z)))*180/Math.PI;
    const pad=64/4096;
    const box:Box=[longitude(x-pad),latitude(y+1+pad),longitude(x+1+pad),latitude(y-pad)];
    const features=this.candidates(box,this.count).map(r=>{
      const row=decodeParcel(r.payload), feature=parcelRowToFeature(row)!;
      return {...feature,properties:{id:row.id,source_key:row.source_key,source_feature_id:row.source_feature_id,
        parcel_id:row.parcel_id,apn:row.apn}};
    });
    if (!features.length) { this.tiles.set(key, null, 0); return null; }
    const index=new geojsonvt({type:"FeatureCollection",features},{maxZoom:z,indexMaxZoom:0,extent:4096,buffer:64,tolerance:3});
    const tile=index.getTile(z,x,y);
    const encoded = tile ? vtpbf.fromGeojsonVt({parcels:tile}) : null;
    this.tiles.set(key, encoded ? Uint8Array.from(encoded) : null, encoded?.byteLength ?? 0);
    return encoded;
  }
}
