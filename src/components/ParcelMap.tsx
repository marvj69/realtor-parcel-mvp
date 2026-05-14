"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import maplibregl from "maplibre-gl";
import { area as turfArea, bbox as turfBbox, length as turfLength, lineString as turfLineString, polygon as turfPolygon } from "@turf/turf";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
import ParcelDetails from "@/components/ParcelDetails";
import {
  deleteOfflineArea,
  estimateOfflineAreaBytes,
  getOfflineArea,
  isOfflineAreaStorageSupported,
  listOfflineAreas,
  requestPersistentOfflineStorage,
  saveOfflineArea
} from "@/lib/offline-areas";
import type { AppPanel, MeasurementMode, MeasurementPoint, MeasurementSummary } from "@/types/measurement";
import type { OfflineArea, OfflineAreaBbox, OfflineAreaSummary } from "@/types/offline";
import type { ParcelFeature, ParcelFeatureCollection, ParcelProperties, ParcelSearchResult } from "@/types/parcel";

const EMPTY_FEATURE_COLLECTION: FeatureCollection<Polygon | MultiPolygon, ParcelProperties> = {
  type: "FeatureCollection",
  features: []
};

const EMPTY_MEASUREMENT_COLLECTION: FeatureCollection<Geometry, MeasurementFeatureProperties> = {
  type: "FeatureCollection",
  features: []
};

const PARCEL_TILE_SOURCE_ID = "parcel-tiles";
const PARCEL_TILE_SOURCE_LAYER = "parcels";
const SATELLITE_SOURCE_ID = "usgs-satellite";
const SATELLITE_LAYER_ID = "usgs-satellite-layer";
const SATELLITE_DETAIL_SOURCE_ID = "usgs-satellite-detail";
const SATELLITE_DETAIL_LAYER_ID = "usgs-satellite-detail-layer";
const SATELLITE_LAYER_IDS = [SATELLITE_LAYER_ID, SATELLITE_DETAIL_LAYER_ID];
const PARCEL_TILE_FILL_LAYER_ID = "parcel-tile-fill";
const PARCEL_TILE_LINE_LAYER_ID = "parcel-tile-line";
const PARCEL_GEOJSON_FILL_LAYER_ID = "parcel-fill";
const PARCEL_GEOJSON_LINE_LAYER_ID = "parcel-line";
const OFFLINE_PARCEL_SOURCE_ID = "offline-parcels";
const OFFLINE_PARCEL_FILL_LAYER_ID = "offline-parcel-fill";
const OFFLINE_PARCEL_LINE_LAYER_ID = "offline-parcel-line";
const SELECTED_PARCEL_LINE_LAYER_ID = "selected-parcel-line";
const MEASUREMENT_SOURCE_ID = "measurements";
const MEASUREMENT_FILL_LAYER_ID = "measurement-fill";
const MEASUREMENT_LINE_LAYER_ID = "measurement-line";
const MEASUREMENT_POINT_LAYER_ID = "measurement-points";
const STREET_PARCEL_LINE_COLOR = "#1d4ed8";
const SATELLITE_PARCEL_LINE_COLOR = "#ff7a00";
const STREET_SELECTED_PARCEL_LINE_COLOR = "#ea580c";
const SATELLITE_SELECTED_PARCEL_LINE_COLOR = "#ff9f1c";
const OPENFREEMAP_STYLE_PREFIX = "https://tiles.openfreemap.org/styles/";
const DEFAULT_STREET_TILE_URL =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_STREET_ATTRIBUTION = "USGS The National Map: US Topo";
const DEFAULT_SATELLITE_TILE_URL =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_SATELLITE_DETAIL_TILE_URL =
  "https://basemap.nationalmap.gov/arcgis/services/USGSImageryOnly/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=0&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg";
const DEFAULT_SATELLITE_ATTRIBUTION = "USDA, USGS The National Map: Orthoimagery";
const SELECTED_PARCEL_TOP_PADDING = 76;
const SELECTED_PARCEL_SIDE_PADDING = 24;
const SELECTED_PARCEL_BOTTOM_MARGIN = 36;
const SELECTED_PARCEL_MIN_BOTTOM_PADDING = 160;
const OFFLINE_DOWNLOAD_ZOOM = 17;

type MeasurementFeatureProperties = {
  kind: "line" | "shape" | "point";
  label?: string;
};

type BasemapMode = "streets" | "satellite";
type MapStyleConfig = string | maplibregl.StyleSpecification;
type NumberInterpolateExpression = ["interpolate", ["linear"], ["zoom"], number, number, number, number];
type SelectableParcelSource = "live" | "offline";

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.3 3.4 5.1 3.4 8.5s-1.2 6.2-3.4 8.5" />
      <path d="M12 3.5C9.8 5.8 8.6 8.6 8.6 12s1.2 6.2 3.4 8.5" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.5 5.8 12h3.1l-4 5.3h14.2l-4-5.3h3.1L12 3.5Z" />
      <path d="M12 17.3v3.2" />
    </svg>
  );
}

function getStreetParcelTileLineOpacity(minZoom: number): NumberInterpolateExpression {
  return ["interpolate", ["linear"], ["zoom"], minZoom, 0.45, 16, 0.8];
}

