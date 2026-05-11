import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type { ParcelFeature, ParcelFeatureCollection, ParcelProperties, ParcelRow } from "@/types/parcel";

function parseJsonGeometry<T>(value: string | T | null | undefined): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value;
}

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parcelPropertiesFromRow(row: ParcelRow): ParcelProperties {
  return {
    id: row.id,
    sourceKey: row.source_key,
    sourceFeatureId: row.source_feature_id,
    provider: row.provider,
    sourceCounty: row.source_county,
    state: row.state,
    sourceUrl: row.source_url ?? null,
    sourceUpdatedAt: row.source_updated_at ?? null,
    importedAt: row.imported_at ?? null,
    parcelId: row.parcel_id,
    apn: row.apn,
    ownerName: row.owner_name,
    siteAddress: row.site_address,
    mailingAddress: row.mailing_address,
    acreage: nullableNumber(row.acreage),
    assessedValue: nullableNumber(row.assessed_value),
    landUse: row.land_use,
    legalDescription: row.legal_description ?? null
  };
}

export function parcelRowToFeature(row: ParcelRow): ParcelFeature | null {
  const geometry = parseJsonGeometry<Polygon | MultiPolygon>(row.geometry);
  if (!geometry) return null;

  return {
    type: "Feature",
    geometry,
    properties: parcelPropertiesFromRow(row)
  };
}

export function parcelRowsToFeatureCollection(rows: ParcelRow[]): ParcelFeatureCollection {
  const features = rows
    .map(parcelRowToFeature)
    .filter((feature): feature is ParcelFeature => Boolean(feature));

  return {
    type: "FeatureCollection",
    features
  } satisfies FeatureCollection<Polygon | MultiPolygon, ParcelProperties>;
}

export function parsePoint(value: string | Point | null | undefined): Point | null {
  return parseJsonGeometry<Point>(value);
}
