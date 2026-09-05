import assert from "node:assert/strict";
import { loadEnv } from "./load-env";
import { query,getPool } from "../src/lib/db";
import { getStaticParcels } from "../src/lib/static-parcels";
import { openParcelArchive } from "./open-parcel-archive";
loadEnv();

async function main() {
  const start=Date.now(), store=await getStaticParcels();
  const archive=await openParcelArchive(store.manifest!.version);
  try {
    const sources=await query<{source_key:string;n:string}>("SELECT source_key,count(*)::text n FROM parcels GROUP BY source_key ORDER BY source_key");
    assert.deepEqual(Object.fromEntries(sources.map(r=>[r.source_key,Number(r.n)])),store.manifest!.sourceCounts);
    let samples=0;
    for(const source of sources) {
      const rows=await query<{id:string;apn:string;lng:number;lat:number}>(`SELECT id::text,apn,
        ST_X(ST_PointOnSurface(geom)) lng,ST_Y(ST_PointOnSurface(geom)) lat
        FROM parcels WHERE source_key=$1 ORDER BY id LIMIT 3`,[source.source_key]);
      for(const row of rows) {
        assert.equal(store.get(row.id)?.apn,row.apn);
        assert.ok(archive.prepare("SELECT id FROM attributes WHERE id=?").get(row.id));
        const expected=await query<{id:string}>(`SELECT id::text FROM parcels
          WHERE ST_Intersects(geom,ST_SetSRID(ST_Point($1,$2),4326))
          ORDER BY (owner_name IS NULL), (apn IS NULL AND parcel_id IS NULL), (site_address IS NULL),
          ST_Area(ST_Transform(geom,3857)) LIMIT 1`,[row.lng,row.lat]);
        assert.equal(store.lookup(row.lng,row.lat)?.properties.id,expected[0]?.id);
        const box:[number,number,number,number]=[row.lng-.001,row.lat-.001,row.lng+.001,row.lat+.001];
        const count=await query<{n:string}>("SELECT count(*)::text n FROM parcels WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326) AND ST_XMin(geom)<=$3 AND ST_XMax(geom)>=$1 AND ST_YMin(geom)<=$4 AND ST_YMax(geom)>=$2",box);
        assert.equal(store.countBbox(box),Number(count[0].n));
        if(row.apn && row.apn.length>=2) assert.ok(store.search(row.apn,50).some(r=>r.apn===row.apn));
        samples++;
      }
    }
    console.log(JSON.stringify({verified:true,parcels:store.count,sources:sources.length,samples,elapsedMs:Date.now()-start}));
  } finally {archive.close();store.close();await getPool().end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
