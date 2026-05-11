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
  matchKind?: "parcel_id" | "apn" | "owner_name" | "site_address" | "mailing_address" | "land_use" | null;
  matchLabel?: string | null;
  rank?: number | null;
};

export type SavedParcelNote = {
  id: string;
  note: string;
  createdAt: string | null;
};

export type SavedParcelSummary = {
  id: string;
  projectId: string;
  label: string | null;
  tag: string | null;
  createdAt: string | null;
  parcel: ParcelProperties;
  center: Point | null;
  notes: SavedParcelNote[];
};

export type SavedProjectSummary = {
  id: string;
  name: string;
  clientName: string | null;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  savedParcelCount: number;
  savedParcels: SavedParcelSummary[];
};

export type ProjectsResponseData = {
  projects: SavedProjectSummary[];
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
