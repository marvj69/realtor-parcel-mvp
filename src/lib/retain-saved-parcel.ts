import type { PoolClient } from "pg";
import { getStaticParcels, hasStaticParcels } from "./static-parcels";

// Keep just the parcels people save in Neon. UUIDs and the existing FK remain intact.
// Validate against the trusted dataset rather than accepting client-supplied parcel details.
export async function retainSavedParcel(client:PoolClient,id:string):Promise<boolean> {
  if (!hasStaticParcels()) return true;
  const row=(await getStaticParcels()).get(id);
  if (!row) return false;
  await client.query(`INSERT INTO parcels (
    id,source_key,source_feature_id,provider,source_county,state,parcel_id,apn,owner_name,
    site_address,mailing_address,acreage,assessed_value,land_use,legal_description,
    raw_attributes_gzip,geom,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,decode($16,'hex'),
      ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($17),4326)),$18,$19)
    ON CONFLICT(id) DO NOTHING`,[
    row.id,row.source_key,row.source_feature_id,row.provider,row.source_county,row.state,
    row.parcel_id,row.apn,row.owner_name,row.site_address,row.mailing_address,row.acreage,
    row.assessed_value,row.land_use,row.legal_description,row.raw_attributes_gzip ?? "1f8b0800000000000213abae050043bfa6a302000000",
    JSON.stringify(row.geometry),row.created_at,row.updated_at
  ]);
  return true;
}
