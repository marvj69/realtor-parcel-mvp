import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";

export type ParcelProperties = {
  id: string;
  sourceKey: string;
  sourceFeatureId: string;
  provider: string | null;
  sourceCounty: string | null;
  state: string | null;
  sourceUrl?: string | null;
  sourceUpdatedAt?: string | null;
  importedAt?: string | null;
  parcelId: string | null;
  apn: string | null;
  ownerName: string | null;
  siteAddress: string | null;
  mailingAddress: string | null;
  acreage: number | null;
  assessedValue: number | null;
  landUse: string | null;
  legalDescription?: string | null;
};

export type ParcelFeature = Feature<Polygon | MultiPolygon, ParcelProperties>;
export type ParcelFeatureCollection = FeatureCollection<Polygon | MultiPolygon, ParcelProperties>;

export type ParcelSearchResult = ParcelProperties & {
  center: Point | null;
};

export type ParcelRow = {
  id: string;
  source_key: string;
  source_feature_id: string;
  provider: string | null;
  source_county: string | null;
  state: string | null;
  source_url?: string | null;
  source_updated_at?: string | null;
  imported_at?: string | null;
  parcel_id: string | null;
  apn: string | null;
  owner_name: string | null;
  site_address: string | null;
  mailing_address: string | null;
  acreage: string | number | null;
  assessed_value: string | number | null;
  land_use: string | null;
  legal_description?: string | null;
  geometry?: string | Polygon | MultiPolygon | null;
  center?: string | Point | null;
};
