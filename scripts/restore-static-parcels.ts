import {gzipSync} from "node:zlib";
import { Client } from "pg";
import { loadEnv,getDatabaseConnectionString } from "./load-env";
import { getStaticParcels } from "../src/lib/static-parcels";
import { getPool } from "../src/lib/db";
import { decodeParcel } from "../src/lib/static-parcel-format";
import {openParcelArchive} from "./open-parcel-archive";
loadEnv();

async function main() {
  const store=await getStaticParcels();
  const archive=await openParcelArchive(store.manifest!.version);
  if (!process.argv.includes("--apply")) {
    console.log(`Verified recovery archive: ${store.count} parcels. Use --apply to restore unsaved records into PostGIS.`);
    archive.close();store.close();await getPool().end();return;
  }
  const client=new Client({connectionString:getDatabaseConnectionString() ?? undefined});
  await client.connect();
  try {
    let restored=0;
    for(let offset=0;offset<store.count;offset+=500) {
      const rows=store.db.prepare("SELECT payload FROM parcels ORDER BY n LIMIT 500 OFFSET ?").all(offset)
        .map(r=>{
          const row=decodeParcel(r.payload as Uint8Array);
          const raw=archive.prepare("SELECT raw FROM attributes WHERE id=?").get(row.id);
          if(!raw) throw new Error("Original source attributes missing from archive");
          return {...row,raw_attributes_gzip:raw.raw ? gzipSync(String(raw.raw)).toString("hex") : "1f8b0800000000000213abae050043bfa6a302000000"};
        });
      const result=await client.query(`INSERT INTO parcels(
        id,source_key,source_feature_id,provider,source_county,state,parcel_id,apn,owner_name,site_address,
        mailing_address,acreage,assessed_value,land_use,legal_description,raw_attributes_gzip,geom,created_at,updated_at)
        SELECT id,source_key,source_feature_id,provider,source_county,state,parcel_id,apn,owner_name,site_address,
        mailing_address,acreage,assessed_value,land_use,legal_description,decode(raw_attributes_gzip,'hex'),
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(geometry),4326)),created_at,updated_at
        FROM jsonb_to_recordset($1::jsonb) AS r(id uuid,source_key text,source_feature_id text,provider text,
          source_county text,state text,parcel_id text,apn text,owner_name text,site_address text,mailing_address text,
          acreage numeric,assessed_value numeric,land_use text,legal_description text,raw_attributes_gzip text,
          geometry jsonb,created_at timestamptz,updated_at timestamptz)
        ON CONFLICT(id) DO NOTHING`,[JSON.stringify(rows)]);
      restored+=result.rowCount ?? 0;
    }
    console.log(JSON.stringify({restored,datasetCount:store.count}));
  } finally {await client.end();archive.close();store.close();await getPool().end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
