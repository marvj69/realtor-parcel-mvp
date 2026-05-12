import fs from "node:fs";
import path from "node:path";
import proj4 from "proj4";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
import { loadEnv } from "./load-env";

loadEnv();

type CountySource = {
  sourceKey: string;
  sourceType?: string;
  sourceUrl?: string;
  inputFile: string;
  sourceFormat?: "geojson" | "arcgis_json";
  sourceProjection?: string;
  proxyUrl?: string;
  requestReferer?: string;
  outSR?: number | null;
  where?: string;
  pageSize?: number;
  maxPages?: number;
  publicLink?: string;
  colligoLayerId?: string;
  colligoUniqType?: string;
  colligoEnrichProperties?: boolean;
  initialCenter?: string;
  viewExtents?: string;
};

type ArcgisJsonPayload = {
  error?: unknown;
  exceededTransferLimit?: boolean;
  features?: Array<{
    attributes?: Record<string, unknown>;
    geometry?: {
      rings?: Position[][];
      paths?: Position[][];
      x?: number;
      y?: number;
    };
  }>;
};

proj4.defs(
  "EPSG:3857",
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +units=m +no_defs +type=crs"
);
proj4.defs(
  "EPSG:102100",
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +units=m +no_defs +type=crs"
);
proj4.defs(
  "EPSG:2896",
  "+proj=lcc +lat_0=44.7833333333333 +lon_0=-87 +lat_1=47.0833333333333 +lat_2=45.4833333333333 +x_0=7999999.999968 +y_0=0 +ellps=GRS80 +towgs84=-0.991,1.9072,0.5129,-1.25033e-07,-4.6785e-08,-5.6529e-08,0 +units=ft +no_defs +type=crs"
);
proj4.defs(
  "ESRI:102688",
  "+proj=lcc +lat_0=44.7833333333333 +lon_0=-87 +lat_1=45.4833333333333 +lat_2=47.0833333333333 +x_0=8000000.00000001 +y_0=0 +datum=NAD83 +units=us-ft +no_defs +type=crs"
);

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

function buildQueryUrl(source: CountySource, offset: number, limit: number, format: "geojson" | "arcgis_json"): string {
  if (!source.sourceUrl) throw new Error("sourceUrl is required for ArcGIS sources");
  const layerUrl = source.sourceUrl;
  const base = layerUrl.endsWith("/query") ? layerUrl : `${layerUrl.replace(/\/$/, "")}/query`;
  const url = new URL(base);
  url.searchParams.set("where", source.where ?? "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  if (source.outSR !== null) {
    const outSR = source.outSR ?? (format === "geojson" ? 4326 : undefined);
    if (outSR) url.searchParams.set("outSR", String(outSR));
  }
  url.searchParams.set("f", format === "arcgis_json" ? "json" : "geojson");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(limit));
  return url.toString();
}

function proxiedUrl(source: CountySource, url: string): string {
  if (!source.proxyUrl) return url;
  const separator = source.proxyUrl.endsWith("?") ? "" : "?";
  return `${source.proxyUrl}${separator}${encodeURIComponent(url)}`;
}

function requestHeaders(source: CountySource): HeadersInit | undefined {
  return source.requestReferer ? { referer: source.requestReferer } : undefined;
}

function normalizeProjection(sourceProjection: string | undefined): string | null {
  if (!sourceProjection) return null;
  const upper = sourceProjection.toUpperCase();
  if (upper === "EPSG:4326" || upper === "CRS:84" || upper === "CRS84") return null;
  if (upper === "EPSG:102100" || upper === "EPSG:900913") return "EPSG:3857";
  if (upper === "EPSG:102688") return "ESRI:102688";
  return sourceProjection;
}

function transformPosition(position: Position, sourceProjection: string | undefined): Position {
  const projection = normalizeProjection(sourceProjection);
  if (!projection) return position;

  const [x, y] = proj4(projection, "EPSG:4326", [Number(position[0]), Number(position[1])]);
  return position.length > 2 ? [x, y, ...position.slice(2)] : [x, y];
}

function mapCoordinates(coords: unknown, sourceProjection: string | undefined): unknown {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    return transformPosition(coords as Position, sourceProjection);
  }
  return coords.map((item) => mapCoordinates(item, sourceProjection));
}