function setParcelBoundaryPaint(map: maplibregl.Map, basemapMode: BasemapMode, minZoom: number) {
  const isSatellite = basemapMode === "satellite";
  const parcelLineColor = isSatellite ? SATELLITE_PARCEL_LINE_COLOR : STREET_PARCEL_LINE_COLOR;
  const selectedLineColor = isSatellite ? SATELLITE_SELECTED_PARCEL_LINE_COLOR : STREET_SELECTED_PARCEL_LINE_COLOR;

  if (map.getLayer(PARCEL_TILE_LINE_LAYER_ID)) {
    map.setPaintProperty(PARCEL_TILE_LINE_LAYER_ID, "line-color", parcelLineColor);
    map.setPaintProperty(
      PARCEL_TILE_LINE_LAYER_ID,
      "line-opacity",
      isSatellite ? 0.95 : getStreetParcelTileLineOpacity(minZoom)
    );
  }

  if (map.getLayer(PARCEL_GEOJSON_LINE_LAYER_ID)) {
    map.setPaintProperty(PARCEL_GEOJSON_LINE_LAYER_ID, "line-color", parcelLineColor);
    map.setPaintProperty(PARCEL_GEOJSON_LINE_LAYER_ID, "line-opacity", isSatellite ? 0.95 : 0.65);
  }

  if (map.getLayer(SELECTED_PARCEL_LINE_LAYER_ID)) {
    map.setPaintProperty(SELECTED_PARCEL_LINE_LAYER_ID, "line-color", selectedLineColor);
  }
}

function getStreetMapStyle(styleUrl: string | undefined): MapStyleConfig {
  const trimmedStyleUrl = styleUrl?.trim();

  if (trimmedStyleUrl && !trimmedStyleUrl.startsWith(OPENFREEMAP_STYLE_PREFIX)) {
    return trimmedStyleUrl;
  }

  return {
    version: 8,
    sources: {
      "usgs-topo": {
        type: "raster",
        tiles: [DEFAULT_STREET_TILE_URL],
        tileSize: 256,
        maxzoom: 16,
        attribution: DEFAULT_STREET_ATTRIBUTION
      }
    },
    layers: [
      {
        id: "usgs-topo",
        type: "raster",
        source: "usgs-topo"
      }
    ]
  };
}

function getMapConfig() {
  const centerRaw = process.env.NEXT_PUBLIC_DEFAULT_CENTER ?? "-88.5690,47.1211";
  const [lngRaw, latRaw] = centerRaw.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  const satelliteDetailTileUrlEnv = process.env.NEXT_PUBLIC_SATELLITE_DETAIL_TILE_URL;
  const satelliteDetailMinZoom = Number(process.env.NEXT_PUBLIC_SATELLITE_DETAIL_MIN_ZOOM ?? 16);
  const satelliteDetailMaxZoom = Number(process.env.NEXT_PUBLIC_SATELLITE_DETAIL_MAX_ZOOM ?? 19);

  return {
    style: getStreetMapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
    satelliteTileUrl: process.env.NEXT_PUBLIC_SATELLITE_TILE_URL ?? DEFAULT_SATELLITE_TILE_URL,
    satelliteDetailTileUrl:
      satelliteDetailTileUrlEnv === "" ? null : satelliteDetailTileUrlEnv ?? DEFAULT_SATELLITE_DETAIL_TILE_URL,
    satelliteDetailMinZoom: Number.isFinite(satelliteDetailMinZoom) ? satelliteDetailMinZoom : 16,
    satelliteDetailMaxZoom: Number.isFinite(satelliteDetailMaxZoom) ? satelliteDetailMaxZoom : 19,
    satelliteAttribution: process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION ?? DEFAULT_SATELLITE_ATTRIBUTION,
    center: [Number.isFinite(lng) ? lng : -88.569, Number.isFinite(lat) ? lat : 47.1211] as [number, number],
    zoom: Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM ?? 13)
  };
}

function getParcelLayerConfig() {
  return {
    minZoom: Number(process.env.NEXT_PUBLIC_PARCEL_MIN_ZOOM ?? 13),
    vectorTilesEnabled: process.env.NEXT_PUBLIC_PARCEL_VECTOR_TILES !== "false"
  };
}

function setGeoJsonSourceData(
  map: maplibregl.Map,
  sourceId: string,
  data: FeatureCollection<Polygon | MultiPolygon, ParcelProperties>
) {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(data);
}

function getSelectableParcelAtPoint(map: maplibregl.Map, point: maplibregl.PointLike) {
  const offlineLayerIds = [OFFLINE_PARCEL_FILL_LAYER_ID].filter((layerId) => Boolean(map.getLayer(layerId)));
  const offlineFeatures = offlineLayerIds.length > 0 ? map.queryRenderedFeatures(point, { layers: offlineLayerIds }) : [];
  const offlineParcelId =
    offlineFeatures.find((feature) => typeof feature.properties?.id === "string")?.properties?.id ?? null;

  if (offlineFeatures.length > 0) {
    return { hasFeature: true, parcelId: offlineParcelId, source: "offline" as SelectableParcelSource };
  }

  const parcelLayerIds = [PARCEL_TILE_FILL_LAYER_ID, PARCEL_GEOJSON_FILL_LAYER_ID].filter((layerId) =>
    Boolean(map.getLayer(layerId))
  );

  if (parcelLayerIds.length === 0) return { hasFeature: false, parcelId: null, source: null };

  const features = map.queryRenderedFeatures(point, { layers: parcelLayerIds });
  const parcelId = features.find((feature) => typeof feature.properties?.id === "string")?.properties?.id ?? null;
  return { hasFeature: features.length > 0, parcelId, source: features.length > 0 ? ("live" as SelectableParcelSource) : null };
}

