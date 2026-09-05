// Export only public-source parcel records, never accounts, projects, notes, or credentials.
import { DatabaseSync } from "node:sqlite";
import { Client } from "pg";
import { mkdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { loadEnv, getDatabaseConnectionString } from "./load-env";
import type { StoredParcel } from "../src/lib/static-parcel-format";

import { packageStaticDataset } from "./package-static-dataset";

loadEnv();
async function main() {
  const version = new Date().toISOString().replace(/[^0-9]/g, "");
  const work = `work/parcel-export-${version}`;
  await mkdir(work, { recursive: true, mode: 0o700 });
  await mkdir("data/static-parcels", { recursive: true });
  const client = new Client({ connectionString: getDatabaseConnectionString() ?? undefined });
  await client.connect();
  const db = new DatabaseSync(`${work}/parcels.sqlite`);
  const sourceCounts: Record<string, number> = {};
  let count = 0;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const expected = Number((await client.query("SELECT count(*) FROM parcels")).rows[0].count);
    // A pruned production DB is not an import source. Refresh using a scratch PostGIS DB.
    const existing = await readFile("data/static-parcels/manifest.json", "utf8").catch(() => null);
    if (existing && expected < JSON.parse(existing).count && !process.argv.includes("--allow-smaller-dataset")) {
      throw new Error("Refusing smaller export. Use a complete scratch import DB; review intentional reductions explicitly.");
    }
    db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
      CREATE TABLE parcels (n INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL,
        source_key TEXT NOT NULL, source_feature_id TEXT NOT NULL, payload BLOB NOT NULL,
        parcel_id TEXT, apn TEXT, owner_name TEXT, site_address TEXT, mailing_address TEXT, land_use TEXT,
        parcel_norm TEXT, apn_norm TEXT, area REAL NOT NULL, west REAL, south REAL, east REAL, north REAL);
      CREATE VIRTUAL TABLE bounds USING rtree(n,west,east,south,north);`);
    const insert = db.prepare("INSERT INTO parcels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const spatial = db.prepare("INSERT INTO bounds VALUES (?,?,?,?,?)");
    const legacy = (await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parcels' AND column_name='raw'")).rowCount;
    await client.query(`DECLARE export_parcels NO SCROLL CURSOR FOR
      SELECT p.id::text, p.source_key,p.source_feature_id,p.provider,p.source_county,p.state,
        p.parcel_id,p.apn,p.owner_name,p.site_address,p.mailing_address,p.acreage,p.assessed_value,
        p.land_use,p.legal_description, encode(p.raw_attributes_gzip,'hex') AS raw_attributes_gzip,
        p.created_at::text,p.updated_at::text, ${legacy ? 'p.raw' : 'NULL::jsonb'} AS legacy_raw,
        s.source_url,s.source_updated_at::text,s.imported_at::text,
        ST_AsGeoJSON(p.geom,15)::json AS geometry,
        ST_AsGeoJSON(ST_PointOnSurface(p.geom),15)::json AS center,
        ST_Area(ST_Transform(p.geom,3857)) AS area,
        ST_XMin(p.geom) AS west,ST_YMin(p.geom) AS south,ST_XMax(p.geom) AS east,ST_YMax(p.geom) AS north
      FROM parcels p LEFT JOIN parcel_sources s ON p.source_key=s.source_key ORDER BY p.id`);
    while (true) {
      const result = await client.query("FETCH 1000 FROM export_parcels");
      if (!result.rows.length) break;
      db.exec("BEGIN");
      for (const r of result.rows) {
        const { area, west, south, east, north, legacy_raw, ...record } = r;
        if (legacy_raw && Object.keys(legacy_raw).length) {
          record.raw_attributes_gzip = gzipSync(JSON.stringify(legacy_raw)).toString("hex");
        }
        const parcel = record as StoredParcel;
        if (!parcel.geometry || !parcel.center || !Number.isFinite(area)) throw new Error("Invalid exported geometry");
        count++;
        sourceCounts[parcel.source_key] = (sourceCounts[parcel.source_key] ?? 0) + 1;
        const fields = [r.parcel_id,r.apn,r.owner_name,r.site_address,r.mailing_address,r.land_use];
        insert.run(count,r.id,r.source_key,r.source_feature_id,gzipSync(JSON.stringify(record)),
          ...fields.map(v => v ?? null), (r.parcel_id ?? "").toLowerCase().replace(/[^a-z0-9]/g,""),
          (r.apn ?? "").toLowerCase().replace(/[^a-z0-9]/g,""),area,west,south,east,north);
        spatial.run(count,west,east,south,north);
      }
      db.exec("COMMIT");
      if (count % 20000 === 0) console.log(`Exported ${count}/${expected}`);
    }
    if (count !== expected || count === 0) throw new Error("Export count mismatch or empty dataset");
    await client.query("COMMIT");
    db.exec("CREATE INDEX parcel_source ON parcels(source_key,source_feature_id); VACUUM;");
    if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("SQLite integrity check failed");
    db.close();
    await packageStaticDataset(work, sourceCounts, client, version);

  } finally { await client.end(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
