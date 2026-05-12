import zlib from "node:zlib";
import { Client } from "pg";
import type { QueryResult } from "pg";
import { getDatabaseConnectionString, loadEnv } from "./load-env";

loadEnv();

const EMPTY_JSON_GZIP_HEX = "1f8b0800000000000213abae050043bfa6a302000000";
const COMPACT_TABLE = "parcels_compact_storage_rewrite";
const LEGACY_TABLE = "parcels_legacy_storage_rewrite";

const DROPPABLE_PARCEL_INDEXES = [
  "parcels_geom_gist_idx",
  "parcels_parcel_id_trgm_idx",
  "parcels_apn_trgm_idx",
  "parcels_owner_name_trgm_idx",
  "parcels_site_address_trgm_idx",
  "parcels_mailing_address_trgm_idx",
  "parcels_source_key_idx",
  "parcels_apn_idx",
  "parcels_parcel_id_idx",
  "parcels_owner_name_idx",
  "parcels_site_address_idx",
  "parcels_text_search_idx"
] as const;

const REQUIRED_PARCEL_INDEXES = [
  "CREATE INDEX IF NOT EXISTS parcels_geom_gist_idx ON parcels USING gist (geom)",
  "CREATE INDEX IF NOT EXISTS parcels_parcel_id_trgm_idx ON parcels USING gin (parcel_id gin_trgm_ops)",
  "CREATE INDEX IF NOT EXISTS parcels_apn_trgm_idx ON parcels USING gin (apn gin_trgm_ops)",
  "CREATE INDEX IF NOT EXISTS parcels_owner_name_trgm_idx ON parcels USING gin (owner_name gin_trgm_ops)",
  "CREATE INDEX IF NOT EXISTS parcels_site_address_trgm_idx ON parcels USING gin (site_address gin_trgm_ops)",
  "CREATE INDEX IF NOT EXISTS parcels_mailing_address_trgm_idx ON parcels USING gin (mailing_address gin_trgm_ops)"
] as const;

type SourceCount = {
  source_key: string;
  count: string;
};

type ColumnInfo = {
  column_name: string;
  data_type: string;
};

type SizeRow = {
  database_size: string;
  database_bytes: string;
  parcels_total: string;
  parcels_total_bytes: string;
  parcels_table: string;
  parcels_table_bytes: string;
  parcels_indexes: string;
  parcels_index_bytes: string;
};

type ParcelCopyRow = {
  id: string;
  source_key: string;
  source_feature_id: string;
  provider: string;
  source_county: string | null;
  state: string | null;
  parcel_id: string | null;
  apn: string | null;
  owner_name: string | null;
  site_address: string | null;
  mailing_address: string | null;
  acreage: string | null;
  assessed_value: string | null;
  land_use: string | null;
  legal_description: string | null;
  raw_text?: string | null;
  raw_attributes_gzip?: Buffer | null;
  geom_wkb: Buffer;
  created_at: Date;
  updated_at: Date;
};

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function gzipJsonText(value: string): Buffer {
  return zlib.gzipSync(Buffer.from(value, "utf8"), { level: 9 });
}

function formatBytes(value: string | number): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return String(value);
  const units = ["bytes", "kB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, "\"\"")}"`;
}

function sourceCountsEqual(before: SourceCount[], after: SourceCount[]): boolean {
  if (before.length !== after.length) return false;
  const afterBySource = new Map(after.map((row) => [row.source_key, row.count]));
  return before.every((row) => afterBySource.get(row.source_key) === row.count);
}

function compressedRawForRow(row: ParcelCopyRow): Buffer {
  if (row.raw_text !== undefined && row.raw_text !== null) return gzipJsonText(row.raw_text);
  if (row.raw_attributes_gzip && row.raw_attributes_gzip.length > 0) return row.raw_attributes_gzip;
  return Buffer.from(EMPTY_JSON_GZIP_HEX, "hex");
}

async function getSourceCounts(client: Client, tableName = "parcels"): Promise<SourceCount[]> {
  const result = await client.query<SourceCount>(
    `SELECT source_key, count(*)::text AS count FROM ${quoteIdentifier(tableName)} GROUP BY source_key ORDER BY source_key`
  );
  return result.rows;
}

