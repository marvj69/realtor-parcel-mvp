import { test } from "node:test";
import assert from "node:assert/strict";
import type { Polygon, Position } from "geojson";
import { measureParcel, measurementAcres, measurementDimensions, measurementFeet } from "../src/lib/parcel-measurements";

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
  const [north, east, south, west] = measured.boundaries[0].sideLengthsFeet;
  near(east, radius * 0.001 * radians / 0.3048, 0.001);
  near(west, east);
  near(north, radius * Math.cos(47.101 * radians) * 0.001 * radians / 0.3048, 0.001);
  near(south, radius * Math.cos(47.1 * radians) * 0.001 * radians / 0.3048, 0.001);
  near(measured.perimeterFeet, north + east + south + west, 0.01);
  assert.deepEqual(measured.boundaries[0].start, [-88.6, 47.101]);
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
  assert.deepEqual(measured.boundaries.map(b => [b.part, b.ring]), [[1, 0], [1, 1]]);
  assert.deepEqual(measured.boundaries[0].sideLengthsFeet, full.boundaries[0].sideLengthsFeet);
  assert.deepEqual(measured.boundaries[1].sideLengthsFeet, excluded.boundaries[0].sideLengthsFeet);
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
  assert.deepEqual(measured.boundaries.map(b => [b.part, b.ring]), [[1, 0], [2, 0]]);
  assert.deepEqual(measured.boundaries[0].sideLengthsFeet, first.boundaries[0].sideLengthsFeet);
  assert.deepEqual(measured.boundaries[1].sideLengthsFeet, second.boundaries[0].sideLengthsFeet);
});

test("irregular parcel area comes from its outline, not the bounding rectangle", () => {
  const triangle = measureParcel({ type: "Polygon", coordinates: [[outer[0], outer[1], outer[2], outer[0]]] })!;
  const full = measureParcel(polygon)!;
  near(triangle.acres, full.acres / 2);
  assert.equal(triangle.boundaries[0].sideLengthsFeet.length, 3);
  assert.ok(triangle.perimeterFeet < full.perimeterFeet);
});

// Independent local-foot fixtures; the geodesic difference is below 0.02 ft here.
const feetPoint = ([x, y]: number[]): Position => [
  -88.6 + x * 0.3048 / (6371008.8 * Math.PI / 180 * Math.cos(47.1 * Math.PI / 180)),
  47.1 + y * 0.3048 / (6371008.8 * Math.PI / 180)
];
const feetRing = (points: number[][]) => [...points, points[0]].map(feetPoint);

test("concave lot lists every side clockwise from northwest, including the closing side", () => {
  const ring = feetRing([[0, 150], [175, 150], [175, 30], [110, 30], [110, 0], [0, 0]]);
  const before = JSON.stringify(ring);
  for (const reversed of [false, true]) {
    const points = reversed ? ring.slice(0, -1).reverse() : ring.slice(0, -1);
    for (let start = 0; start < points.length; start++) {
      const rotated = [...points.slice(start), ...points.slice(0, start), points[start]];
      const measured = measureParcel({ type: "Polygon", coordinates: [rotated] })!;
      assert.deepEqual(measured.boundaries[0].start, feetPoint([0, 150]));
      assert.equal(measurementDimensions(measured.boundaries[0].sideLengthsFeet), "175 × 120 × 65 × 30 × 110 × 150 ft");
      measured.boundaries[0].sideLengthsFeet.forEach((value, i) => near(value, [175, 120, 65, 30, 110, 150][i], 0.02));
      near(measured.boundaries[0].sideLengthsFeet.reduce((sum, value) => sum + value, 0), measured.perimeterFeet);
    }
  }
  assert.equal(JSON.stringify(ring), before);
});

test("redundant points and sub-foot straight-side noise are combined without losing path length", () => {
  for (const ring of [
    feetRing([[0, 100], [50, 100.2], [100, 100], [100, 100], [100, 50], [100, 0], [0, 0], [0, 50], [0, 100]]),
    feetRing([[0, 100], [100, 100], [100, 0], [0, 0], [-0.2, 50]])
  ]) {
    const measured = measureParcel({ type: "Polygon", coordinates: [ring] })!;
    assert.equal(measurementDimensions(measured.boundaries[0].sideLengthsFeet), "100 × 100 × 100 × 100 ft");
    near(measured.boundaries[0].sideLengthsFeet.reduce((sum, value) => sum + value, 0), measured.perimeterFeet);
  }
});

test("northwest starts at a corner of a sloping lot rather than an intermediate GIS point", () => {
  const ring = feetRing([[0, 0], [50, 50], [100, 100], [200, 0], [100, -100]]);
  const measured = measureParcel({ type: "Polygon", coordinates: [ring] })!;
  assert.equal(measured.boundaries[0].sideLengthsFeet.length, 4);
  assert.notDeepEqual(measured.boundaries[0].start, feetPoint([50, 50]));
});

test("curves and small lots retain measurable sides and the complete perimeter", () => {
  for (const ring of [
    feetRing([[0, 100], [25, 110], [50, 115], [75, 110], [100, 100], [100, 0], [0, 0]]),
    feetRing([[0, 0.2], [0.2, 0.2], [0.2, 0], [0, 0]])
  ]) {
    const measured = measureParcel({ type: "Polygon", coordinates: [ring] })!;
    assert.ok(measured.boundaries[0].sideLengthsFeet.length >= 4);
    assert.ok(measured.boundaries[0].sideLengthsFeet.every(value => value > 0));
    near(measured.boundaries[0].sideLengthsFeet.reduce((sum, value) => sum + value, 0), measured.perimeterFeet);
  }
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
  assert.equal(measurementDimensions([175.1, 120.2, 64.8]), "175 × 120 × 65 ft");
  assert.equal(measurementDimensions([1234.6, 0.2, 1234.6]), "1,235 × <1 × 1,235 ft");
});
