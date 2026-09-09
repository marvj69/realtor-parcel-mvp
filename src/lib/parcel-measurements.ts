import { area, distance, length, lineString, simplify } from "@turf/turf";
import type { MultiPolygon, Polygon, Position } from "geojson";

export type BoundaryDimensions = {
  part: number;
  ring: number;
  start: Position;
  sideLengthsFeet: number[];
};

export type ParcelMeasurements = {
  acres: number;
  perimeterFeet: number;
  boundaries: BoundaryDimensions[];
};

const FEET_PER_DEGREE = 6371008.8 * Math.PI / 180 / 0.3048;
const CORNER_TOLERANCE_FEET = 1;
const coordinateKey = (point: Position) => `${point[0]},${point[1]}`;

function measureBoundary(ring: Position[]): Pick<BoundaryDimensions, "start" | "sideLengthsFeet"> | null {
  let vertices = ring.slice(0, -1).filter((point, i, points) =>
    i === 0 || coordinateKey(point) !== coordinateKey(points[i - 1]));
  if (vertices.length > 1 && coordinateKey(vertices[0]) === coordinateKey(vertices[vertices.length - 1])) vertices.pop();
  if (vertices.length < 3) return null;
  let west = Infinity, north = -Infinity, south = Infinity;
  for (const [lng, lat] of vertices) {
    west = Math.min(west, lng);
    north = Math.max(north, lat);
    south = Math.min(south, lat);
  }
  const xScale = Math.cos((north + south) / 2 * Math.PI / 180) * FEET_PER_DEGREE;
  const project = ([lng, lat]: Position) => [(lng - west) * xScale, (lat - north) * FEET_PER_DEGREE];
  const signedArea = vertices.reduce((sum, point, i) => {
    const [x, y] = project(point), [nextX, nextY] = project(vertices[(i + 1) % vertices.length]);
    return sum + x * nextY - nextX * y;
  }, 0);
  if (!Number.isFinite(signedArea) || signedArea === 0) return null;
  if (signedArea > 0) vertices.reverse();

  // Anchor simplification consistently, regardless of the source's start or winding.
  const anchor = vertices.reduce((best, point, i) =>
    point[0] < vertices[best][0] || (point[0] === vertices[best][0] && point[1] > vertices[best][1]) ? i : best, 0);
  vertices = [...vertices.slice(anchor), ...vertices.slice(0, anchor)];
  const projected = vertices.map(project);
  const simple = simplify(lineString([...projected, projected[0]]), {
    tolerance: CORNER_TOLERANCE_FEET, highQuality: true
  });
  const cornerKeys = new Set(simple.geometry.coordinates.map(coordinateKey));
  let corners = vertices.map((_, i) => i).filter(i => cornerKeys.has(coordinateKey(projected[i])));
  // A closed-line simplifier always keeps its start; remove that seam if it lies
  // on a nearly straight side, checking every original point across the seam.
  if (corners.length > 3 && corners[0] === 0) {
    const previous = corners[corners.length - 1], next = corners[1];
    const [x, y] = projected[previous];
    const dx = projected[next][0] - x, dy = projected[next][1] - y;
    const squaredLength = dx * dx + dy * dy;
    let straight = squaredLength > 0;
    for (let i = previous; straight && i !== next; i = (i + 1) % vertices.length) {
      const px = projected[i][0] - x, py = projected[i][1] - y;
      const fraction = Math.max(0, Math.min(1, (px * dx + py * dy) / squaredLength));
      straight = Math.hypot(px - fraction * dx, py - fraction * dy) <= CORNER_TOLERANCE_FEET;
    }
    if (straight) corners = corners.slice(1);
  }
  // Retain all vertices when a very small/narrow boundary would collapse.
  if (corners.length < 3) corners = vertices.map((_, i) => i);

  // Northwest means the retained corner nearest this ring's northwest bounds.
  const northwest = corners.reduce((best, index, i) => {
    const [x, y] = projected[index], [bestX, bestY] = projected[corners[best]];
    const delta = x * x + y * y - bestX * bestX - bestY * bestY;
    return delta < 0 || (delta === 0 && (y > bestY || (y === bestY && x < bestX))) ? i : best;
  }, 0);
  corners = [...corners.slice(northwest), ...corners.slice(0, northwest)];
  const edgeFeet = vertices.map((point, i) => distance(point, vertices[(i + 1) % vertices.length], { units: "feet" }));
  const sideLengthsFeet = corners.map((corner, i) => {
    const end = corners[(i + 1) % corners.length];
    let feet = 0;
    // Measure the original path between corners, including bends in curved sides.
    for (let edge = corner; edge !== end; edge = (edge + 1) % vertices.length) feet += edgeFeet[edge];
    return feet;
  });
  return { start: [...vertices[corners[0]]], sideLengthsFeet };
}

// Use the selected geometry, never the recorded acreage or clipped map tiles.
export function measureParcel(geometry: Polygon | MultiPolygon | null | undefined): ParcelMeasurements | null {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!polygons.length) return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  let squareMeters = 0, perimeterFeet = 0;
  const boundaries: BoundaryDimensions[] = [];

  for (const [part, rings] of polygons.entries()) {
    if (!rings.length) return null;
    for (const [ringIndex, ring] of rings.entries()) {
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
      const dimensions = measureBoundary(ring);
      if (!dimensions) return null;
      boundaries.push({ part: part + 1, ring: ringIndex, ...dimensions });
    }
    // Turf subtracts interior holes and handles either ring winding direction.
    const polygonArea = area({ type: "Polygon", coordinates: rings });
    if (!Number.isFinite(polygonArea) || polygonArea <= 0) return null;
    squareMeters += polygonArea;
  }

  // These local-market calculations do not support crossing the antimeridian.
  if (east - west >= 180 || east <= west || north <= south) return null;
  return {
    acres: squareMeters / 4046.8564224,
    perimeterFeet,
    boundaries
  };
}

export function measurementFeet(value: number) {
  return value < 1 ? "<1 ft" : `${Math.round(value).toLocaleString("en-US")} ft`;
}

export function measurementDimensions(sideLengthsFeet: number[]) {
  return `${sideLengthsFeet.map(value => value < 1 ? "<1" : Math.round(value).toLocaleString("en-US")).join(" × ")} ft`;
}

export function measurementAcres(value: number) {
  return value < 0.01 ? "<0.01 acres" : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} acres`;
}