function transformGeometry(geometry: Geometry | null, sourceProjection: string | undefined): Geometry | null {
  if (!geometry || !normalizeProjection(sourceProjection)) return geometry;
  if (geometry.type === "GeometryCollection") {
    return {
      type: "GeometryCollection",
      geometries: geometry.geometries.map((item) => transformGeometry(item, sourceProjection)).filter(Boolean) as Geometry[]
    };
  }
  return {
    ...geometry,
    coordinates: mapCoordinates(geometry.coordinates, sourceProjection)
  } as Geometry;
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function signedRingArea(ring: Position[]): number {
  let area = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    area += Number(ring[previous][0]) * Number(ring[index][1]) - Number(ring[index][0]) * Number(ring[previous][1]);
  }
  return area / 2;
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  const x = Number(point[0]);
  const y = Number(point[1]);
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const xi = Number(ring[index][0]);
    const yi = Number(ring[index][1]);
    const xj = Number(ring[previous][0]);
    const yj = Number(ring[previous][1]);
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function arcgisRingsToGeoJson(rings: Position[][], sourceProjection: string | undefined): Polygon | MultiPolygon | null {
  if (rings.length === 0) return null;

  const sourceRings = rings.map((ring) => closeRing(ring));
  let outerIndexes = sourceRings
    .map((ring, index) => ({ index, area: signedRingArea(ring) }))
    .filter((item) => item.area < 0)
    .map((item) => item.index);

  if (outerIndexes.length === 0) {
    const largest = sourceRings
      .map((ring, index) => ({ index, area: Math.abs(signedRingArea(ring)) }))
      .sort((a, b) => b.area - a.area)[0];
    outerIndexes = largest ? [largest.index] : [];
  }

  const outerIndexSet = new Set(outerIndexes);
  const polygons = outerIndexes.map((index) => {
    const transformed = closeRing(sourceRings[index].map((position) => transformPosition(position, sourceProjection)));
    if (signedRingArea(transformed) < 0) transformed.reverse();
    return [transformed];
  });

  sourceRings.forEach((ring, index) => {
    if (outerIndexSet.has(index)) return;
    const transformed = closeRing(ring.map((position) => transformPosition(position, sourceProjection)));
    if (signedRingArea(transformed) > 0) transformed.reverse();
    const samplePoint = transformed[0];
    const targetIndex = polygons.findIndex((polygon) => pointInRing(samplePoint, polygon[0]));
    polygons[Math.max(0, targetIndex)].push(transformed);
  });

  if (polygons.length === 0) return null;
  if (polygons.length === 1) return { type: "Polygon", coordinates: polygons[0] };
  return { type: "MultiPolygon", coordinates: polygons };
}

function arcgisJsonToGeoJson(payload: ArcgisJsonPayload, sourceProjection: string | undefined): FeatureCollection {
  if (!Array.isArray(payload.features)) throw new Error("Expected ArcGIS JSON features array.");
  const features = payload.features.flatMap((feature): Feature[] => {
    if (!feature.geometry?.rings) return [];
    const geometry = arcgisRingsToGeoJson(feature.geometry.rings, sourceProjection);
    if (!geometry) return [];
    return [{ type: "Feature", properties: feature.attributes ?? {}, geometry }];
  });

  return { type: "FeatureCollection", features };
}

async function fetchJson(url: string, headers?: HeadersInit): Promise<unknown> {
  const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`ArcGIS request failed: ${response.status} ${response.statusText}`);
    }
  return response.json();
}

async function fetchArcgisSource(source: CountySource): Promise<FeatureCollection> {
  const format = source.sourceFormat ?? "geojson";
  const pageSize = Number(getArg("pageSize") ?? source.pageSize ?? 2000);
  const maxPages = Number(getArg("maxPages") ?? source.maxPages ?? 100);
  const allFeatures: Feature[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const queryUrl = proxiedUrl(source, buildQueryUrl(source, offset, pageSize, format));
    console.log(`Fetching page ${page + 1}: offset ${offset}`);

    const payload = await fetchJson(queryUrl, requestHeaders(source)) as ArcgisJsonPayload & FeatureCollection;
    if (payload.error) throw new Error(`ArcGIS error: ${JSON.stringify(payload.error)}`);

    const pageCollection =
      format === "arcgis_json"
        ? arcgisJsonToGeoJson(payload, source.sourceProjection)
        : payload;

    if (pageCollection.type !== "FeatureCollection" || !Array.isArray(pageCollection.features)) {
      throw new Error("Expected GeoJSON FeatureCollection. Try checking the ArcGIS layer URL or f=geojson support.");
    }

    allFeatures.push(...pageCollection.features as Feature[]);
    if (pageCollection.features.length === 0) break;
    offset += pageCollection.features.length;
    if (pageCollection.features.length < pageSize && !payload.exceededTransferLimit) break;
  }

  return {
    type: "FeatureCollection",
    features: allFeatures
  };
}