async function getSize(client: Client): Promise<SizeRow> {
  const result = await client.query<SizeRow>(
    `
    SELECT
      pg_size_pretty(pg_database_size(current_database())) AS database_size,
      pg_database_size(current_database())::text AS database_bytes,
      pg_size_pretty(pg_total_relation_size('parcels')) AS parcels_total,
      pg_total_relation_size('parcels')::text AS parcels_total_bytes,
      pg_size_pretty(pg_relation_size('parcels')) AS parcels_table,
      pg_relation_size('parcels')::text AS parcels_table_bytes,
      pg_size_pretty(pg_indexes_size('parcels')) AS parcels_indexes,
      pg_indexes_size('parcels')::text AS parcels_index_bytes
    `
  );
  return result.rows[0];
}

async function getParcelColumns(client: Client): Promise<Map<string, string>> {
  const result = await client.query<ColumnInfo>(
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'parcels'
    `
  );
  return new Map(result.rows.map((row) => [row.column_name, row.data_type]));
}

async function dropRebuildableStorage(client: Client) {
  for (const indexName of DROPPABLE_PARCEL_INDEXES) {
    await client.query(`DROP INDEX IF EXISTS ${indexName}`);
  }

  await client.query("ALTER TABLE parcels DROP CONSTRAINT IF EXISTS parcels_source_key_source_feature_id_key");
}

async function createCompactParcelTable(client: Client) {
  await client.query(`DROP TABLE IF EXISTS ${quoteIdentifier(COMPACT_TABLE)}`);
  await client.query(
    `
    CREATE TABLE ${quoteIdentifier(COMPACT_TABLE)} (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      source_key text NOT NULL,
      source_feature_id text NOT NULL,
      provider text NOT NULL DEFAULT 'public_gis',
      source_county text,
      state text,
      parcel_id text,
      apn text,
      owner_name text,
      site_address text,
      mailing_address text,
      acreage numeric,
      assessed_value numeric,
      land_use text,
      legal_description text,
      raw_attributes_gzip bytea NOT NULL DEFAULT decode('${EMPTY_JSON_GZIP_HEX}', 'hex'),
      geom geometry(MultiPolygon, 4326) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
    `
  );
}

async function copyParcelsIntoCompactTable(client: Client, hasLegacyRaw: boolean, batchSize: number) {
  let copied = 0;
  let lastId: string | null = null;

  while (true) {
    const rawSelect = hasLegacyRaw ? "raw::text AS raw_text" : "raw_attributes_gzip";
    const result: QueryResult<ParcelCopyRow> = await client.query<ParcelCopyRow>(
      `
      SELECT
        id::text,
        source_key,
        source_feature_id,
        provider,
        source_county,
        state,
        parcel_id,
        apn,
        owner_name,
        site_address,
        mailing_address,
        acreage::text,
        assessed_value::text,
        land_use,
        legal_description,
        ${rawSelect},
        ST_AsEWKB(geom) AS geom_wkb,
        created_at,
        updated_at
      FROM parcels
      WHERE ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id
      LIMIT $1
      `,
      [batchSize, lastId]
    );

    if (result.rows.length === 0) break;

    const params: unknown[] = [];
    const values = result.rows.map((row, rowIndex) => {
      params.push(
        row.id,
        row.source_key,
        row.source_feature_id,
        row.provider,
        row.source_county,
        row.state,
        row.parcel_id,
        row.apn,
        row.owner_name,
        row.site_address,
        row.mailing_address,
        row.acreage,
        row.assessed_value,
        row.land_use,
        row.legal_description,
        compressedRawForRow(row),
        row.geom_wkb,
        row.created_at,
        row.updated_at
      );

      const offset = rowIndex * 19;
      const placeholders = Array.from({ length: 19 }, (_, index) => `$${offset + index + 1}`);
      return `(
        ${placeholders[0]}::uuid, ${placeholders[1]}, ${placeholders[2]}, ${placeholders[3]},
        ${placeholders[4]}, ${placeholders[5]}, ${placeholders[6]}, ${placeholders[7]},
        ${placeholders[8]}, ${placeholders[9]}, ${placeholders[10]}, ${placeholders[11]}::numeric,
        ${placeholders[12]}::numeric, ${placeholders[13]}, ${placeholders[14]}, ${placeholders[15]}::bytea,
        ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromEWKB(${placeholders[16]}::bytea), 4326))),
        ${placeholders[17]}::timestamptz, ${placeholders[18]}::timestamptz
      )`;
    });

    await client.query(
      `
      INSERT INTO ${quoteIdentifier(COMPACT_TABLE)} (
        id,
        source_key,
        source_feature_id,
        provider,
        source_county,
        state,
        parcel_id,
        apn,
        owner_name,
        site_address,
        mailing_address,
        acreage,
        assessed_value,
        land_use,
        legal_description,
        raw_attributes_gzip,
        geom,
        created_at,
        updated_at
      ) VALUES ${values.join(",")}
      `,
      params
    );

    copied += result.rows.length;
    lastId = result.rows[result.rows.length - 1].id;
    console.log(`Copied ${copied.toLocaleString()} parcels into compact storage...`);
  }
}

async function validateCompactCopy(client: Client, beforeCounts: SourceCount[], hasLegacyRaw: boolean) {
  const compactCounts = await getSourceCounts(client, COMPACT_TABLE);
  if (!sourceCountsEqual(beforeCounts, compactCounts)) {
    throw new Error("Compact parcel copy row counts do not match the original parcels table.");
  }

  if (!hasLegacyRaw) return;

  const samples = await client.query<{ id: string; raw_text: string; raw_attributes_gzip: Buffer }>(
    `
    SELECT p.id::text, p.raw::text AS raw_text, c.raw_attributes_gzip
    FROM parcels p
    JOIN ${quoteIdentifier(COMPACT_TABLE)} c ON c.id = p.id
    WHERE p.raw IS NOT NULL
    ORDER BY p.id
    LIMIT 10
    `
  );

  for (const sample of samples.rows) {
    const inflated = zlib.gunzipSync(sample.raw_attributes_gzip).toString("utf8");
    if (inflated !== sample.raw_text) {
      throw new Error(`Compressed raw validation failed for parcel ${sample.id}.`);
    }
  }
}

async function getSavedParcelForeignKeyNames(client: Client): Promise<string[]> {
  const result = await client.query<{ conname: string }>(
    `
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'saved_parcels'::regclass
      AND confrelid = 'parcels'::regclass
      AND contype = 'f'
    `
  );
  return result.rows.map((row) => row.conname);
}

async function swapCompactTableIntoPlace(client: Client) {
  const savedParcelForeignKeys = await getSavedParcelForeignKeyNames(client);

  await client.query("BEGIN");
  try {
    for (const constraintName of savedParcelForeignKeys) {
      await client.query(`ALTER TABLE saved_parcels DROP CONSTRAINT ${quoteIdentifier(constraintName)}`);
    }

    await client.query(`DROP TABLE IF EXISTS ${quoteIdentifier(LEGACY_TABLE)}`);
    await client.query(`ALTER TABLE parcels RENAME TO ${quoteIdentifier(LEGACY_TABLE)}`);
    await client.query(`ALTER TABLE ${quoteIdentifier(COMPACT_TABLE)} RENAME TO parcels`);
    await client.query(`DROP TABLE ${quoteIdentifier(LEGACY_TABLE)}`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function restoreConstraintsAndIndexes(client: Client) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parcels_pkey') THEN
        ALTER TABLE parcels ADD CONSTRAINT parcels_pkey PRIMARY KEY (id);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parcels_source_key_fkey') THEN
        ALTER TABLE parcels
          ADD CONSTRAINT parcels_source_key_fkey
          FOREIGN KEY (source_key) REFERENCES parcel_sources(source_key) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'parcels_source_key_source_feature_id_key'
      ) THEN
        ALTER TABLE parcels
          ADD CONSTRAINT parcels_source_key_source_feature_id_key
          UNIQUE (source_key, source_feature_id);
      END IF;
    END $$
  `);

  await client.query("DROP TRIGGER IF EXISTS parcels_set_updated_at ON parcels");
  await client.query(`
    CREATE TRIGGER parcels_set_updated_at
    BEFORE UPDATE ON parcels
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);
  if ((await getParcelColumns(client)).has("raw_attributes_gzip")) {
    await client.query(`
      COMMENT ON COLUMN parcels.raw_attributes_gzip IS
        'Gzipped UTF-8 JSON text containing the original public-source parcel attributes.'
    `);
  }

  for (const sql of REQUIRED_PARCEL_INDEXES) {
    await client.query(sql);
  }

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_parcels_parcel_id_fkey') THEN
        ALTER TABLE saved_parcels
          ADD CONSTRAINT saved_parcels_parcel_id_fkey
          FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE CASCADE;
      END IF;
    END $$
  `);
  await client.query("ANALYZE parcels");
}

