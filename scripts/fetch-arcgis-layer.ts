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
  mapguideSiteId?: string;
  mapguideReturnUrl?: string;
  mapguideAgentUrl?: string;
  mapguideFeatureSource?: string;
  mapguideClassName?: string;
  mapguideGeometryProperty?: string;
  mapguideUsernameEnv?: string;
  mapguidePasswordEnv?: string;
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
  "EPSG:2251",
  "+proj=lcc +lat_0=44.7833333333333 +lon_0=-87 +lat_1=47.0833333333333 +lat_2=45.4833333333333 +x_0=7999999.999968 +y_0=0 +ellps=GRS80 +units=ft +no_defs +type=crs"
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

type CookieJar = Map<string, string>;

function readSetCookies(headers: Headers): string[] {
  const rawCookie = headers.get("set-cookie");
  if (!rawCookie) return [];
  return rawCookie.split(/,(?=\s*[^;,]+=[^;,]+)/).map((cookie) => cookie.split(";")[0]?.trim()).filter(Boolean);
}

function updateCookies(cookieJar: CookieJar, headers: Headers) {
  for (const cookie of readSetCookies(headers)) {
    const name = cookie.split("=")[0];
    if (name) cookieJar.set(name, cookie);
  }
}

function cookieHeader(cookieJar: CookieJar): string {
  return Array.from(cookieJar.values()).join("; ");
}

function readInputValue(html: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`name="${escapedName}"[^>]*value="([^"]*)"`))?.[1] ?? "";
}

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${suffix.replace(/^\//, "")}`;
}

function firstArrayValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function collectMapguideFeatures(value: unknown, features: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return features;

  if (Array.isArray(value)) {
    for (const item of value) collectMapguideFeatures(item, features);
    return features;
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.Feature)) {
    for (const feature of record.Feature) {
      if (feature && typeof feature === "object") features.push(feature as Record<string, unknown>);
    }
  }

  for (const item of Object.values(record)) collectMapguideFeatures(item, features);
  return features;
}

function mapguideProperties(feature: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const rawProperties = feature.Property;
  if (!Array.isArray(rawProperties)) return properties;

  for (const property of rawProperties) {
    if (!property || typeof property !== "object") continue;
    const record = property as Record<string, unknown>;
    const name = firstArrayValue(record.Name);
    if (typeof name !== "string" || !name) continue;
    properties[name] = firstArrayValue(record.Value) ?? null;
  }

  return properties;
}

function trimOuterParens(value: string): string {
  const text = value.trim();
  if (!text.startsWith("(") || !text.endsWith(")")) return text;

  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < text.length - 1) return text;
  }

  return text.slice(1, -1).trim();
}

function splitParenthesizedGroups(value: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = -1;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        groups.push(value.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return groups;
}

function coordinatesFromText(value: string, sourceProjection: string | undefined): Position[] {
  const coordinatePattern = /(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const coordinates: Position[] = [];
  for (const match of value.matchAll(coordinatePattern)) {
    coordinates.push(transformPosition([Number(match[1]), Number(match[2])], sourceProjection));
  }

  return coordinates.length >= 3 ? closeRing(coordinates) : [];
}

function standardPolygonRings(value: string, sourceProjection: string | undefined): Position[][] {
  const body = trimOuterParens(value);
  const ringGroups = splitParenthesizedGroups(body);
  const rawRings = ringGroups.length > 0 ? ringGroups : [body];
  return rawRings
    .map((ringText) => coordinatesFromText(ringText, sourceProjection))
    .filter((ring) => ring.length >= 4);
}

function mapguideWktToGeoJson(wkt: string, sourceProjection: string | undefined): Polygon | MultiPolygon | null {
  const trimmed = wkt.trim();
  const type = trimmed.match(/^[A-Z]+/i)?.[0].toUpperCase();
  const bodyStart = trimmed.indexOf("(");
  if (!type || bodyStart < 0) return null;

  const body = trimmed.slice(bodyStart);

  if (type === "POLYGON") {
    const rings = standardPolygonRings(body, sourceProjection);
    return rings.length > 0 ? { type: "Polygon", coordinates: rings } : null;
  }

  if (type === "MULTIPOLYGON") {
    const polygons = splitParenthesizedGroups(trimOuterParens(body))
      .map((polygonText) => standardPolygonRings(polygonText, sourceProjection))
      .filter((rings) => rings.length > 0);
    if (polygons.length === 0) return null;
    return polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] }
      : { type: "MultiPolygon", coordinates: polygons };
  }

  if (type === "CURVEPOLYGON") {
    const ring = coordinatesFromText(body, sourceProjection);
    return ring.length >= 4 ? { type: "Polygon", coordinates: [ring] } : null;
  }

  if (type === "MULTICURVEPOLYGON") {
    const polygonGroups = splitParenthesizedGroups(trimOuterParens(body));
    const polygons = (polygonGroups.length > 0 ? polygonGroups : [body])
      .map((polygonText) => coordinatesFromText(polygonText, sourceProjection))
      .filter((ring) => ring.length >= 4)
      .map((ring) => [ring]);
    if (polygons.length === 0) return null;
    return polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] }
      : { type: "MultiPolygon", coordinates: polygons };
  }

  return null;
}