function setMeasurementSourceData(
  map: maplibregl.Map,
  data: FeatureCollection<Geometry, MeasurementFeatureProperties>
) {
  const source = map.getSource(MEASUREMENT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(data);
}

function getSelectedParcelCameraPadding(map: maplibregl.Map): maplibregl.PaddingOptions {
  const container = map.getContainer();
  const containerHeight = container.clientHeight;
  const containerWidth = container.clientWidth;
  const sidePadding = containerWidth < 720 ? 18 : SELECTED_PARCEL_SIDE_PADDING;
  const fallbackPanelHeight = Math.min(containerHeight * (containerWidth < 720 ? 0.54 : 0.5), containerWidth < 720 ? 500 : 520);
  let coveredPanelHeight = fallbackPanelHeight;

  const panel = document.querySelector<HTMLElement>(".side-panel:not(.collapsed)");
  if (panel) {
    const mapRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    coveredPanelHeight = Math.max(0, mapRect.bottom - Math.max(mapRect.top, panelRect.top));
  }

  const top = containerWidth < 720 ? 72 : SELECTED_PARCEL_TOP_PADDING;
  const maxBottom = Math.max(80, containerHeight - top - 96);
  const bottom = Math.min(
    Math.max(coveredPanelHeight + SELECTED_PARCEL_BOTTOM_MARGIN, SELECTED_PARCEL_MIN_BOTTOM_PADDING),
    maxBottom
  );

  return {
    top,
    right: sidePadding,
    bottom,
    left: sidePadding
  };
}

function focusMapOnSelectedParcel(map: maplibregl.Map, parcel: ParcelFeature) {
  const [west, south, east, north] = turfBbox(parcel);
  if (![west, south, east, north].every(Number.isFinite)) return;

  const center: [number, number] = [(west + east) / 2, (south + north) / 2];

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!map.getContainer().isConnected) return;

      const padding = getSelectedParcelCameraPadding(map);
      const bounds = new maplibregl.LngLatBounds([west, south], [east, north]);
      const camera = map.cameraForBounds(bounds, {
        padding,
        maxZoom: Math.max(map.getZoom(), 17)
      });

      map.easeTo({
        center: camera?.center ?? center,
        zoom: camera?.zoom ?? Math.max(map.getZoom(), 17),
        duration: 700,
        essential: true
      });
    });
  });
}

function getBoundsBbox(bounds: maplibregl.LngLatBounds): OfflineAreaBbox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function fitMapToBbox(map: maplibregl.Map, bbox: OfflineAreaBbox) {
  const [west, south, east, north] = bbox;
  map.fitBounds(
    new maplibregl.LngLatBounds([west, south], [east, north]),
    {
      padding: {
        top: 72,
        right: 24,
        bottom: 220,
        left: 24
      },
      maxZoom: 17,
      duration: 700,
      essential: true
    }
  );
}

function getMeasurementDownloadBbox(mode: MeasurementMode, points: MeasurementPoint[]): OfflineAreaBbox | null {
  const minimumPointCount = mode === "area" ? 3 : mode === "rectangle" ? 2 : Number.POSITIVE_INFINITY;
  if (points.length < minimumPointCount) return null;

  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const west = Math.min(...lngs);
  const south = Math.min(...lats);
  const east = Math.max(...lngs);
  const north = Math.max(...lats);

  if (west === east || south === north) return null;
  return [west, south, east, north];
}