async function recreateRequiredIndexesOnly(client: Client) {
  await restoreConstraintsAndIndexes(client);
}

async function compactParcelStorage() {
  const connectionString = getDatabaseConnectionString();
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL or DATABASE_DIRECT_URL. Set a Neon/PostGIS connection string first.");
  }

  const batchSize = Math.max(50, Math.min(Number(getArg("batchSize") ?? 600) || 600, 1200));
  const rewriteRaw = hasFlag("rewriteRaw");
  const client = new Client({
    connectionString,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
  });

  await client.connect();

  try {
    await client.query("SET statement_timeout = 0");

    const beforeCounts = await getSourceCounts(client);
    const beforeSize = await getSize(client);
    console.log(
      `Starting size: database ${beforeSize.database_size}, parcels ${beforeSize.parcels_total} ` +
        `(table ${beforeSize.parcels_table}, indexes ${beforeSize.parcels_indexes}).`
    );
    console.log(`Parcel rows before: ${beforeCounts.reduce((sum, row) => sum + Number(row.count), 0).toLocaleString()}`);

    const columns = await getParcelColumns(client);
    const hasLegacyRaw = columns.has("raw");

    console.log("Dropping rebuildable/legacy parcel indexes before compaction...");
    await dropRebuildableStorage(client);

    if (hasLegacyRaw && rewriteRaw) {
      await createCompactParcelTable(client);
      await copyParcelsIntoCompactTable(client, hasLegacyRaw, batchSize);
      await validateCompactCopy(client, beforeCounts, hasLegacyRaw);
      await swapCompactTableIntoPlace(client);
      await restoreConstraintsAndIndexes(client);
    } else {
      if (hasLegacyRaw) {
        console.log(
          "Legacy raw JSONB is still present; skipped the raw table rewrite because --rewriteRaw was not provided."
        );
      } else {
        console.log("Legacy raw JSONB column was already absent; refreshing required indexes only.");
      }
      await recreateRequiredIndexesOnly(client);
      await client.query("ANALYZE parcels");
    }

    const afterCounts = await getSourceCounts(client);
    if (!sourceCountsEqual(beforeCounts, afterCounts)) {
      throw new Error("Parcel source row counts changed during compaction.");
    }

    const afterSize = await getSize(client);
    const savedBytes = Number(beforeSize.database_bytes) - Number(afterSize.database_bytes);
    console.log(
      `Finished size: database ${afterSize.database_size}, parcels ${afterSize.parcels_total} ` +
        `(table ${afterSize.parcels_table}, indexes ${afterSize.parcels_indexes}).`
    );
    console.log(`Approximate database storage change: ${formatBytes(savedBytes)} saved.`);
    console.log(`Parcel rows after: ${afterCounts.reduce((sum, row) => sum + Number(row.count), 0).toLocaleString()}`);
  } catch (err) {
    console.error("Compaction failed; attempting to restore the required parcel constraints and indexes...");
    try {
      const tableExists = await client.query<{ table_name: string | null }>("SELECT to_regclass('public.parcels')::text AS table_name");
      if (tableExists.rows[0]?.table_name) {
        await recreateRequiredIndexesOnly(client);
      }
    } catch (restoreErr) {
      console.error(restoreErr);
    }
    throw err;
  } finally {
    await client.end();
  }
}

compactParcelStorage().catch((err) => {
  console.error(err);
  process.exit(1);
});