async function getColligoSession(publicLink: string): Promise<string> {
  const response = await fetch("https://colligogis.com/desktop/index.php", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ publink: publicLink })
  });
  if (!response.ok) throw new Error(`Colligo session failed: ${response.status} ${response.statusText}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Colligo session did not return a cookie.");

  const webResponse = await fetch("https://colligogis.com/web/index.php", { headers: { cookie } });
  if (!webResponse.ok) throw new Error(`Colligo web load failed: ${webResponse.status} ${webResponse.statusText}`);
  await webResponse.text();

  return cookie;
}

async function fetchColligoSource(source: CountySource): Promise<FeatureCollection> {
  if (!source.publicLink) throw new Error("publicLink is required for Colligo sources");
  if (!source.colligoLayerId) throw new Error("colligoLayerId is required for Colligo sources");
  if (!source.initialCenter) throw new Error("initialCenter is required for Colligo sources");

  const cookie = await getColligoSession(source.publicLink);
  const body = new URLSearchParams({
    getType: "poly",
    getSubType: source.colligoLayerId,
    myCenter: source.initialCenter,
    viewExtents: source.viewExtents ?? "-10100000,5500000,-9300000,6300000"
  });

  const response = await fetch("https://colligogis.com/web/int_loadData.php", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      referer: "https://colligogis.com/web/index.php"
    },
    body
  });
  if (!response.ok) throw new Error(`Colligo layer request failed: ${response.status} ${response.statusText}`);

  const payload = await response.json() as { geoJSON?: string; error?: unknown };
  if (payload.error) throw new Error(`Colligo error: ${JSON.stringify(payload.error)}`);
  if (!payload.geoJSON) throw new Error("Colligo response did not include geoJSON.");

  const featureCollection = JSON.parse(payload.geoJSON) as FeatureCollection;
  if (featureCollection.type !== "FeatureCollection" || !Array.isArray(featureCollection.features)) {
    throw new Error("Colligo geoJSON payload was not a FeatureCollection.");
  }

  const tableRows =
    source.colligoEnrichProperties === false
      ? new Map<string, Record<string, unknown>>()
      : await fetchColligoTableRows(source, cookie);

  return {
    type: "FeatureCollection",
    features: featureCollection.features.flatMap((feature): Feature[] => {
      const geometry = transformGeometry(feature.geometry, source.sourceProjection);
      if (!geometry) return [];
      return [{
        ...feature,
        properties: {
          ...feature.properties,
          ...tableRows.get(String(feature.properties?.ogr_fid ?? feature.properties?.ogrID ?? ""))
        },
        geometry
      }];
    })
  };
}

async function fetchColligoTableRows(source: CountySource, cookie: string): Promise<Map<string, Record<string, unknown>>> {
  const uniqType = source.colligoUniqType ?? `poly${source.colligoLayerId}`;
  console.log(`Fetching Colligo table attributes for ${uniqType}`);

  const response = await fetch("https://colligogis.com/web/int_findTabData.php", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      referer: "https://colligogis.com/web/index.php"
    },
    body: new URLSearchParams({
      term: "*ceAll*",
      uniqType
    })
  });
  if (!response.ok) throw new Error(`Colligo table request failed: ${response.status} ${response.statusText}`);

  const payload = await response.json() as { data?: Array<Record<string, unknown>> };
  const rows = new Map<string, Record<string, unknown>>();
  for (const row of payload.data ?? []) {
    const id = row.ogr_fid ?? row.ogrID;
    if (id !== undefined && id !== null && id !== "") rows.set(String(id), row);
  }
  return rows;
}

async function main() {
  const source = getConfig();
  const outputPath = path.resolve(process.cwd(), source.inputFile);
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const featureCollection =
    source.sourceType === "colligo_public_layer"
      ? await fetchColligoSource(source)
      : await fetchArcgisSource(source);

  fs.writeFileSync(outputPath, JSON.stringify(featureCollection, null, 2));
  console.log(`Saved ${featureCollection.features.length} features to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
