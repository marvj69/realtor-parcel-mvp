import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Client } from "pg";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { getDatabaseConnectionString, loadEnv } from "./load-env";

loadEnv();

type FieldCandidate = string | string[];
type FieldMap = Record<string, FieldCandidate[]>;

type CountySource = {
  sourceKey: string;
  provider: string;
  county?: string;
  state?: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
  inputFile: string;
  refreshCadence?: string;
  lastRefreshReviewedAt?: string | null;
  refreshNotes?: string;
  notes?: string;
  fieldMap: FieldMap;
};

type ParcelImportRecord = {
  sourceKey: string;
  sourceFeatureId: string;
  provider: string;
  sourceCounty: string | null;
  state: string | null;
  parcelId: string | null;
  apn: string | null;
  ownerName: string | null;
  siteAddress: string | null;
  mailingAddress: string | null;
  acreage: number | null;
  assessedValue: number | null;
  landUse: string | null;
  legalDescription: string | null;
  rawAttributesGzip: Buffer;
  geometry: string;
};

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function getConfig(): CountySource {
  const configPath = path.resolve(process.cwd(), getArg("config") ?? "config/county-sources.local.json");
  const sourceKey = getArg("source");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const sources = JSON.parse(fs.readFileSync(configPath, "utf8")) as CountySource[];
  const source = sourceKey ? sources.find((item) => item.sourceKey === sourceKey) : sources[0];
  if (!source) throw new Error(`Source not found in config: ${sourceKey}`);
  return source;
}

function readProp(props: Record<string, unknown>, key: string): unknown {
  const direct = props[key];
  if (direct !== undefined && direct !== null && direct !== "") return direct;

  const matchedKey = Object.keys(props).find((propKey) => propKey.toLowerCase() === key.toLowerCase());
  if (!matchedKey) return null;

  const value = props[matchedKey];
  return value !== undefined && value !== null && value !== "" ? value : null;
}

function sanitizeString(value: string): string {
  return value.replace(/\u0000/g, "");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== null && item !== undefined && item !== "");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      const sanitized = sanitizeValue(item);
      if (sanitized === null || sanitized === undefined || sanitized === "") return [];
      if (typeof sanitized === "object" && !Array.isArray(sanitized) && Object.keys(sanitized).length === 0) return [];
      if (Array.isArray(sanitized) && sanitized.length === 0) return [];
      return [[key, sanitized] as const];
    });
    return Object.fromEntries(entries);
  }
  return value;
}

function asPartString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = sanitizeString(String(value)).trim();
  if (!text || /^0(?:\.0+)?e[-+]?\d+$/i.test(text)) return null;
  return text;
}

function pick(props: Record<string, unknown>, candidates: FieldCandidate[] | undefined): string | number | null {
  if (!candidates) return null;
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const parts = candidate
        .map((key) => asPartString(readProp(props, key)))
        .filter((part): part is string => Boolean(part));

      if (parts.length > 0) {
        return parts.join(", ");
      }
      continue;
    }

    const value = readProp(props, candidate);
    if (value !== null) return value as string | number;
  }
  return null;
}

function asString(value: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  return sanitizeString(String(value)).trim() || null;
}

function asNumber(value: string | number | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = sanitizeString(String(value)).replace(/[$,]/g, "").trim();
  const numericText = cleaned.match(/-?\d+(?:\.\d+)?/)?.[0];
  if (!numericText) return null;
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? parsed : null;
}

function gzipJson(value: unknown): Buffer {
  return zlib.gzipSync(Buffer.from(JSON.stringify(value), "utf8"), { level: 9 });
}

function toMultiPolygonGeometry(geometry: Geometry | null): Polygon | MultiPolygon | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return geometry;
  return null;
}

