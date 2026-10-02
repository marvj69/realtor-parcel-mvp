import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayMoney,
  displayRecordDate,
  displayValue,
  EMPTY_RESULT_FILTERS,
  filterParcelResults,
  formatAddress,
  matchKindLabel,
  ownerMailingHint,
  parcelsCsv,
  parcelTitle,
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

test("address display drops empty and zero segments without inventing parts", () => {
  assert.equal(formatAddress(","), null);
  assert.equal(formatAddress(", MI"), null);
  assert.equal(formatAddress("0"), null);
  assert.equal(formatAddress(null), null);
  assert.equal(formatAddress("VACANT LAND,"), "Vacant Land");
  assert.equal(formatAddress("FIRST & SECOND, , MI"), "First & Second, MI");
  assert.equal(formatAddress("PO BOX 12, SAMPLETOWN, MI, 0"), "PO Box 12, Sampletown, MI");
});
test("address display joins state and ZIP and title-cases only all-caps words", () => {
  assert.equal(formatAddress("100 S 10TH ST, SAMPLETOWN, MI, 49800"), "100 S 10th St, Sampletown, MI 49800");
  assert.equal(formatAddress("N-1234  TEST LAKE RD"), "N-1234 Test Lake Rd");
  assert.equal(formatAddress("N1200 HWY M-35, SAMPLETOWN, MI, 49800"), "N1200 Hwy M-35, Sampletown, MI 49800");
  assert.equal(formatAddress("12 MCTEST AVE, Mixed Case Town, MI 49800-1234"), "12 McTest Ave, Mixed Case Town, MI 49800-1234");
  assert.equal(formatAddress("5 O'TEST ST, LAKE'S EDGE, WI 53000"), "5 O'Test St, Lake's Edge, WI 53000");
  // A street-line suffix that matches a state code (CT = court) is not treated as a state.
  assert.equal(formatAddress("40 SAMPLE CT"), "40 Sample Ct");
  assert.equal(formatAddress("P.O. BOX 7, TESTVILLE, MN, 0"), "P.O. Box 7, Testville, MN");
  assert.equal(formatAddress("PO BOX11"), "PO Box11");
  assert.equal(formatAddress("300 TEST ST STE#16"), "300 Test St Ste#16");
  assert.equal(formatAddress("1 US HWY-2"), "1 US Hwy-2");
  assert.equal(formatAddress("CO RD 500/TEST LN"), "Co Rd 500/Test Ln");
  assert.equal(formatAddress("40A-STATE RD"), "40A-State Rd");
});
test("parcel titles use the cleaned address and fall back to identifiers", () => {
  assert.equal(parcelTitle({ ...base, siteAddress: "1 TEST ST" }), "1 Test St");
  assert.equal(parcelTitle({ ...base, siteAddress: "," }), "00-001");
});
test("mailing hints flag out-of-state and different street addresses only", () => {
  const hint = (siteAddress: string | null, mailingAddress: string | null, state = "MI") =>
    ownerMailingHint({ siteAddress, mailingAddress, state })?.kind ?? null;
  assert.equal(hint("10 TEST RD", "10 TEST ROAD, SAMPLETOWN, MI 49800"), null);
  assert.equal(hint("10 TEST ST", "10 TEST ST., SAMPLETOWN, MI 49800"), null);
  assert.equal(hint("N 1234 TEST DR", "N1234 TEST DR, SAMPLETOWN, MI 49800-1234"), null);
  assert.equal(hint("W 5532 CR 300", "W5532 CO RD 300, SAMPLETOWN, MI 49800"), null);
  assert.equal(hint("8 LAKE STREET - TOWN", "8 LAKE STREET, Sampletown, MI, 49800"), null);
  assert.equal(hint("1800 7TH AVE", "1800 SEVENTH AVE, SAMPLETOWN, MI 49800"), null);
  assert.equal(hint("12 W SAMPLE AVE", "12 SAMPLE AVE, SAMPLETOWN, MI 49800"), null);
  assert.equal(hint("13000 M-28", "13000 E HWY M-28, SAMPLETOWN, MI, 49800"), null);
  assert.equal(hint("16000 US 45", "16000 US HIGHWAY 45 N, SAMPLETOWN, MI, 49800"), null);
  assert.equal(hint("15000 LAKE SAMPLLE RD", "15000 LAKE SAMPLE RD, SAMPLETOWN, MI, 49800"), null);
  assert.equal(hint("400 N 6TH ST", "400 N SIXTH ST APT C, SAMPLETOWN, MI, 49800"), null);
  assert.equal(hint("10 TEST RD", "99 OTHER AVE, SAMPLETOWN, MI, 49800"), "differs");
  assert.equal(hint("400 TEST ST", "402 TEST ST, SAMPLETOWN, MI, 49800"), "differs");
  assert.equal(hint("100 5TH ST", "100 9TH ST, SAMPLETOWN, MI, 49800"), "differs");
  assert.equal(hint("10 TEST RD", "10 TEST RD, ELSEWHERE, WI, 53000"), "out-of-state");
  assert.equal(hint(null, "1 SAMPLE AVE, ELSEWHERE, MN, 0"), "out-of-state");
  // A PO box, an unnumbered site, or missing data is not evidence either way.
  assert.equal(hint("10 TEST RD", "PO BOX 5, SAMPLETOWN, MI 49800"), null);
  assert.equal(hint("TEST VALLEY RD", "44 TEST RD"), null);
  assert.equal(hint("2900 10TH ST", "10TH ST, SAMPLETOWN, MI 49800"), null);
  assert.equal(hint("10 TEST RD", null), null);
  assert.equal(hint("10 TEST RD", "0"), null);
  assert.equal(hint("10 TEST RD", "10 TEST RD, ELSEWHERE, WI 53000", ""), null);
});
test("mailing filter keeps hinted results and never matches missing mailing data", () => {
  const rows = [
    { ...base, id: "same", siteAddress: "1 A ST", mailingAddress: "1 A ST, TOWN, MI 49800" },
    { ...base, id: "local", siteAddress: "1 A ST", mailingAddress: "2 B ST, TOWN, MI 49800" },
    { ...base, id: "away", siteAddress: "1 A ST", mailingAddress: "2 B ST, TOWN, WI 53000" },
    { ...base, id: "none", siteAddress: "1 A ST", mailingAddress: null }
  ];
  assert.deepEqual(
    filterParcelResults(rows, { ...EMPTY_RESULT_FILTERS, mailing: "differs" }).map((p) => p.id),
    ["local", "away"]
  );
  assert.deepEqual(
    filterParcelResults(rows, { ...EMPTY_RESULT_FILTERS, mailing: "out-of-state" }).map((p) => p.id),
    ["away"]
  );
});
test("match labels explain why a search result matched", () => {
  assert.equal(matchKindLabel("owner_name"), "Owner match");
  assert.equal(matchKindLabel("site_address"), "Address match");
  assert.equal(matchKindLabel(null), null);
});
