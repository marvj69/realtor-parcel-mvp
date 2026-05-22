import { bbox as turfBbox, booleanPointInPolygon, point, pointOnFeature } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import type { ParcelFeature, ParcelFeatureCollection, ParcelSearchResult, SavedProjectSummary } from "@/types/parcel";

const DEMO_PARCELS: ParcelFeature[] = [];

function intersectsBbox(feature: ParcelFeature, bbox: [number, number, number, number]) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const [featureMinLng, featureMinLat, featureMaxLng, featureMaxLat] = turfBbox(feature);
  return featureMinLng <= maxLng && featureMaxLng >= minLng && featureMinLat <= maxLat && featureMaxLat >= minLat;
}

export function getDemoParcelCollection(
  bbox: [number, number, number, number],
  limit: number
): ParcelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: DEMO_PARCELS.filter((feature) => intersectsBbox(feature, bbox)).slice(0, limit)
  };
}

export function getDemoParcelByPoint(lng: number, lat: number): ParcelFeature | null {
  const clickedPoint = point([lng, lat]);
  return DEMO_PARCELS.find((feature) =>
    booleanPointInPolygon(clickedPoint, feature as ParcelFeature & { geometry: Polygon | MultiPolygon })
  ) ?? null;
}

export function searchDemoParcels(q: string, limit: number): ParcelSearchResult[] {
  const query = q.toLowerCase();

  return DEMO_PARCELS.filter((feature) => {
    const props = feature.properties;
    return [
      props.parcelId,
      props.apn,
      props.ownerName,
      props.siteAddress,
      props.mailingAddress,
      props.landUse
    ].some((value) => value?.toLowerCase().includes(query));
  })
    .slice(0, limit)
    .map((feature) => ({
      ...feature.properties,
      center: pointOnFeature(feature).geometry
    }));
}

export function hasDemoParcel(id: string) {
  return DEMO_PARCELS.some((feature) => feature.properties.id === id);
}

export function getDemoProjects(): SavedProjectSummary[] {
  const demoParcel = DEMO_PARCELS[0];
  const importedAt = demoParcel?.properties.importedAt ?? new Date(0).toISOString();

  return [
    {
      id: "demo-project",
      name: "Demo Project",
      clientName: "Demo Client",
      description: "Demo fallback project shown when DATABASE_URL is not configured.",
      createdAt: importedAt,
      updatedAt: importedAt,
      savedParcelCount: demoParcel ? 1 : 0,
      savedParcels: demoParcel
        ? [
            {
              id: `demo-save-${demoParcel.properties.id}`,
              projectId: "demo-project",
              label: null,
              tag: "showing",
              createdAt: importedAt,
              parcel: demoParcel.properties,
              center: pointOnFeature(demoParcel).geometry,
              notes: [
                {
                  id: "demo-note-1",
                  note: "Demo note. Configure DATABASE_URL to persist real saved project data.",
                  createdAt: importedAt
                }
              ]
            }
          ]
        : []
    }
  ];
}