async function insertParcelBatch(client: Client, records: ParcelImportRecord[]) {
  if (records.length === 0) return;

  const uniqueRecords = Array.from(
    new Map(records.map((record) => [`${record.sourceKey}\u0001${record.sourceFeatureId}`, record])).values()
  );
  const columnsPerRow = 16;
  const params: unknown[] = [];
  const values = uniqueRecords.map((record, rowIndex) => {
    params.push(
      record.sourceKey,
      record.sourceFeatureId,
      record.provider,
      record.sourceCounty,
      record.state,
      record.parcelId,
      record.apn,
      record.ownerName,
      record.siteAddress,
      record.mailingAddress,
      record.acreage,
      record.assessedValue,
      record.landUse,
      record.legalDescription,
      record.rawAttributesGzip,
      record.geometry
    );

    const offset = rowIndex * columnsPerRow;
    const placeholders = Array.from({ length: columnsPerRow }, (_, index) => `$${offset + index + 1}`);

    return `(
      ${placeholders[0]}, ${placeholders[1]}, ${placeholders[2]}, ${placeholders[3]}, ${placeholders[4]},
      ${placeholders[5]}, ${placeholders[6]}, ${placeholders[7]}, ${placeholders[8]}, ${placeholders[9]},
      ${placeholders[10]}, ${placeholders[11]}, ${placeholders[12]}, ${placeholders[13]}, ${placeholders[14]}::bytea,
      ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${placeholders[15]}), 4326))
    )`;
  });

  await client.query(
    `
    INSERT INTO parcels (
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
      geom
    ) VALUES ${values.join(",")}
    ON CONFLICT (source_key, source_feature_id)
    DO UPDATE SET
      provider = EXCLUDED.provider,
      source_county = EXCLUDED.source_county,
      state = EXCLUDED.state,
      parcel_id = EXCLUDED.parcel_id,
      apn = EXCLUDED.apn,
      owner_name = EXCLUDED.owner_name,
      site_address = EXCLUDED.site_address,
      mailing_address = EXCLUDED.mailing_address,
      acreage = EXCLUDED.acreage,
      assessed_value = EXCLUDED.assessed_value,
      land_use = EXCLUDED.land_use,
      legal_description = EXCLUDED.legal_description,
      raw_attributes_gzip = EXCLUDED.raw_attributes_gzip,
      geom = EXCLUDED.geom
    `,
    params
  );
}

async function main() {
  const source = getConfig();
  const inputPath = path.resolve(process.cwd(), source.inputFile);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input GeoJSON file not found: ${inputPath}`);
  }

  const connectionString = getDatabaseConnectionString();
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL or DATABASE_DIRECT_URL. Set a Neon/PostGIS connection string before importing parcels.");
  }

  const geojson = JSON.parse(fs.readFileSync(inputPath, "utf8")) as FeatureCollection;
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("Input must be a GeoJSON FeatureCollection");
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO parcel_sources (source_key, provider, county, state, source_url, source_type, source_updated_at, notes, raw_config, imported_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9::jsonb, now())
      ON CONFLICT (source_key)
      DO UPDATE SET
        provider = EXCLUDED.provider,
        county = EXCLUDED.county,
        state = EXCLUDED.state,
        source_url = EXCLUDED.source_url,
        source_type = EXCLUDED.source_type,
        source_updated_at = EXCLUDED.source_updated_at,
        notes = EXCLUDED.notes,
        raw_config = EXCLUDED.raw_config,
        imported_at = now()
      `,
      [
        source.sourceKey,
        source.provider,
        source.county ?? null,
        source.state ?? null,
        source.sourceUrl ?? null,
        source.sourceType ?? null,
        source.sourceUpdatedAt ?? null,
        source.notes ?? null,
        JSON.stringify(source)
      ]
    );

    let imported = 0;
    let skipped = 0;
    const batchSize = Math.max(1, Math.min(Number(getArg("batchSize") ?? 500) || 500, 1000));
    let batch: ParcelImportRecord[] = [];

    for (const feature of geojson.features as Feature[]) {
      const properties = sanitizeValue(feature.properties ?? {}) as Record<string, unknown>;
      const geometry = toMultiPolygonGeometry(feature.geometry);
      if (!geometry) {
        skipped += 1;
        continue;
      }

      const sourceFeatureId =
        asString(pick(properties, source.fieldMap.sourceFeatureId)) ??
        asString(pick(properties, source.fieldMap.parcelId)) ??
        asString((feature.id as string | number | undefined) ?? null) ??
        `${source.sourceKey}-${imported + skipped + 1}`;

      const parcelId = asString(pick(properties, source.fieldMap.parcelId));
      const apn = asString(pick(properties, source.fieldMap.apn));
      const ownerName = asString(pick(properties, source.fieldMap.ownerName));
      const siteAddress = asString(pick(properties, source.fieldMap.siteAddress));
      const mailingAddress = asString(pick(properties, source.fieldMap.mailingAddress));
      const acreage = asNumber(pick(properties, source.fieldMap.acreage));
      const assessedValue = asNumber(pick(properties, source.fieldMap.assessedValue));
      const landUse = asString(pick(properties, source.fieldMap.landUse));
      const legalDescription = asString(pick(properties, source.fieldMap.legalDescription));

      batch.push({
        sourceKey: source.sourceKey,
        sourceFeatureId,
        provider: source.provider,
        sourceCounty: source.county ?? null,
        state: source.state ?? null,
        parcelId,
        apn,
        ownerName,
        siteAddress,
        mailingAddress,
        acreage,
        assessedValue,
        landUse,
        legalDescription,
        rawAttributesGzip: gzipJson(properties),
        geometry: JSON.stringify(geometry)
      });
      imported += 1;

      if (batch.length >= batchSize) {
        await insertParcelBatch(client, batch);
        batch = [];
        console.log(`Imported ${imported} parcels...`);
      }
    }

    await insertParcelBatch(client, batch);
    await client.query("COMMIT");
    console.log(`Done. Imported/updated ${imported} parcels. Skipped ${skipped} unsupported geometries.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
