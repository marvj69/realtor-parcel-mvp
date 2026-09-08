import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { BoundedCache } from "../src/lib/bounded-cache";
import { ParcelSearch } from "../src/lib/parcel-search";
import { buildParcelSearchIndex } from "../scripts/build-parcel-search";

test("cache enforces both bounds, refreshes recency, and preserves cached empty results", () => {
  const cache = new BoundedCache<string | null>(2, 10);
  cache.set("empty", null, 0);
  cache.set("a", "first", 5);
  assert.equal(cache.get("empty"), null);
  cache.set("b", "second", 6);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("empty"), null);
  cache.set("large", "oversized", 11);
  assert.equal(cache.get("large"), undefined);
  cache.set("b", "replace", 4);
  cache.set("c", "third", 6);
  assert.equal(cache.get("empty"), undefined);
  assert.equal(cache.get("b"), "replace");
  cache.clear();
  assert.equal(cache.get("b"), undefined);
});

const directory = mkdtempSync(join(tmpdir(), "parcel-search-test-"));
const sourcePath = join(directory, "source.sqlite");
const source = new DatabaseSync(sourcePath);
source.exec(`CREATE TABLE parcels(n INTEGER PRIMARY KEY,id TEXT,payload BLOB,
  apn TEXT,parcel_id TEXT,site_address TEXT,owner_name TEXT,mailing_address TEXT,land_use TEXT,
  apn_norm TEXT,parcel_norm TEXT)`);
const put = source.prepare("INSERT INTO parcels VALUES(?,?,?,?,?,?,?,?,?,?,?)");
const owners = ['Heinonen', 'EXAMPLE OWNER', 'O"Brien', '100% Trust', 'A_B', 'José', 'AB HOLDINGS'];
for (let i = 0; i < 100; i++) {
  const apn = i < 2 ? ["AB-12-34", "AB-12-345"][i] : `044-127-${String(i).padStart(3, "0")}-00`;
  const parcel = { id: String(i), source_key: "test", source_feature_id: String(i), provider: "fixture",
    source_county: "Test", state: "MI", apn, parcel_id: apn, owner_name: owners[i % owners.length],
    site_address: `${i} Lake Linden Road`, mailing_address: i % 3 ? "PO Box 12" : null,
    land_use: i % 2 ? "RESIDENTIAL" : null, acreage: i, assessed_value: 0,
    geometry: null, center: {type: "Point", coordinates: [-88,47]} };
  const norm = apn.toLowerCase().replace(/[^a-z0-9]/g, "");
  put.run(i + 1, parcel.id, gzipSync(JSON.stringify(parcel)), apn, apn, parcel.site_address,
    parcel.owner_name, parcel.mailing_address, parcel.land_use, norm, norm);
}
let indexedDb: DatabaseSync;
let indexed: ParcelSearch;
const original = new ParcelSearch(source);
before(async () => {
  assert.equal(await buildParcelSearchIndex(sourcePath, join(directory, "search.sqlite")), 100);
  indexedDb = new DatabaseSync(join(directory, "search.sqlite"), { readOnly: true });
  indexed = new ParcelSearch(indexedDb, true);
});
after(() => { indexedDb?.close(); source.close(); rmSync(directory, { recursive: true, force: true }); });

test("indexed search exactly preserves ranking, provenance, numeric zero, punctuation, and short/Unicode matches", () => {
  const queries = ["Heinonen", "EXAMPLE", "Lake Linden", "Linden Road", "PO Box", "RESIDENTIAL",
    "044127", "044-127-01", "AB1234", "AB-12-34", "AB", "12", "A_B", "100%", "O\"Brien", "José",
    "%' OR 1=1 --", "*", "_", "a-", "\" OR \"", "res", "lAkE", "NO SUCH OWNER", "\u0000"];
  for (const query of queries) for (const limit of [1, 8, 50]) {
    assert.deepEqual(indexed.search(query, limit), original.search(query, limit), `${query} limit=${limit}`);
  }
});

test("cached search results cannot be changed by a caller and limits have separate cache entries", () => {
  const first = indexed.search("Lake Linden", 8);
  first[0].ownerName = "changed";
  first[0].center!.coordinates[0] = 0;
  first.pop();
  assert.deepEqual(indexed.search("Lake Linden", 8), original.search("Lake Linden", 8));
  assert.equal(indexed.search("Lake Linden", 1).length, 1);
});
