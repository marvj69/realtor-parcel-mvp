import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { getDatabaseConnectionString, loadEnv } from "./load-env";

loadEnv();

type FieldMap = Record<string, string[]>;

type CountySource = {
  sourceKey: string;
  provider: string;
  county?: string;
  state?: string;
  sourceType?: string;
  sourceUrl?: string;
  inputFile: string;
  notes?: string;
  fieldMap: FieldMap;
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

function pick(props: Record<string, unknown>, candidates: string[] | undefined): string | number | null {
  if (!candidates) return null;
  for (const key of candidates) {
    const direct = props[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct as string | number;

    const matchedKey = Object.keys(props).find((propKey) => propKey.toLowerCase() === key.toLowerCase());
    if (matchedKey) {
      const value = props[matchedKey];
      if (value !== undefined && value !== null && value !== "") return value as string | number;
    }
  }
  return null;
}

function asString(value: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function asNumber(value: string | number | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toMultiPolygonGeometry(geometry: Geometry | null): Polygon | MultiPolygon | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return geometry;
  return null;
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
      INSERT INTO parcel_sources (source_key, provider, county, state, source_url, source_type, notes, raw_config, imported_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
      ON CONFLICT (source_key)
      DO UPDATE SET
        provider = EXCLUDED.provider,
        county = EXCLUDED.county,
        state = EXCLUDED.state,
        source_url = EXCLUDED.source_url,
        source_type = EXCLUDED.source_type,
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
        source.notes ?? null,
        JSON.stringify(source)
      ]
    );

    let imported = 0;
    let skipped = 0;

    for (const feature of geojson.features as Feature[]) {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
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
          raw,
          geom
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15::jsonb,
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($16), 4326))
        )
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
          raw = EXCLUDED.raw,
          geom = EXCLUDED.geom
        `,
        [
          source.sourceKey,
          sourceFeatureId,
          source.provider,
          source.county ?? null,
          source.state ?? null,
          parcelId,
          apn,
          ownerName,
          siteAddress,
          mailingAddress,
          acreage,
          assessedValue,
          landUse,
          legalDescription,
          JSON.stringify(properties),
          JSON.stringify(geometry)
        ]
      );

      imported += 1;
      if (imported % 500 === 0) console.log(`Imported ${imported} parcels...`);
    }

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