async function getMapguideSiteConfig(source: CountySource): Promise<Record<string, unknown>> {
  if (!source.sourceUrl) throw new Error("sourceUrl is required for MapGuide sources");
  if (!source.mapguideSiteId) throw new Error("mapguideSiteId is required for MapGuide sources");

  const usernameEnv = source.mapguideUsernameEnv ?? "MAPGUIDE_USERNAME";
  const passwordEnv = source.mapguidePasswordEnv ?? "MAPGUIDE_PASSWORD";
  const username = process.env[usernameEnv];
  const password = process.env[passwordEnv];
  if (!username || !password) {
    throw new Error(`Missing ${usernameEnv} or ${passwordEnv}. Use the public GIS credentials from the source page as local environment variables.`);
  }

  const cookieJar: CookieJar = new Map();
  const returnUrl = source.mapguideReturnUrl ?? "%2fIntegrator%2f";
  const loginUrl = joinUrl(source.sourceUrl, `Default.aspx?ReturnUrl=${returnUrl}`);
  let response = await fetch(loginUrl, { redirect: "manual" });
  updateCookies(cookieJar, response.headers);
  if (!response.ok) throw new Error(`MapGuide login page failed: ${response.status} ${response.statusText}`);

  const loginHtml = await response.text();
  response = await fetch(loginUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(cookieJar)
    },
    body: new URLSearchParams({
      __VIEWSTATE: readInputValue(loginHtml, "__VIEWSTATE"),
      __VIEWSTATEGENERATOR: readInputValue(loginHtml, "__VIEWSTATEGENERATOR"),
      __EVENTVALIDATION: readInputValue(loginHtml, "__EVENTVALIDATION"),
      IntegratorUserNameTextbox: username,
      IntegratorPasswordTextbox: password,
      LogInButton: "Log In"
    })
  });
  updateCookies(cookieJar, response.headers);
  if (![200, 302].includes(response.status)) throw new Error(`MapGuide login failed: ${response.status} ${response.statusText}`);

  response = await fetch(joinUrl(source.sourceUrl, `Web/Default.aspx?server=mapguide&SiteId=${source.mapguideSiteId}&Version=3.3.1`), {
    headers: { cookie: cookieHeader(cookieJar) }
  });
  updateCookies(cookieJar, response.headers);
  if (!response.ok) throw new Error(`MapGuide site load failed: ${response.status} ${response.statusText}`);
  await response.text();

  response = await fetch(joinUrl(source.sourceUrl, "Web/Default.aspx/GetSiteConfigJSON"), {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      cookie: cookieHeader(cookieJar)
    },
    body: "{}"
  });
  if (!response.ok) throw new Error(`MapGuide site config failed: ${response.status} ${response.statusText}`);

  const payload = await response.json() as { d?: unknown };
  if (!payload.d) throw new Error("MapGuide site config did not include a response body.");
  return typeof payload.d === "string" ? JSON.parse(payload.d) as Record<string, unknown> : payload.d as Record<string, unknown>;
}

async function fetchMapguideSource(source: CountySource): Promise<FeatureCollection> {
  if (!source.mapguideAgentUrl) throw new Error("mapguideAgentUrl is required for MapGuide sources");
  if (!source.mapguideFeatureSource) throw new Error("mapguideFeatureSource is required for MapGuide sources");
  if (!source.mapguideClassName) throw new Error("mapguideClassName is required for MapGuide sources");

  const config = await getMapguideSiteConfig(source);
  const general = config.general as Record<string, unknown> | undefined;
  const sessionId = typeof general?.session_id === "string" ? general.session_id : null;
  if (!sessionId) throw new Error("MapGuide site config did not include a session id.");

  const url = new URL(source.mapguideAgentUrl);
  url.searchParams.set("OPERATION", "SELECTFEATURES");
  url.searchParams.set("VERSION", "1.0.0");
  url.searchParams.set("SESSION", sessionId);
  url.searchParams.set("RESOURCEID", source.mapguideFeatureSource);
  url.searchParams.set("CLASSNAME", source.mapguideClassName);
  url.searchParams.set("FORMAT", "application/json");
  if (source.where) url.searchParams.set("FILTER", source.where);

  console.log(`Fetching MapGuide layer ${source.mapguideClassName}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MapGuide feature request failed: ${response.status} ${response.statusText}`);

  const payload = await response.json() as Record<string, unknown>;
  const features = collectMapguideFeatures(payload.FeatureSet);
  const geometryProperty = source.mapguideGeometryProperty ?? "ogr_geometry";

  return {
    type: "FeatureCollection",
    features: features.flatMap((feature): Feature[] => {
      const properties = mapguideProperties(feature);
      const rawGeometry = properties[geometryProperty];
      const geometry = typeof rawGeometry === "string" ? mapguideWktToGeoJson(rawGeometry, source.sourceProjection) : null;
      if (!geometry) return [];
      return [{ type: "Feature", properties, geometry }];
    })
  };
}

async function main() {
  const source = getConfig();
  const outputPath = path.resolve(process.cwd(), source.inputFile);
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const featureCollection =
    source.sourceType === "colligo_public_layer"
      ? await fetchColligoSource(source)
      : source.sourceType === "mapguide_public_layer"
        ? await fetchMapguideSource(source)
      : await fetchArcgisSource(source);

  fs.writeFileSync(outputPath, JSON.stringify(featureCollection, null, 2));
  console.log(`Saved ${featureCollection.features.length} features to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
