import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./load-env";

loadEnv();

type CountySource = {
  sourceKey: string;
  sourceUrl: string;
  inputFile: string;
};

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function getConfig(): CountySource {
  const configPath = path.resolve(process.cwd(), getArg("config") ?? "config/county-sources.local.json");
  const sourceKey = getArg("source");

  if (!fs.existsSync(configPath)) throw new Error(`Config file not found: ${configPath}`);

  const sources = JSON.parse(fs.readFileSync(configPath, "utf8")) as CountySource[];
  const source = sourceKey ? sources.find((item) => item.sourceKey === sourceKey) : sources[0];
  if (!source) throw new Error(`Source not found in config: ${sourceKey}`);
  if (!source.sourceUrl || source.sourceUrl.includes("REPLACE_WITH")) {
    throw new Error("sourceUrl must be replaced with a real ArcGIS FeatureServer layer URL");
  }
  return source;
}

function buildQueryUrl(layerUrl: string, offset: number, limit: number): string {
  const base = layerUrl.endsWith("/query") ? layerUrl : `${layerUrl.replace(/\/$/, "")}/query`;
  const url = new URL(base);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("f", "geojson");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(limit));
  return url.toString();
}

async function main() {
  const source = getConfig();
  const outputPath = path.resolve(process.cwd(), source.inputFile);
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const pageSize = Number(getArg("pageSize") ?? 2000);
  const maxPages = Number(getArg("maxPages") ?? 100);
  const allFeatures: unknown[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const queryUrl = buildQueryUrl(source.sourceUrl, offset, pageSize);
    console.log(`Fetching page ${page + 1}: offset ${offset}`);

    const response = await fetch(queryUrl);
    if (!response.ok) {
      throw new Error(`ArcGIS request failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as { type?: string; features?: unknown[]; error?: unknown };
    if (payload.error) throw new Error(`ArcGIS error: ${JSON.stringify(payload.error)}`);
    if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
      throw new Error("Expected GeoJSON FeatureCollection. Try checking the ArcGIS layer URL or f=geojson support.");
    }

    allFeatures.push(...payload.features);
    if (payload.features.length < pageSize) break;
  }

  const featureCollection = {
    type: "FeatureCollection",
    features: allFeatures
  };

  fs.writeFileSync(outputPath, JSON.stringify(featureCollection, null, 2));
  console.log(`Saved ${allFeatures.length} features to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
