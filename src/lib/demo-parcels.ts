import { bbox as turfBbox, booleanPointInPolygon, point, pointOnFeature } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import type { ParcelFeature, ParcelFeatureCollection, ParcelSearchResult, SavedProjectSummary } from "@/types/parcel";

const DEMO_PARCELS: ParcelFeature[] = [
  {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-88.574, 47.124],
        [-88.568, 47.124],
        [-88.568, 47.12],
        [-88.574, 47.12],
        [-88.574, 47.124]
      ]]
    },
    properties: {
      id: "00000000-0000-4000-8000-000000000001",
      sourceKey: "demo-houghton-mi",
      sourceFeatureId: "demo-001",
      provider: "Demo / fictional seed data",
      sourceCounty: "Houghton",
      state: "MI",
      sourceUrl: "db/seed.sql",
      sourceUpdatedAt: null,
      importedAt: "2026-05-10T23:17:00.000Z",
      parcelId: "DEMO-001",
      apn: "00-00-000-001",
      ownerName: "Demo Owner LLC",
      siteAddress: "100 Demo Parcel Rd, Houghton, MI",
      mailingAddress: "PO Box 100, Houghton, MI",
      acreage: 2.65,
      assessedValue: 85000,
      landUse: "Residential vacant",
      legalDescription: "Fictional legal description for app testing."
    }
  }
];

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
  const importedAt = demoParcel.properties.importedAt ?? new Date(0).toISOString();

  return [
    {
      id: "demo-project",
      name: "Demo Project",
      clientName: "Demo Client",
      description: "Demo fallback project shown when DATABASE_URL is not configured.",
      createdAt: importedAt,
      updatedAt: importedAt,
      savedParcelCount: 1,
      savedParcels: [
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
    }
  ];
}
