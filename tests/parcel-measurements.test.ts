import { test } from "node:test";
import assert from "node:assert/strict";
import type { Polygon, Position } from "geojson";
import { measureParcel, measurementAcres, measurementFeet } from "../src/lib/parcel-measurements";

const rectangle = (west: number, south: number, east: number, north: number): Position[] =>
  [[west, south], [east, south], [east, north], [west, north], [west, south]];
const outer = rectangle(-88.6, 47.1, -88.599, 47.101);
const polygon: Polygon = { type: "Polygon", coordinates: [outer] };

function near(actual: number, expected: number, tolerance = 0.000001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

test("Michigan rectangle calculates geodesic area and feet, independently of source acreage", () => {
  const measured = measureParcel(polygon)!;
  // Independent spherical rectangle formula; latitude matters for longitude distances.
  const radius = 6371008.8, radians = Math.PI / 180;
  const expectedArea = radius ** 2 * (0.001 * radians) *
    (Math.sin(47.101 * radians) - Math.sin(47.1 * radians));
  near(measured.acres, expectedArea / 4046.8564224);
  near(measured.northSouthFeet, radius * 0.001 * radians / 0.3048, 0.001);
  near(measured.eastWestFeet, radius * Math.cos(47.1005 * radians) * 0.001 * radians / 0.3048, 0.001);
  near(measured.perimeterFeet, 2 * (measured.eastWestFeet + measured.northSouthFeet), 0.01);
  assert.ok(measured.acres > 2 && measured.acres < 2.1);
});

test("holes subtract acreage and add their boundary length, regardless of winding", () => {
  const hole = rectangle(-88.5998, 47.1002, -88.5992, 47.1008);
  const original = JSON.stringify(polygon);
  const full = measureParcel(polygon)!;
  const excluded = measureParcel({ type: "Polygon", coordinates: [hole] })!;
  const measured = measureParcel({ type: "Polygon", coordinates: [outer, hole] })!;
  near(measured.acres, full.acres - excluded.acres);
  near(measured.perimeterFeet, full.perimeterFeet + excluded.perimeterFeet);
  assert.deepEqual(measured, measureParcel({ type: "Polygon", coordinates: [[...outer].reverse(), [...hole].reverse()] }));
  assert.equal(JSON.stringify(polygon), original);
});

test("multipart parcels sum areas and perimeters without connecting separate pieces", () => {
  const other = rectangle(-88.59, 47.1, -88.589, 47.101);
  const first = measureParcel(polygon)!;
  const second = measureParcel({ type: "Polygon", coordinates: [other] })!;
  const measured = measureParcel({ type: "MultiPolygon", coordinates: [[outer], [other]] })!;
  near(measured.acres, first.acres + second.acres);
  near(measured.perimeterFeet, first.perimeterFeet + second.perimeterFeet);
  assert.ok(measured.eastWestFeet > first.eastWestFeet * 10);
  near(measured.northSouthFeet, first.northSouthFeet);
});

test("irregular parcel area comes from its outline, not the bounding rectangle", () => {
  const triangle = measureParcel({ type: "Polygon", coordinates: [[outer[0], outer[1], outer[2], outer[0]]] })!;
  const full = measureParcel(polygon)!;
  near(triangle.acres, full.acres / 2);
  near(triangle.eastWestFeet, full.eastWestFeet);
  assert.ok(triangle.perimeterFeet < full.perimeterFeet);
});

test("unusable geometry returns unavailable instead of zero or misleading measurements", () => {
  for (const geometry of [
    null,
    { type: "Polygon", coordinates: [] },
    { type: "MultiPolygon", coordinates: [] },
    { type: "Polygon", coordinates: [[]] },
    { type: "Polygon", coordinates: [outer.slice(0, -1)] },
    { type: "Polygon", coordinates: [rectangle(0, 0, 0, 1)] },
    { type: "Polygon", coordinates: [rectangle(NaN, 0, 1, 1)] },
    { type: "Polygon", coordinates: [rectangle(0, 90, 1, 91)] },
    { type: "Polygon", coordinates: [rectangle(-179, 0, 179, 1)] }
  ] as Parameters<typeof measureParcel>[0][]) {
    assert.equal(measureParcel(geometry), null);
  }
});

test("approximate formatting uses acres and whole feet without rounding tiny parcels to zero", () => {
  assert.equal(measurementAcres(1.23456), "1.23 acres");
  assert.equal(measurementAcres(0.001), "<0.01 acres");
  assert.equal(measurementFeet(1234.6), "1,235 ft");
  assert.equal(measurementFeet(0.2), "<1 ft");
});
