import { area, distance, length, lineString } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";

export type ParcelMeasurements = {
  acres: number;
  perimeterFeet: number;
  eastWestFeet: number;
  northSouthFeet: number;
};

// Use the selected geometry, never the recorded acreage or clipped map tiles.
export function measureParcel(geometry: Polygon | MultiPolygon | null | undefined): ParcelMeasurements | null {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!polygons.length) return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  let squareMeters = 0, perimeterFeet = 0;

  for (const rings of polygons) {
    if (!rings.length) return null;
    for (const ring of rings) {
      if (ring.length < 4) return null;
      for (const [lng, lat] of ring) {
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
        west = Math.min(west, lng);
        east = Math.max(east, lng);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
      const first = ring[0], last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) return null;
      perimeterFeet += length(lineString(ring), { units: "feet" });
    }
    // Turf subtracts interior holes and handles either ring winding direction.
    const polygonArea = area({ type: "Polygon", coordinates: rings });
    if (!Number.isFinite(polygonArea) || polygonArea <= 0) return null;
    squareMeters += polygonArea;
  }

  // These local-market spans do not support geometries crossing the antimeridian.
  if (east - west >= 180 || east <= west || north <= south) return null;
  const midLat = (south + north) / 2, midLng = (west + east) / 2;
  return {
    acres: squareMeters / 4046.8564224,
    perimeterFeet,
    eastWestFeet: distance([west, midLat], [east, midLat], { units: "feet" }),
    northSouthFeet: distance([midLng, south], [midLng, north], { units: "feet" })
  };
}

export function measurementFeet(value: number) {
  return value < 1 ? "<1 ft" : `${Math.round(value).toLocaleString("en-US")} ft`;
}

export function measurementAcres(value: number) {
  return value < 0.01 ? "<0.01 acres" : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} acres`;
}
