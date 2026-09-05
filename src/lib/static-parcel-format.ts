import { gunzipSync, gzipSync } from "node:zlib";
import type { ParcelRow } from "../types/parcel";

export type StoredParcel = ParcelRow & {
  raw_attributes_gzip?: string | null;
  created_at: string;
  updated_at: string;
};

export type DatasetManifest = {
  format: 1;
  version: string;
  createdAt: string;
  count: number;
  sourceCounts: Record<string, number>;
  sqliteBytes: number;
  sha256: string;
  parts: string[];
  iv: string;
  tag: string;
};

const packedFields = ["id","source_key","source_feature_id","provider","source_county","state",
  "source_url","source_updated_at","imported_at","parcel_id","apn","owner_name","site_address",
  "mailing_address","acreage","assessed_value","land_use","legal_description","geometry","center",
  "created_at","updated_at"] as const;

// A fixed field order avoids repeating JSON keys in every compressed parcel.
// Coordinates and all field values are preserved without rounding/simplification.
export function encodeRuntimeParcel(row:StoredParcel):Buffer {
  return Buffer.concat([Buffer.from("P"),gzipSync(JSON.stringify(packedFields.map(k=>row[k] ?? null)))]);
}
export function decodeParcel(blob: Uint8Array): StoredParcel {
  if(blob[0]===80) {
    const values=JSON.parse(gunzipSync(blob.subarray(1)).toString("utf8"));
    return Object.fromEntries(packedFields.map((k,i)=>[k,values[i]])) as StoredParcel;
  }
  return JSON.parse(gunzipSync(blob).toString("utf8"));
}
