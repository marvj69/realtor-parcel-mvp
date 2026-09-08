import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayMoney,
  displayRecordDate,
  displayValue,
  EMPTY_RESULT_FILTERS,
  filterParcelResults,
  parcelsCsv,
  safeSourceUrl
} from "../src/lib/parcel-presentation";
import type { ParcelSearchResult } from "../src/types/parcel";

const base: ParcelSearchResult = {
  id: "fixture",
  sourceKey: "test",
  sourceFeatureId: "1",
  provider: "Test only",
  sourceCounty: "Test county",
  state: "MI",
  parcelId: "00-001",
  apn: "00-001",
  ownerName: "Test Owner",
  siteAddress: "Test fixture",
  mailingAddress: null,
  acreage: null,
  assessedValue: null,
  landUse: null,
  center: null
};
const parcels = [
  { ...base, id: "unknown" },
  { ...base, id: "zero", acreage: 0, assessedValue: 0 },
  { ...base, id: "large", acreage: 10, assessedValue: 5000, landUse: "401" }
];

test("zero is a known value and missing records are never reported as zero", () => {
  assert.equal(displayValue(0), "0");
  assert.equal(displayValue(null), "Not available");
  assert.equal(displayMoney(0), "$0");
  assert.equal(displayMoney(null), "Not available");
});
test("acreage filters exclude unknown values, keep inclusive bounds, and do not alter source ordering", () => {
  assert.deepEqual(
    filterParcelResults(parcels, { ...EMPTY_RESULT_FILTERS, minAcres: "0", maxAcres: "0" }).map((p) => p.id),
    ["zero"]
  );
  assert.deepEqual(
    filterParcelResults(parcels, { ...EMPTY_RESULT_FILTERS, minAcres: "10", maxAcres: "10" }).map((p) => p.id),
    ["large"]
  );
  assert.deepEqual(
    filterParcelResults(parcels, { ...EMPTY_RESULT_FILTERS, sort: "acreage" }).map((p) => p.id),
    ["large", "zero", "unknown"]
  );
  assert.deepEqual(
    parcels.map((p) => p.id),
    ["unknown", "zero", "large"]
  );
});
test("county and source land-use filters combine without guessing missing classes", () => {
  assert.deepEqual(
    filterParcelResults(parcels, { ...EMPTY_RESULT_FILTERS, county: "Test county", landUse: "401" }).map((p) => p.id),
    ["large"]
  );
  assert.equal(filterParcelResults(parcels, { ...EMPTY_RESULT_FILTERS, county: "Different county" }).length, 0);
});
test("CSV keeps provenance and disclaimer while safely escaping quotes and spreadsheet formulas", () => {
  const csv = parcelsCsv([
    {
      ...base,
      ownerName: '=HYPERLINK("https://example.test")',
      siteAddress: 'A, "quoted" address',
      sourceUrl: "https://example.test/source",
      sourceUpdatedAt: "2026-01-01"
    }
  ]);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(csv.includes('"A, ""quoted"" address"'));
  assert.ok(csv.includes("https://example.test/source"));
  assert.ok(csv.includes("2026-01-01"));
  assert.ok(csv.includes("not a legal survey"));
  assert.ok(csv.includes("Assessed value (not market value)"));
});
test("CSV neutralizes leading whitespace and control-character formula prefixes", () => {
  for (const value of ["+1+2", " @SUM(1)", "\t=1+2", "-1+3", "\rtest"])
    assert.ok(parcelsCsv([{ ...base, ownerName: value }]).includes(`"'${value}"`));
});
test("source links permit only HTTP and HTTPS", () => {
  assert.equal(safeSourceUrl("https://example.test/source"), "https://example.test/source");
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "/relative", null, "bad url"])
    assert.equal(safeSourceUrl(url), null);
});

test("record dates keep the source calendar day in western time zones", () => {
  assert.equal(displayRecordDate("2024-01-01T00:00:00Z"), "Jan 1, 2024");
  assert.equal(displayRecordDate("2023-12-31 19:00:00-05"), "Jan 1, 2024");
  assert.equal(displayRecordDate("2026-05-11 20:51:14.70897-04"), "May 12, 2026");
  assert.equal(displayRecordDate("not a date"), "Not available");
});
