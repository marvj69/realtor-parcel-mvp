import type { ParcelFeatureCollection } from "@/types/parcel";

export type OfflineAreaBbox = [number, number, number, number];

export type OfflineArea = {
  id: string;
  name: string;
  bbox: OfflineAreaBbox;
  zoom: number;
  parcelCount: number;
  featureCollection: ParcelFeatureCollection;
  downloadedAt: string;
  storageBytes: number;
};

export type OfflineAreaSummary = Omit<OfflineArea, "featureCollection">;