function createOfflineAreaId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createOfflineAreaName(source: "current-view" | "measurement", parcelCount: number) {
  const label = source === "current-view" ? "Current view" : "Measured area";
  const timestamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${label} - ${parcelCount.toLocaleString()} parcels - ${timestamp}`;
}

function findCachedParcel(featureCollection: ParcelFeatureCollection | null, parcelId: string | null) {
  if (!parcelId) return null;
  return featureCollection?.features.find((feature) => feature.properties.id === parcelId) ?? null;
}

function pointPosition(point: MeasurementPoint): Position {
  return [point.lng, point.lat];
}

function getRectangleRing(points: MeasurementPoint[]): Position[] {
  if (points.length < 2) return [];
  const [start, end] = points;
  return [
    [start.lng, start.lat],
    [end.lng, start.lat],
    [end.lng, end.lat],
    [start.lng, end.lat],
    [start.lng, start.lat]
  ];
}

function getMeasurementRing(mode: MeasurementMode, points: MeasurementPoint[]): Position[] {
  if (mode === "rectangle") return getRectangleRing(points);
  if (mode !== "area" || points.length < 3) return [];
  return [...points.map(pointPosition), pointPosition(points[0])];
}

function buildMeasurementCollection(
  mode: MeasurementMode,
  points: MeasurementPoint[]
): FeatureCollection<Geometry, MeasurementFeatureProperties> {
  if (points.length === 0) return EMPTY_MEASUREMENT_COLLECTION;

  const features: Feature<Geometry, MeasurementFeatureProperties>[] = points.map((measurementPoint, index) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: pointPosition(measurementPoint)
    },
    properties: {
      kind: "point",
      label: String(index + 1)
    }
  }));

  const ring = getMeasurementRing(mode, points);
  if (ring.length > 0) {
    features.unshift({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [ring]
      },
      properties: {
        kind: "shape"
      }
    });
  } else if (points.length > 1) {
    features.unshift({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points.map(pointPosition)
      },
      properties: {
        kind: "line"
      }
    });
  }

  return {
    type: "FeatureCollection",
    features
  };
}

function formatDistance(miles: number) {
  if (!Number.isFinite(miles) || miles <= 0) return "0 ft";
  if (miles < 0.2) return `${Math.round(miles * 5280).toLocaleString()} ft`;
  return `${miles.toLocaleString(undefined, { maximumFractionDigits: 2 })} mi`;
}

function formatArea(squareMeters: number) {
  if (!Number.isFinite(squareMeters) || squareMeters <= 0) return "0 sq ft";
  const squareFeet = squareMeters * 10.7639;
  const acres = squareMeters * 0.000247105;
  return `${acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} ac (${Math.round(squareFeet).toLocaleString()} sq ft)`;
}

function getLineDistance(points: MeasurementPoint[]) {
  if (points.length < 2) return 0;
  return turfLength(turfLineString(points.map(pointPosition)), { units: "miles" });
}

function getRingPerimeter(ring: Position[]) {
  if (ring.length < 4) return 0;
  return turfLength(turfLineString(ring), { units: "miles" });
}

function getMeasurementSummary(mode: MeasurementMode, points: MeasurementPoint[]): MeasurementSummary {
  if (mode === "distance") {
    const distance = getLineDistance(points);
    return {
      title: "Distance",
      primary: points.length > 1 ? formatDistance(distance) : "No distance yet",
      secondary: `${points.length.toLocaleString()} point${points.length === 1 ? "" : "s"}`,
      hint: points.length === 0 ? "Tap the map to add the first point." : "Tap the map to extend the route."
    };
  }

  const ring = getMeasurementRing(mode, points);
  const neededPoints = mode === "rectangle" ? 2 : 3;

  if (ring.length === 0) {
    const remaining = Math.max(neededPoints - points.length, 0);
    return {
      title: mode === "rectangle" ? "Area box" : "Area",
      primary: "No area yet",
      secondary: `${points.length.toLocaleString()} point${points.length === 1 ? "" : "s"}`,
      hint:
        remaining > 0
          ? `Add ${remaining.toLocaleString()} more point${remaining === 1 ? "" : "s"} to calculate area.`
          : "Tap the map to add points."
    };
  }

  const area = turfArea(turfPolygon([ring]));
  return {
    title: mode === "rectangle" ? "Area box" : "Area",
    primary: formatArea(area),
    secondary: `Perimeter ${formatDistance(getRingPerimeter(ring))}`,
    hint: mode === "rectangle" ? "Click a new corner to start another box." : "Tap the map to add another corner."
  };
}

type BboxPayload = {
  ok?: boolean;
  data?: FeatureCollection<Polygon | MultiPolygon, ParcelProperties>;
  count?: number;
  limit?: number;
  minZoom?: number;
  message?: string;
  tooMany?: boolean;
  shouldLoad?: boolean;
  demo?: boolean;
  error?: string;
};

type SearchPayload = {
  ok?: boolean;
  data?: ParcelSearchResult[];
  error?: string;
};

type AuthPayload = {
  ok?: boolean;
  data?: {
    authEnabled: boolean;
    accountCreationEnabled: boolean;
    authenticated: boolean;
    user: {
      id: string;
      email: string | null;
      displayName: string | null;
    } | null;
  };
  error?: string;
};

type AuthMode = "sign-in" | "create-account";

export default function ParcelMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const parcelAbortRef = useRef<AbortController | null>(null);
  const parcelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const basemapModeRef = useRef<BasemapMode>("streets");
  const activePanelRef = useRef<AppPanel>("map");
  const measurementModeRef = useRef<MeasurementMode>("distance");
  const selectedParcelRef = useRef<ParcelFeature | null>(null);
  const offlineFeatureCollectionRef = useRef<ParcelFeatureCollection | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [activePanel, setActivePanel] = useState<AppPanel>("map");
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("streets");
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>("distance");
  const [measurementPoints, setMeasurementPoints] = useState<MeasurementPoint[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [totalInView, setTotalInView] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Zoom in to view parcels.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ParcelSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authData, setAuthData] = useState<AuthPayload["data"] | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [offlineAreas, setOfflineAreas] = useState<OfflineAreaSummary[]>([]);
  const [offlineStorageSupported, setOfflineStorageSupported] = useState(false);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [activeOfflineAreaId, setActiveOfflineAreaId] = useState<string | null>(null);

  function setSelectedParcelState(nextParcel: ParcelFeature | null) {
    selectedParcelRef.current = nextParcel;
    setSelectedParcel(nextParcel);
  }

  async function refreshOfflineAreas() {
    if (!isOfflineAreaStorageSupported()) {
      setOfflineStorageSupported(false);
      setOfflineStatus("Offline area storage is not available in this browser.");
      return;
    }

    setOfflineStorageSupported(true);
    try {
      setOfflineAreas(await listOfflineAreas());
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : "Unable to load browser-saved areas");
    }
  }

  function displayOfflineArea(area: OfflineArea) {
    const map = mapRef.current;
    offlineFeatureCollectionRef.current = area.featureCollection;
    setActiveOfflineAreaId(area.id);
    setOfflineStatus(`${area.parcelCount.toLocaleString()} downloaded parcel${area.parcelCount === 1 ? "" : "s"} loaded from this browser.`);
    setOfflineError(null);

    if (map) {
      setGeoJsonSourceData(map, OFFLINE_PARCEL_SOURCE_ID, area.featureCollection);
      fitMapToBbox(map, area.bbox);
    }
  }

  function clearOfflineAreaOverlay() {
    const map = mapRef.current;
    offlineFeatureCollectionRef.current = null;
    setActiveOfflineAreaId(null);
    if (map) setGeoJsonSourceData(map, OFFLINE_PARCEL_SOURCE_ID, EMPTY_FEATURE_COLLECTION);
  }

  async function openOfflineArea(areaId: string) {
    setOfflineLoading(true);
    setOfflineError(null);

    try {
      const area = await getOfflineArea(areaId);
      if (!area) throw new Error("That downloaded area is no longer saved in this browser.");
      displayOfflineArea(area);
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : "Unable to open downloaded area");
    } finally {
      setOfflineLoading(false);
    }
  }

  async function removeOfflineArea(areaId: string) {
    setOfflineLoading(true);
    setOfflineError(null);

    try {
      await deleteOfflineArea(areaId);
      if (areaId === activeOfflineAreaId) clearOfflineAreaOverlay();
      await refreshOfflineAreas();
      setOfflineStatus("Downloaded area removed from this browser.");
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : "Unable to remove downloaded area");
    } finally {
      setOfflineLoading(false);
    }
  }

  async function downloadOfflineArea(source: "current-view" | "measurement") {
    const map = mapRef.current;
    if (!map) return;

    const bbox = source === "current-view" ? getBoundsBbox(map.getBounds()) : getMeasurementDownloadBbox(measurementMode, measurementPoints);
    if (!bbox) {
      setOfflineError("Measure an area box before downloading a measured area.");
      return;
    }

    if (!isOfflineAreaStorageSupported()) {
      setOfflineError("This browser cannot save offline parcel areas.");
      setOfflineStorageSupported(false);
      return;
    }

    setOfflineLoading(true);
    setOfflineError(null);
    setOfflineStatus("Preparing parcel area for browser storage...");

    try {
      await requestPersistentOfflineStorage();

      const zoom = Math.max(map.getZoom(), OFFLINE_DOWNLOAD_ZOOM);
      const params = new URLSearchParams({
        bbox: bbox.join(","),
        zoom: String(zoom),
        metadataOnly: "0"
      });
      const response = await fetch(`/api/parcels/bbox?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as BboxPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to download this area");
      }

      if (payload.tooMany) {
        throw new Error(payload.message ?? "This area has too many parcels. Select a smaller area and try again.");
      }

      const featureCollection = payload.data ?? EMPTY_FEATURE_COLLECTION;
      const parcelCount = featureCollection.features.length;
      if (parcelCount === 0) {
        setOfflineStatus("No parcel records were found inside that area.");
        return;
      }

      const downloadedAt = new Date().toISOString();
      const areaWithoutSize = {
        id: createOfflineAreaId(),
        name: createOfflineAreaName(source, parcelCount),
        bbox,
        zoom,
        parcelCount,
        featureCollection,
        downloadedAt
      };
      const area: OfflineArea = {
        ...areaWithoutSize,
        storageBytes: estimateOfflineAreaBytes(areaWithoutSize)
      };

      await saveOfflineArea(area);
      await refreshOfflineAreas();
      displayOfflineArea(area);
      setActivePanel("offline");
      setOfflineStatus(`${parcelCount.toLocaleString()} parcel${parcelCount === 1 ? "" : "s"} saved to this browser for offline review.`);
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : "Unable to save area to this browser");
    } finally {
      setOfflineLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const response = await fetch("/api/auth/session", {
          signal: controller.signal,
          cache: "no-store"
        });
        const payload = (await response.json()) as AuthPayload;
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? "Unable to check app access");
        }
        setAuthData(payload.data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAuthError(err instanceof Error ? err.message : "Unable to check app access");
      } finally {
        if (!controller.signal.aborted) setAuthLoading(false);
      }
    }

    void loadSession();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (authLoading || !authData?.authenticated) return;
    const timeout = window.setTimeout(() => {
      void refreshOfflineAreas();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [authData?.authenticated, authLoading]);

  useEffect(() => {
    basemapModeRef.current = basemapMode;
    const map = mapRef.current;
    if (!map?.getLayer(SATELLITE_LAYER_ID)) return;

    for (const layerId of SATELLITE_LAYER_IDS) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", basemapMode === "satellite" ? "visible" : "none");
      }
    }
    setParcelBoundaryPaint(map, basemapMode, getParcelLayerConfig().minZoom);
  }, [basemapMode]);

  useEffect(() => {
    activePanelRef.current = activePanel;
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = activePanel === "measure" ? "crosshair" : "";
  }, [activePanel]);

  useEffect(() => {
    measurementModeRef.current = measurementMode;
    const map = mapRef.current;
    if (!map) return;
    setMeasurementSourceData(map, buildMeasurementCollection(measurementMode, measurementPoints));
  }, [measurementMode, measurementPoints]);

  function addMeasurementPoint(lng: number, lat: number) {
    const nextPoint: MeasurementPoint = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      lng,
      lat
    };

    setMeasurementPoints((current) => {
      if (measurementModeRef.current === "rectangle") {
        return current.length >= 2 ? [nextPoint] : [...current, nextPoint];
      }
      return [...current, nextPoint];
    });
  }

  function changeMeasurementMode(nextMode: MeasurementMode) {
    setMeasurementMode(nextMode);
    setMeasurementPoints((current) => (nextMode === "rectangle" ? current.slice(0, 2) : current));
  }

  function removeMeasurementPoint(pointId: string) {
    setMeasurementPoints((current) => current.filter((point) => point.id !== pointId));
  }

  useEffect(() => {
    if (authLoading || !authData?.authenticated) return;
    if (!mapContainerRef.current || mapRef.current) return;

    const config = getMapConfig();
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: config.style,
      center: config.center,
      zoom: config.zoom,
      attributionControl: {
        compact: window.matchMedia("(max-width: 700px)").matches
      }
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
    mapRef.current = map;
    const parcelLayerConfig = getParcelLayerConfig();

    function clearParcels(message: string) {
      setGeoJsonSourceData(map, "parcels", EMPTY_FEATURE_COLLECTION);
      setVisibleCount(0);
      setTotalInView(0);
      setStatusMessage(message);
    }

    function setParcelGeoJsonLayerVisibility(visible: boolean) {
      for (const layerId of [PARCEL_GEOJSON_FILL_LAYER_ID, PARCEL_GEOJSON_LINE_LAYER_ID]) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
        }
      }
    }

    async function loadVisibleParcels() {
      if (!mapRef.current) return;
      const zoom = mapRef.current.getZoom();
      const minZoom = parcelLayerConfig.minZoom;

      if (zoom < minZoom) {
        parcelAbortRef.current?.abort();
        clearParcels("Zoom in to view parcels.");
        return;
      }

      const bounds = mapRef.current.getBounds();
      const params = new URLSearchParams({
        west: String(bounds.getWest()),
        south: String(bounds.getSouth()),
        east: String(bounds.getEast()),
        north: String(bounds.getNorth()),
        zoom: String(zoom),
        metadataOnly: parcelLayerConfig.vectorTilesEnabled ? "1" : "0"
      });

      parcelAbortRef.current?.abort();
      const controller = new AbortController();
      parcelAbortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/parcels/bbox?${params.toString()}`, { signal: controller.signal });
        const payload = (await response.json()) as BboxPayload;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Unable to load visible parcels");
        }

        const data = payload.data ?? EMPTY_FEATURE_COLLECTION;
        const shouldShowGeoJsonParcels = !parcelLayerConfig.vectorTilesEnabled || Boolean(payload.demo);
        setParcelGeoJsonLayerVisibility(shouldShowGeoJsonParcels);
        setGeoJsonSourceData(mapRef.current, "parcels", shouldShowGeoJsonParcels ? data : EMPTY_FEATURE_COLLECTION);
        setVisibleCount(shouldShowGeoJsonParcels ? data.features.length : (payload.count ?? 0));
        setTotalInView(payload.count ?? data.features.length);
        setStatusMessage(
          payload.message ??
            (parcelLayerConfig.vectorTilesEnabled
              ? "Parcel vector tiles active. Click a parcel for full details."
              : `${data.features.length.toLocaleString()} parcel outline${data.features.length === 1 ? "" : "s"} loaded.`)
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load visible parcels");
      } finally {
        if (parcelAbortRef.current === controller) {
          setLoading(false);
        }
      }
    }

    function queueVisibleParcelLoad(delay = 220) {
      if (parcelDebounceRef.current) clearTimeout(parcelDebounceRef.current);
      parcelDebounceRef.current = setTimeout(() => {
        void loadVisibleParcels();
      }, delay);
    }

    function setSelectedParcelFeature(nextParcel: ParcelFeature | null) {
      setSelectedParcelState(nextParcel);
      if (nextParcel) setActivePanel("details");
      setGeoJsonSourceData(
        map,
        "selected-parcel",
        nextParcel
          ? {
              type: "FeatureCollection",
              features: [nextParcel]
            }
          : EMPTY_FEATURE_COLLECTION
      );
      if (nextParcel) focusMapOnSelectedParcel(map, nextParcel);
    }

    async function selectParcelAt(lng: number, lat: number) {
      setError(null);
      try {
        const response = await fetch(`/api/parcels/lookup?lng=${lng}&lat=${lat}`);
        const payload = (await response.json()) as { ok?: boolean; data?: ParcelFeature | null; error?: string };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Unable to look up parcel");
        }

        const nextParcel = payload.data ?? null;
        if (nextParcel && nextParcel.properties.id === selectedParcelRef.current?.properties.id) {
          setSelectedParcelFeature(null);
          setStatusMessage("Parcel unselected.");
          return;
        }

        setSelectedParcelFeature(nextParcel);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to look up parcel");
      }
    }

    map.on("load", () => {
      map.addSource(SATELLITE_SOURCE_ID, {
        type: "raster",
        tiles: [config.satelliteTileUrl],
        tileSize: 256,
        maxzoom: 16,
        attribution: config.satelliteAttribution
      });

      map.addLayer({
        id: SATELLITE_LAYER_ID,
        type: "raster",
        source: SATELLITE_SOURCE_ID,
        layout: {
          visibility: basemapModeRef.current === "satellite" ? "visible" : "none"
        },
        paint: {
          "raster-opacity": 1
        }
      });

      if (config.satelliteDetailTileUrl) {
        const detailMinZoom = Math.max(0, config.satelliteDetailMinZoom);
        const detailMaxZoom = Math.max(detailMinZoom, config.satelliteDetailMaxZoom);

        map.addSource(SATELLITE_DETAIL_SOURCE_ID, {
          type: "raster",
          tiles: [config.satelliteDetailTileUrl],
          tileSize: 512,
          minzoom: detailMinZoom,
          maxzoom: detailMaxZoom,
          attribution: config.satelliteAttribution
        });

        map.addLayer({
          id: SATELLITE_DETAIL_LAYER_ID,
          type: "raster",
          source: SATELLITE_DETAIL_SOURCE_ID,
          minzoom: detailMinZoom,
          layout: {
            visibility: basemapModeRef.current === "satellite" ? "visible" : "none"
          },
          paint: {
            "raster-opacity": ["interpolate", ["linear"], ["zoom"], detailMinZoom, 0, detailMinZoom + 0.75, 1]
          }
        });
      }

      map.addSource("parcels", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION
      });

      if (parcelLayerConfig.vectorTilesEnabled) {
        map.addSource(PARCEL_TILE_SOURCE_ID, {
          type: "vector",
          tiles: [`${window.location.origin}/api/parcels/tiles/{z}/{x}/{y}`],
          minzoom: parcelLayerConfig.minZoom,
          maxzoom: 22
        });

        map.addLayer({
          id: PARCEL_TILE_FILL_LAYER_ID,
          type: "fill",
          source: PARCEL_TILE_SOURCE_ID,
          "source-layer": PARCEL_TILE_SOURCE_LAYER,
          minzoom: parcelLayerConfig.minZoom,
          paint: {
            "fill-color": "#2563eb",
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              parcelLayerConfig.minZoom,
              0.03,
              16,
              0.08
            ]
          }
        });

        map.addLayer({
          id: PARCEL_TILE_LINE_LAYER_ID,
          type: "line",
          source: PARCEL_TILE_SOURCE_ID,
          "source-layer": PARCEL_TILE_SOURCE_LAYER,
          minzoom: parcelLayerConfig.minZoom,
          paint: {
            "line-color": STREET_PARCEL_LINE_COLOR,
            "line-opacity": getStreetParcelTileLineOpacity(parcelLayerConfig.minZoom),
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              parcelLayerConfig.minZoom,
              0.55,
              17,
              1.25
            ]
          }
        });
      }

      map.addSource("selected-parcel", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION
      });

      map.addLayer({
        id: PARCEL_GEOJSON_FILL_LAYER_ID,
        type: "fill",
        source: "parcels",
        layout: {
          visibility: parcelLayerConfig.vectorTilesEnabled ? "none" : "visible"
        },
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.08
        }
      });

      map.addLayer({
        id: PARCEL_GEOJSON_LINE_LAYER_ID,
        type: "line",
        source: "parcels",
        layout: {
          visibility: parcelLayerConfig.vectorTilesEnabled ? "none" : "visible"
        },
        paint: {
          "line-color": STREET_PARCEL_LINE_COLOR,
          "line-opacity": 0.65,
          "line-width": 1
        }
      });

      map.addSource(OFFLINE_PARCEL_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION
      });

      map.addLayer({
        id: OFFLINE_PARCEL_FILL_LAYER_ID,
        type: "fill",
        source: OFFLINE_PARCEL_SOURCE_ID,
        paint: {
          "fill-color": "#10b981",
          "fill-opacity": 0.14
        }
      });

      map.addLayer({
        id: OFFLINE_PARCEL_LINE_LAYER_ID,
        type: "line",
        source: OFFLINE_PARCEL_SOURCE_ID,
        paint: {
          "line-color": "#047857",
          "line-opacity": 0.86,
          "line-width": 1.4
        }
      });

      map.addLayer({
        id: "selected-parcel-fill",
        type: "fill",
        source: "selected-parcel",
        paint: {
          "fill-color": "#f97316",
          "fill-opacity": 0.22
        }
      });

      map.addLayer({
        id: SELECTED_PARCEL_LINE_LAYER_ID,
        type: "line",
        source: "selected-parcel",
        paint: {
          "line-color": STREET_SELECTED_PARCEL_LINE_COLOR,
          "line-width": 3
        }
      });

      map.addSource(MEASUREMENT_SOURCE_ID, {
        type: "geojson",
        data: buildMeasurementCollection(measurementModeRef.current, [])
      });

      map.addLayer({
        id: MEASUREMENT_FILL_LAYER_ID,
        type: "fill",
        source: MEASUREMENT_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#14b8a6",
          "fill-opacity": 0.22
        }
      });

      map.addLayer({
        id: MEASUREMENT_LINE_LAYER_ID,
        type: "line",
        source: MEASUREMENT_SOURCE_ID,
        filter: ["!=", ["geometry-type"], "Point"],
        paint: {
          "line-color": "#0f766e",
          "line-width": 3,
          "line-dasharray": [1.5, 1]
        }
      });

      map.addLayer({
        id: MEASUREMENT_POINT_LAYER_ID,
        type: "circle",
        source: MEASUREMENT_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#0f766e",
          "circle-stroke-width": 3
        }
      });

      setParcelBoundaryPaint(map, basemapModeRef.current, parcelLayerConfig.minZoom);
      queueVisibleParcelLoad(0);
    });

    map.on("moveend", () => {
      queueVisibleParcelLoad();
    });

    map.on("click", async (event) => {
      if (activePanelRef.current === "measure") {
        addMeasurementPoint(event.lngLat.lng, event.lngLat.lat);
        return;
      }

      if (map.getZoom() < parcelLayerConfig.minZoom) {
        setStatusMessage("Zoom in until parcel outlines are visible before selecting a parcel.");
        return;
      }

      const clickedParcel = getSelectableParcelAtPoint(map, event.point);
      if (!clickedParcel.hasFeature) {
        setStatusMessage("Click a visible parcel outline to select it.");
        return;
      }

      if (clickedParcel.parcelId && clickedParcel.parcelId === selectedParcelRef.current?.properties.id) {
        setSelectedParcelFeature(null);
        setStatusMessage("Parcel unselected.");
        return;
      }

      if (clickedParcel.source === "offline") {
        const cachedParcel = findCachedParcel(offlineFeatureCollectionRef.current, clickedParcel.parcelId);
        if (cachedParcel) {
          setSelectedParcelFeature(cachedParcel);
          setStatusMessage("Selected parcel from a downloaded browser area.");
          return;
        }
      }

      await selectParcelAt(event.lngLat.lng, event.lngLat.lat);
    });

    return () => {
      parcelAbortRef.current?.abort();
      if (parcelDebounceRef.current) clearTimeout(parcelDebounceRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, [authData?.authenticated, authLoading]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUsername.trim() || undefined,
          password: authPassword
        })
      });
      const payload = (await response.json()) as AuthPayload;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to sign in");
      }
      setAuthData(payload.data);
      setAuthPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Unable to sign in");
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);

    if (signupPassword !== signupPasswordConfirm) {
      setAuthError("Passwords do not match");
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signupEmail.trim(),
          displayName: signupName.trim() || undefined,
          password: signupPassword
        })
      });
      const payload = (await response.json()) as AuthPayload;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to create account");
      }

      setAuthData(payload.data);
      setSignupPassword("");
      setSignupPasswordConfirm("");
      setAuthPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Unable to create account");
    }
  }

  async function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchError("Enter at least 2 characters.");
      setSearchResults([]);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({ q: query, limit: "12" });
      const response = await fetch(`/api/parcels/search?${params.toString()}`, { signal: controller.signal });
      const payload = (await response.json()) as SearchPayload;

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Parcel search failed");
      }

      setSearchResults(payload.data);
      if (payload.data.length === 0) setSearchError("No parcel matches found.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSearchError(err instanceof Error ? err.message : "Parcel search failed");
    } finally {
      if (searchAbortRef.current === controller) setSearchLoading(false);
    }
  }

  async function selectSearchResult(result: ParcelSearchResult) {
    if (!result.center) return;
    const [lng, lat] = result.center.coordinates;
    const map = mapRef.current;

    try {
      const response = await fetch(`/api/parcels/lookup?lng=${lng}&lat=${lat}`);
      const payload = (await response.json()) as { ok?: boolean; data?: ParcelFeature | null; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Unable to load selected parcel");

      const nextParcel = payload.data ?? null;
      setSelectedParcelState(nextParcel);
      if (nextParcel) setActivePanel("details");
      const selectedSource = map?.getSource("selected-parcel") as maplibregl.GeoJSONSource | undefined;
      selectedSource?.setData(
        nextParcel
          ? {
              type: "FeatureCollection",
              features: [nextParcel]
            }
          : EMPTY_FEATURE_COLLECTION
      );
      if (map && nextParcel) focusMapOnSelectedParcel(map, nextParcel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load selected parcel");
    }
  }

  if (authLoading) {
    return (
      <div className="map-layout">
        <section className="auth-panel">
          <h2>Checking access…</h2>
          <p>Loading your private parcel workspace.</p>
        </section>
      </div>
    );
  }

  if (authError && !authData) {
    return (
      <div className="map-layout">
        <section className="auth-panel">
          <h2>Unable to check access</h2>
          <p>{authError}</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      </div>
    );
  }

  if (authData?.authEnabled && !authData.authenticated) {
    const canCreateAccount = Boolean(authData.accountCreationEnabled);
    const signupDisabled =
      !signupEmail.trim() ||
      signupPassword.length < 8 ||
      signupPassword !== signupPasswordConfirm;

    return (
      <div className="map-layout">
        <section className="auth-panel">
          {authMode === "sign-in" ? (
            <>
              <h2>Private parcel workspace</h2>
              <p>Sign in to view Houghton County parcel data and saved projects.</p>
              <form className="form-stack" onSubmit={login}>
                <label>
                  Email or username
                  <input
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label>
                  Password
                  <input
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
                <button className="primary-button" disabled={!authPassword}>
                  Sign in
                </button>
                {authError ? <p className="message error">{authError}</p> : null}
              </form>
              {canCreateAccount ? (
                <div className="auth-action-row">
                  <span>Need access?</span>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setAuthMode("create-account");
                    }}
                  >
                    Create an account
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h2>Create an account</h2>
              <p>Use your email and a password to set up your own login.</p>
              <form className="form-stack" onSubmit={createAccount}>
                <label>
                  Name
                  <input
                    value={signupName}
                    onChange={(event) => setSignupName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Email
                  <input
                    value={signupEmail}
                    onChange={(event) => setSignupEmail(event.target.value)}
                    autoComplete="email"
                    type="email"
                  />
                </label>
                <label>
                  Password
                  <input
                    value={signupPassword}
                    onChange={(event) => setSignupPassword(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Confirm password
                  <input
                    value={signupPasswordConfirm}
                    onChange={(event) => setSignupPasswordConfirm(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
                <button className="primary-button" disabled={signupDisabled}>
                  Create account
                </button>
                {authError ? <p className="message error">{authError}</p> : null}
              </form>
              <div className="auth-action-row">
                <span>Already have an account?</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthMode("sign-in");
                  }}
                >
                  Sign in
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="map-layout">
      <div className="map-wrap">
        <div ref={mapContainerRef} className="map-canvas" />
        <button
          className="map-basemap-button"
          type="button"
          aria-label={basemapMode === "streets" ? "Switch to satellite view" : "Switch to map view"}
          aria-pressed={basemapMode === "satellite"}
          title={basemapMode === "streets" ? "Switch to satellite view" : "Switch to map view"}
          onClick={() => setBasemapMode((current) => (current === "streets" ? "satellite" : "streets"))}
        >
          <span className="map-basemap-icon">{basemapMode === "streets" ? <TreeIcon /> : <GlobeIcon />}</span>
        </button>
      </div>
      <ParcelDetails
        activePanel={activePanel}
        onActivePanelChange={setActivePanel}
        parcel={selectedParcel}
        visibleCount={visibleCount}
        totalInView={totalInView}
        loading={loading}
        error={error}
        statusMessage={statusMessage}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearchSubmit={runSearch}
        searchResults={searchResults}
        searchLoading={searchLoading}
        searchError={searchError}
        onSearchResultClick={selectSearchResult}
        onSavedParcelClick={selectSearchResult}
        measurementMode={measurementMode}
        measurementPoints={measurementPoints}
        measurementSummary={getMeasurementSummary(measurementMode, measurementPoints)}
        onMeasurementModeChange={changeMeasurementMode}
        onMeasurementPointRemove={removeMeasurementPoint}
        onMeasurementUndo={() => setMeasurementPoints((current) => current.slice(0, -1))}
        onMeasurementClear={() => setMeasurementPoints([])}
        offlineAreas={offlineAreas}
        offlineStorageSupported={offlineStorageSupported}
        offlineLoading={offlineLoading}
        offlineStatus={offlineStatus}
        offlineError={offlineError}
        activeOfflineAreaId={activeOfflineAreaId}
        offlineMeasuredAreaAvailable={Boolean(getMeasurementDownloadBbox(measurementMode, measurementPoints))}
        onOfflineCurrentViewDownload={() => void downloadOfflineArea("current-view")}
        onOfflineMeasuredAreaDownload={() => void downloadOfflineArea("measurement")}
        onOfflineAreaOpen={(areaId) => void openOfflineArea(areaId)}
        onOfflineAreaDelete={(areaId) => void removeOfflineArea(areaId)}
      />
    </div>
  );
}
