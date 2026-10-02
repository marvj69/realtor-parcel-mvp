"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type * as MapLibre from "maplibre-gl";
import type MapLibreDefault from "maplibre-gl";

let maplibregl: typeof MapLibreDefault;
import {
  area as turfArea,
  bbox as turfBbox,
  booleanPointInPolygon,
  length as turfLength,
  lineString as turfLineString,
  polygon as turfPolygon
} from "@turf/turf";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
import WorkspaceChrome, { type WorkspacePopover } from "@/components/WorkspaceChrome";
import ParcelDetails from "@/components/ParcelDetails";
import Icon from "@/components/Icon";
import BrandMark from "@/components/Brand";
import Contours from "@/components/Contours";
import { readStored, STORAGE_KEYS, writeStored } from "@/lib/browser-prefs";
import { currentLayoutMode, useLayoutMode } from "@/lib/layout-mode";
import { MAP_THEME } from "@/lib/map-theme";
import { formatAddress, parcelTitle, tagColor } from "@/lib/parcel-presentation";
import { useSavedProjects } from "@/lib/saved-work-client";
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
import type {
  ParcelFeature,
  ParcelFeatureCollection,
  ParcelProperties,
  ParcelSearchResult,
  SavedParcelSummary
} from "@/types/parcel";

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
const SATELLITE_SOURCE_ID = "satellite-imagery";
const SATELLITE_LAYER_ID = "satellite-imagery-layer";
const SATELLITE_DETAIL_SOURCE_ID = "satellite-imagery-detail";
const SATELLITE_DETAIL_LAYER_ID = "satellite-imagery-detail-layer";
const SATELLITE_ROAD_LABEL_SOURCE_ID = "satellite-road-labels";
const SATELLITE_ROAD_LABEL_LAYER_ID = "satellite-road-labels-layer";
const SATELLITE_PLACE_LABEL_SOURCE_ID = "satellite-place-labels";
const SATELLITE_PLACE_LABEL_LAYER_ID = "satellite-place-labels-layer";
const SATELLITE_LAYER_IDS = [
  SATELLITE_LAYER_ID,
  SATELLITE_DETAIL_LAYER_ID,
  SATELLITE_ROAD_LABEL_LAYER_ID,
  SATELLITE_PLACE_LABEL_LAYER_ID
];
const PARCEL_TILE_FILL_LAYER_ID = "parcel-tile-fill";
const PARCEL_TILE_LINE_LAYER_ID = "parcel-tile-line";
const PARCEL_GEOJSON_FILL_LAYER_ID = "parcel-fill";
const PARCEL_GEOJSON_LINE_LAYER_ID = "parcel-line";
const OFFLINE_PARCEL_SOURCE_ID = "offline-parcels";
const OFFLINE_PARCEL_FILL_LAYER_ID = "offline-parcel-fill";
const OFFLINE_PARCEL_LINE_LAYER_ID = "offline-parcel-line";
const SELECTED_PARCEL_LINE_LAYER_ID = "selected-parcel-line";
const PARCEL_TILE_HOVER_LAYER_ID = "parcel-tile-hover";
const PARCEL_GEOJSON_HOVER_LAYER_ID = "parcel-hover";
const OFFLINE_PARCEL_HOVER_LAYER_ID = "offline-parcel-hover";
const SAVED_PARCEL_SOURCE_ID = "saved-parcels";
const SAVED_PARCEL_LAYER_ID = "saved-parcel-points";
// Bump when tile feature properties change so browsers skip tiles cached with the old schema.
const PARCEL_TILE_SCHEMA = 2;
const HOVER_FILTER_NONE: MapLibre.FilterSpecification = ["==", ["get", "id"], ""];
const MEASUREMENT_SOURCE_ID = "measurements";
const MEASUREMENT_FILL_LAYER_ID = "measurement-fill";
const MEASUREMENT_LINE_LAYER_ID = "measurement-line";
const MEASUREMENT_POINT_LAYER_ID = "measurement-points";
const PARCEL_TILE_CASING_LAYER_ID = "parcel-tile-casing";
const SELECTED_PARCEL_CASING_LAYER_ID = "selected-parcel-casing";
const OPENFREEMAP_STYLE_PREFIX = "https://tiles.openfreemap.org/styles/";
const DEFAULT_STREET_TILE_URL =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_STREET_ATTRIBUTION = "USGS The National Map: US Topo";
const DEFAULT_SATELLITE_TILE_URL =
  "https://imagery.michigan.gov/server/rest/services/Michigan_imagery_public/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_SATELLITE_MAX_ZOOM = 19;
const DEFAULT_SATELLITE_DETAIL_TILE_URL: string | null = null;
const DEFAULT_SATELLITE_ATTRIBUTION = "State of Michigan public imagery";
const DEFAULT_SATELLITE_DETAIL_MIN_ZOOM = 19;
const DEFAULT_SATELLITE_DETAIL_MAX_ZOOM = 19;
const DEFAULT_SATELLITE_ROAD_LABEL_TILE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_SATELLITE_PLACE_LABEL_TILE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_SATELLITE_LABEL_MAX_ZOOM = 18;
const DEFAULT_SATELLITE_LABEL_ATTRIBUTION =
  "Esri, HERE, Garmin, OpenStreetMap contributors, and the GIS user community";
const SATELLITE_DETAIL_FADE_ZOOM_DELTA = 0.75;
const MAPLIBRE_WORKER_LIMIT = 4;
const MAP_TILE_CACHE_ZOOM_LEVELS = 8;
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
type MapPrefs = {
  basemap: BasemapMode;
  boundaries: boolean;
  labels: boolean;
  fillOpacity: number;
  savedLayer: boolean;
};
const DEFAULT_MAP_PREFS: MapPrefs = {
  basemap: "streets",
  boundaries: true,
  labels: true,
  fillOpacity: 8,
  savedLayer: true
};

function readMapPrefs(): MapPrefs {
  const stored = readStored<Partial<MapPrefs>>(
    STORAGE_KEYS.mapPrefs,
    {},
    (value): value is Partial<MapPrefs> => typeof value === "object" && value !== null
  );
  return {
    basemap: stored.basemap === "satellite" ? "satellite" : "streets",
    boundaries: typeof stored.boundaries === "boolean" ? stored.boundaries : DEFAULT_MAP_PREFS.boundaries,
    labels: typeof stored.labels === "boolean" ? stored.labels : DEFAULT_MAP_PREFS.labels,
    fillOpacity:
      typeof stored.fillOpacity === "number" && stored.fillOpacity >= 0 && stored.fillOpacity <= 50
        ? stored.fillOpacity
        : DEFAULT_MAP_PREFS.fillOpacity,
    savedLayer: typeof stored.savedLayer === "boolean" ? stored.savedLayer : DEFAULT_MAP_PREFS.savedLayer
  };
}

const isRecentList = (value: unknown): value is ParcelProperties[] =>
  Array.isArray(value) && value.every((item) => typeof item?.id === "string");

function syncParcelUrl(parcelId: string | null) {
  const url = new URL(window.location.href);
  if (parcelId) url.searchParams.set("parcel", parcelId);
  else url.searchParams.delete("parcel");
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

function savedParcelCollection(savedParcels: SavedParcelSummary[]) {
  const byParcel = new Map<string, SavedParcelSummary>();
  for (const saved of savedParcels) if (saved.center && !byParcel.has(saved.parcel.id)) byParcel.set(saved.parcel.id, saved);
  return {
    type: "FeatureCollection" as const,
    features: [...byParcel.values()].map((saved) => ({
      type: "Feature" as const,
      geometry: saved.center!,
      properties: { id: saved.parcel.id, color: tagColor(saved.tag), title: parcelTitle(saved.parcel) }
    }))
  };
}
type MapStyleConfig = string | MapLibre.StyleSpecification;
type LayerVisibility = "visible" | "none";
type LayerVisibilityById = Record<string, LayerVisibility>;
type SelectableParcelSource = "live" | "offline";

/** Zoom-dependent value: calm at the first parcel zoom, full strength four levels closer. */
function zoomRamp(minZoom: number, values: [number, number, number]): MapLibre.ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    minZoom,
    values[0],
    minZoom + 2,
    values[1],
    minZoom + 4,
    values[2]
  ];
}

function configureMapPerformance() {
  const availableCores = navigator.hardwareConcurrency || 2;
  maplibregl.setWorkerCount(Math.min(Math.max(2, Math.floor(availableCores / 2)), MAPLIBRE_WORKER_LIMIT));
}

/**
 * Every parcel color, width and opacity is set here, so a basemap or preference change can never leave
 * layers disagreeing. Outlines stay faint at the first parcel zoom and sharpen as you zoom in, which keeps
 * dense towns readable instead of a solid mesh of lines.
 */
function paintParcelLayers(
  map: MapLibre.Map,
  mode: BasemapMode,
  prefs: { boundaries: boolean; fillOpacity: number },
  minZoom: number
) {
  const satellite = mode === "satellite";
  const theme = satellite ? MAP_THEME.satellite : MAP_THEME.streets;
  const show = prefs.boundaries;
  const fill = prefs.fillOpacity / 100;
  const set = (layerId: string, paint: Record<string, unknown>) => {
    if (!map.getLayer(layerId)) return;
    for (const [property, value] of Object.entries(paint)) map.setPaintProperty(layerId, property, value as never);
  };

  const lineOpacity = show ? zoomRamp(minZoom, satellite ? [0.5, 0.8, 0.95] : [0.4, 0.65, 0.92]) : 0;
  const lineWidth = zoomRamp(minZoom, satellite ? [0.7, 1, 1.5] : [0.55, 0.9, 1.4]);
  const tileFill = show ? zoomRamp(minZoom, [0, fill / 2, fill]) : 0;

  set(PARCEL_TILE_FILL_LAYER_ID, { "fill-color": theme.fill, "fill-opacity": tileFill });
  set(PARCEL_TILE_LINE_LAYER_ID, { "line-color": theme.line, "line-opacity": lineOpacity, "line-width": lineWidth });
  set(PARCEL_TILE_CASING_LAYER_ID, {
    "line-color": theme.casing,
    "line-opacity": show ? zoomRamp(minZoom, [0.22, 0.32, 0.4]) : 0,
    "line-width": zoomRamp(minZoom, [1.8, 2.4, 3.2])
  });
  set(PARCEL_GEOJSON_FILL_LAYER_ID, { "fill-color": theme.fill, "fill-opacity": show ? fill : 0 });
  set(PARCEL_GEOJSON_LINE_LAYER_ID, {
    "line-color": theme.line,
    "line-opacity": show ? (satellite ? 0.9 : 0.75) : 0,
    "line-width": satellite ? 1.2 : 1
  });
  set(OFFLINE_PARCEL_FILL_LAYER_ID, { "fill-color": MAP_THEME.offline.fill, "fill-opacity": show ? fill : 0 });
  set(OFFLINE_PARCEL_LINE_LAYER_ID, { "line-color": MAP_THEME.offline.line, "line-opacity": show ? 0.9 : 0 });
  for (const layerId of [PARCEL_TILE_HOVER_LAYER_ID, PARCEL_GEOJSON_HOVER_LAYER_ID, OFFLINE_PARCEL_HOVER_LAYER_ID]) {
    set(layerId, { "line-color": layerId === OFFLINE_PARCEL_HOVER_LAYER_ID ? MAP_THEME.offline.line : theme.hover });
  }
  set("selected-parcel-fill", { "fill-color": theme.selectedFill, "fill-opacity": satellite ? 0.3 : 0.22 });
  set(SELECTED_PARCEL_CASING_LAYER_ID, { "line-color": theme.casing, "line-opacity": satellite ? 0.6 : 0.95 });
  set(SELECTED_PARCEL_LINE_LAYER_ID, { "line-color": theme.selected });
}

function getStyleLayerVisibility(layer: MapLibre.LayerSpecification): LayerVisibility {
  return layer.layout?.visibility === "none" ? "none" : "visible";
}

function captureStreetBasemapLayerVisibility(map: MapLibre.Map): LayerVisibilityById {
  const layers = map.getStyle().layers ?? [];
  return Object.fromEntries(layers.map((layer) => [layer.id, getStyleLayerVisibility(layer)]));
}

function setStreetBasemapVisibility(
  map: MapLibre.Map,
  basemapMode: BasemapMode,
  streetLayerVisibility: LayerVisibilityById
) {
  for (const [layerId, originalVisibility] of Object.entries(streetLayerVisibility)) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", basemapMode === "streets" ? originalVisibility : "none");
    }
  }
}

function setSatelliteBasemapVisibility(map: MapLibre.Map, basemapMode: BasemapMode) {
  for (const layerId of SATELLITE_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", basemapMode === "satellite" ? "visible" : "none");
    }
  }
}

function applyBasemapMode(map: MapLibre.Map, basemapMode: BasemapMode, streetLayerVisibility: LayerVisibilityById) {
  setStreetBasemapVisibility(map, basemapMode, streetLayerVisibility);
  setSatelliteBasemapVisibility(map, basemapMode);
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
        source: "usgs-topo",
        // Muted so parcel outlines carry the map. Past the source's native detail (z16) the raster only
        // magnifies, so it fades toward the neutral map background instead of showing blurry labels.
        paint: {
          "raster-saturation": -0.35,
          "raster-contrast": -0.08,
          "raster-brightness-max": 0.98,
          "raster-opacity": ["interpolate", ["linear"], ["zoom"], 15.8, 1, 17.6, 0.42]
        }
      }
    ]
  };
}

function getDefaultSatelliteMaxZoom(tileUrl: string) {
  return tileUrl.includes("/USGSImageryOnly/MapServer/tile/") ? 16 : DEFAULT_SATELLITE_MAX_ZOOM;
}

function getMapConfig() {
  const centerRaw = process.env.NEXT_PUBLIC_DEFAULT_CENTER ?? "-88.5690,47.1211";
  const [lngRaw, latRaw] = centerRaw.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  const satelliteTileUrl = process.env.NEXT_PUBLIC_SATELLITE_TILE_URL ?? DEFAULT_SATELLITE_TILE_URL;
  const satelliteMaxZoom = Number(
    process.env.NEXT_PUBLIC_SATELLITE_MAX_ZOOM ?? getDefaultSatelliteMaxZoom(satelliteTileUrl)
  );
  const satelliteDetailTileUrlEnv = process.env.NEXT_PUBLIC_SATELLITE_DETAIL_TILE_URL;
  const satelliteDetailMinZoom = Number(
    process.env.NEXT_PUBLIC_SATELLITE_DETAIL_MIN_ZOOM ?? DEFAULT_SATELLITE_DETAIL_MIN_ZOOM
  );
  const satelliteDetailMaxZoom = Number(
    process.env.NEXT_PUBLIC_SATELLITE_DETAIL_MAX_ZOOM ?? DEFAULT_SATELLITE_DETAIL_MAX_ZOOM
  );
  const satelliteRoadLabelTileUrlEnv = process.env.NEXT_PUBLIC_SATELLITE_ROAD_LABEL_TILE_URL;
  const satellitePlaceLabelTileUrlEnv = process.env.NEXT_PUBLIC_SATELLITE_PLACE_LABEL_TILE_URL;
  const satelliteLabelMaxZoom = Number(
    process.env.NEXT_PUBLIC_SATELLITE_LABEL_MAX_ZOOM ?? DEFAULT_SATELLITE_LABEL_MAX_ZOOM
  );

  return {
    style: getStreetMapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
    satelliteTileUrl,
    satelliteMaxZoom: Number.isFinite(satelliteMaxZoom)
      ? satelliteMaxZoom
      : getDefaultSatelliteMaxZoom(satelliteTileUrl),
    satelliteDetailTileUrl:
      satelliteDetailTileUrlEnv === "" ? null : satelliteDetailTileUrlEnv ?? DEFAULT_SATELLITE_DETAIL_TILE_URL,
    satelliteDetailMinZoom: Number.isFinite(satelliteDetailMinZoom)
      ? satelliteDetailMinZoom
      : DEFAULT_SATELLITE_DETAIL_MIN_ZOOM,
    satelliteDetailMaxZoom: Number.isFinite(satelliteDetailMaxZoom)
      ? satelliteDetailMaxZoom
      : DEFAULT_SATELLITE_DETAIL_MAX_ZOOM,
    satelliteRoadLabelTileUrl:
      satelliteRoadLabelTileUrlEnv === ""
        ? null
        : satelliteRoadLabelTileUrlEnv ?? DEFAULT_SATELLITE_ROAD_LABEL_TILE_URL,
    satellitePlaceLabelTileUrl:
      satellitePlaceLabelTileUrlEnv === ""
        ? null
        : satellitePlaceLabelTileUrlEnv ?? DEFAULT_SATELLITE_PLACE_LABEL_TILE_URL,
    satelliteLabelMaxZoom: Number.isFinite(satelliteLabelMaxZoom)
      ? satelliteLabelMaxZoom
      : DEFAULT_SATELLITE_LABEL_MAX_ZOOM,
    satelliteLabelAttribution:
      process.env.NEXT_PUBLIC_SATELLITE_LABEL_ATTRIBUTION ?? DEFAULT_SATELLITE_LABEL_ATTRIBUTION,
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
  map: MapLibre.Map,
  sourceId: string,
  data: FeatureCollection<Polygon | MultiPolygon, ParcelProperties>
) {
  const source = map.getSource(sourceId) as MapLibre.GeoJSONSource | undefined;
  if (source) source.setData(data);
}

function getSelectableParcelAtPoint(map: MapLibre.Map, point: MapLibre.PointLike) {
  const offlineLayerIds = [OFFLINE_PARCEL_FILL_LAYER_ID].filter((layerId) => Boolean(map.getLayer(layerId)));
  const offlineFeatures =
    offlineLayerIds.length > 0 ? map.queryRenderedFeatures(point, { layers: offlineLayerIds }) : [];
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
  return {
    hasFeature: features.length > 0,
    parcelId,
    source: features.length > 0 ? ("live" as SelectableParcelSource) : null
  };
}

function setMeasurementSourceData(
  map: MapLibre.Map,
  data: FeatureCollection<Geometry, MeasurementFeatureProperties>
) {
  const source = map.getSource(MEASUREMENT_SOURCE_ID) as MapLibre.GeoJSONSource | undefined;
  if (source) source.setData(data);
}

function getSelectedParcelCameraPadding(map: MapLibre.Map): MapLibre.PaddingOptions {
  // In the side layout the map element already excludes the panel; only floating controls need room.
  if (currentLayoutMode() !== "sheet") return { top: 96, right: 80, bottom: 80, left: 60 };
  const container = map.getContainer();
  const containerHeight = container.clientHeight;
  const containerWidth = container.clientWidth;
  const sidePadding = containerWidth < 720 ? 18 : SELECTED_PARCEL_SIDE_PADDING;
  const panel = document.querySelector<HTMLElement>(".side-panel:not(.collapsed)");
  // The sheet animates to its next height, so use the height it is heading to rather than where it is now.
  const targetHeight = panel ? parseFloat(panel.style.getPropertyValue("--sheet-px")) : Number.NaN;
  const coveredPanelHeight = Number.isFinite(targetHeight) ? targetHeight : Math.min(containerHeight * 0.52, 420);

  const top = containerWidth < 720 ? 76 : SELECTED_PARCEL_TOP_PADDING;
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

function focusMapOnSelectedParcel(map: MapLibre.Map, parcel: ParcelFeature) {
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

function getBoundsBbox(bounds: MapLibre.LngLatBounds): OfflineAreaBbox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function fitMapToBbox(map: MapLibre.Map, bbox: OfflineAreaBbox) {
  const [west, south, east, north] = bbox;
  map.fitBounds(new maplibregl.LngLatBounds([west, south], [east, north]), {
    padding: getSelectedParcelCameraPadding(map),
    maxZoom: 17,
    duration: 700,
    essential: true
  });
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
  return `${acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} ac (${Math.round(
    squareFeet
  ).toLocaleString()} sq ft)`;
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
    vectorTilesAvailable?: boolean;
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

/** Full-screen frame for sign-in and status screens. The brand panel only shows on wide screens. */
function AuthShell({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  return (
    <div className="auth-screen">
      {bare ? null : (
        <aside className="auth-aside" aria-hidden="true">
          <Contours />
          <div className="auth-aside-inner">
            <span className="brand">
              <BrandMark />
              <span className="brand-name">Parcel</span>
            </span>
            <div className="auth-aside-copy">
              <p className="auth-aside-title">Parcel records for Upper Peninsula real estate.</p>
              <p>Search public parcel data, compare properties, and keep your notes organized by client.</p>
            </div>
          </div>
        </aside>
      )}
      <main className="auth-main">{children}</main>
    </div>
  );
}

export default function ParcelMap() {
  const [initialPrefs] = useState(readMapPrefs);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibre.Map | null>(null);
  const parcelAbortRef = useRef<AbortController | null>(null);
  const parcelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parcelRefreshRef = useRef<(() => void) | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const selectionRequestRef = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const basemapModeRef = useRef<BasemapMode>(initialPrefs.basemap);
  const satelliteLabelsReadyRef = useRef(false);
  const activePanelRef = useRef<AppPanel>("search");
  const measurementModeRef = useRef<MeasurementMode>("distance");
  const selectedParcelRef = useRef<ParcelFeature | null>(null);
  const offlineFeatureCollectionRef = useRef<ParcelFeatureCollection | null>(null);
  const streetLayerVisibilityRef = useRef<LayerVisibilityById>({});
  const recentFeaturesRef = useRef(new Map<string, ParcelFeature>());
  const userLocationMarkerRef = useRef<MapLibre.Marker | null>(null);
  const hoverTipRef = useRef<HTMLDivElement | null>(null);
  const navHostRef = useRef<HTMLDivElement | null>(null);
  const setNavHost = useCallback((element: HTMLDivElement | null) => {
    navHostRef.current = element;
  }, []);
  const layoutMode = useLayoutMode();
  const openPopoverRef = useRef<WorkspacePopover>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  // Phones open on the map itself; the Explore sheet is one tap away.
  const [activePanel, setActivePanel] = useState<AppPanel>(() => (currentLayoutMode() === "sheet" ? "map" : "search"));
  const [basemapMode, setBasemapMode] = useState<BasemapMode>(initialPrefs.basemap);
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>("distance");
  const [measurementPoints, setMeasurementPoints] = useState<MeasurementPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ParcelSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mapLibraryReady, setMapLibraryReady] = useState(false);
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

  const [recentParcels, setRecentParcels] = useState<ParcelProperties[]>(() =>
    readStored(STORAGE_KEYS.recentParcels, [], isRecentList)
  );
  const [compareParcels, setCompareParcels] = useState<ParcelFeature[]>([]);
  const [boundaries, setBoundaries] = useState(initialPrefs.boundaries);
  const [labels, setLabels] = useState(initialPrefs.labels);
  const [fillOpacity, setFillOpacity] = useState(initialPrefs.fillOpacity);
  const [savedLayer, setSavedLayer] = useState(initialPrefs.savedLayer);
  const overlayPreferencesRef = useRef({
    boundaries: initialPrefs.boundaries,
    labels: initialPrefs.labels,
    fillOpacity: initialPrefs.fillOpacity
  });
  const [openPopover, setOpenPopover] = useState<WorkspacePopover>(null);
  const [mapReady, setMapReady] = useState(false);
  const [belowParcelZoom, setBelowParcelZoom] = useState(false);
  const [pinnedResults, setPinnedResults] = useState<ParcelSearchResult[]>([]);
  const [locating, setLocating] = useState(false);
  const [online, setOnline] = useState(true);
  const [coordinate, setCoordinate] = useState("47.12110° N · 88.56900° W");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable) ||
        document.querySelector("dialog[open]")
      )
        return;
      if (event.key === "/") {
        event.preventDefault();
        focusSearch();
      }
      if (event.key.toLowerCase() === "m") setActivePanel("measure");
      if (event.key.toLowerCase() === "s") setActivePanel("saved");
      // Escape backs out one level: popover, then panel, then the selected parcel.
      if (event.key === "Escape") {
        if (openPopoverRef.current) setOpenPopover(null);
        else if (activePanelRef.current !== "map") setActivePanel("map");
        else if (selectedParcelRef.current) clearSelection();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("keydown", keyboard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers call helpers that only use refs and setters
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), Math.max(4500, toast.length * 55));
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    openPopoverRef.current = openPopover;
  }, [openPopover]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.mapPrefs, { basemap: basemapMode, boundaries, labels, fillOpacity, savedLayer });
  }, [basemapMode, boundaries, labels, fillOpacity, savedLayer]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.recentParcels, recentParcels);
  }, [recentParcels]);

  const savedProjects = useSavedProjects(!authLoading && Boolean(authData?.authenticated));

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const source = map.getSource(SAVED_PARCEL_SOURCE_ID) as MapLibre.GeoJSONSource | undefined;
    source?.setData(savedParcelCollection(savedProjects.projects.flatMap((project) => project.savedParcels)));
    if (map.getLayer(SAVED_PARCEL_LAYER_ID))
      map.setLayoutProperty(SAVED_PARCEL_LAYER_ID, "visibility", savedLayer ? "visible" : "none");
  }, [mapReady, savedProjects.projects, savedLayer]);

  function applyOverlayPreferences(map: MapLibre.Map) {
    const prefs = overlayPreferencesRef.current;
    const mode = basemapModeRef.current;
    const vectorTilesActive = Boolean(map.getSource(PARCEL_TILE_SOURCE_ID));
    for (const id of [
      PARCEL_TILE_LINE_LAYER_ID, PARCEL_TILE_FILL_LAYER_ID, PARCEL_TILE_CASING_LAYER_ID,
      // The hover outline also draws from the tile source, so it must hide with the rest or tiles keep loading.
      PARCEL_TILE_HOVER_LAYER_ID, OFFLINE_PARCEL_HOVER_LAYER_ID,
      PARCEL_GEOJSON_LINE_LAYER_ID, PARCEL_GEOJSON_FILL_LAYER_ID,
      OFFLINE_PARCEL_LINE_LAYER_ID, OFFLINE_PARCEL_FILL_LAYER_ID
    ]) {
      if (!map.getLayer(id)) continue;
      const isGeoJsonFallback = id === PARCEL_GEOJSON_LINE_LAYER_ID || id === PARCEL_GEOJSON_FILL_LAYER_ID;
      // The dark casing only helps over imagery. Invisible paint still requests tiles, so hide layers entirely.
      const needed = id === PARCEL_TILE_CASING_LAYER_ID ? mode === "satellite" : true;
      map.setLayoutProperty(
        id,
        "visibility",
        prefs.boundaries && needed && !(isGeoJsonFallback && vectorTilesActive) ? "visible" : "none"
      );
    }
    paintParcelLayers(map, mode, prefs, getParcelLayerConfig().minZoom);
    for (const id of [SATELLITE_ROAD_LABEL_LAYER_ID, SATELLITE_PLACE_LABEL_LAYER_ID]) {
      if (map.getLayer(id))
        map.setLayoutProperty(
          id,
          "visibility",
          prefs.labels && satelliteLabelsReadyRef.current && basemapModeRef.current === "satellite" ? "visible" : "none"
        );
    }
  }

  useEffect(() => {
    const boundariesChanged = overlayPreferencesRef.current.boundaries !== boundaries;
    overlayPreferencesRef.current = { boundaries, labels, fillOpacity };
    if (mapRef.current) applyOverlayPreferences(mapRef.current);
    if (boundariesChanged) parcelRefreshRef.current?.();
  }, [boundaries, labels, fillOpacity]);

  function focusSearch() {
    const header = document.getElementById("header-search-input");
    if (header && header.offsetParent !== null) {
      header.focus();
      return;
    }
    setActivePanel("search");
    setTimeout(() => document.getElementById("parcel-search")?.focus(), 40);
  }

  function showSelectedParcel(nextParcel: ParcelFeature | null, focus = true) {
    setSelectedParcelState(nextParcel);
    if (nextParcel) setActivePanel("details");
    const map = mapRef.current;
    if (!map) return;
    setGeoJsonSourceData(
      map,
      "selected-parcel",
      nextParcel ? { type: "FeatureCollection", features: [nextParcel] } : EMPTY_FEATURE_COLLECTION
    );
    if (nextParcel && focus) focusMapOnSelectedParcel(map, nextParcel);
  }

  function clearSelection() {
    selectionRequestRef.current += 1;
    lookupAbortRef.current?.abort();
    showSelectedParcel(null);
    if (activePanelRef.current === "details") setActivePanel("map");
  }

  function selectParcelFeature(parcel: ParcelFeature) {
    selectionRequestRef.current += 1;
    lookupAbortRef.current?.abort();
    showSelectedParcel(parcel);
  }

  async function fetchParcel(query: string, signal: AbortSignal) {
    const response = await fetch(`/api/parcels/lookup?${query}`, { signal });
    const payload = (await response.json()) as { ok?: boolean; data?: ParcelFeature | null; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Unable to look up parcel");
    return payload.data ?? null;
  }

  /** Runs one lookup at a time; a newer selection cancels an older one. Returns null when superseded. */
  async function runSelection(lookup: (signal: AbortSignal) => Promise<ParcelFeature | null>) {
    const requestId = ++selectionRequestRef.current;
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    setError(null);
    try {
      const parcel = await lookup(controller.signal);
      return selectionRequestRef.current === requestId ? { parcel } : null;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      if (selectionRequestRef.current === requestId)
        setError(err instanceof Error ? err.message : "Unable to look up parcel");
      return null;
    }
  }

  async function selectParcelAtPoint(lng: number, lat: number) {
    const result = await runSelection((signal) => fetchParcel(`lng=${lng}&lat=${lat}`, signal));
    if (result?.parcel) showSelectedParcel(result.parcel);
    return result;
  }

  // IDs avoid picking an overlapping polygon from another source at the same point.
  async function selectParcelById(id: string, fallbackCenter?: [number, number]) {
    const offline = findCachedParcel(offlineFeatureCollectionRef.current, id);
    const cached = recentFeaturesRef.current.get(id) ?? (!navigator.onLine ? offline : null);
    if (cached) {
      selectParcelFeature(cached);
      return;
    }
    const result = await runSelection(async (signal) => {
      const parcel = await fetchParcel(`id=${encodeURIComponent(id)}`, signal);
      if (parcel || !fallbackCenter) return parcel;
      return fetchParcel(`lng=${fallbackCenter[0]}&lat=${fallbackCenter[1]}`, signal);
    });
    if (!result) return;
    if (result.parcel) showSelectedParcel(result.parcel);
    else setToast("That parcel isn't in the current parcel dataset.");
  }

  function toggleComparison(parcel: ParcelFeature) {
    if (compareParcels.some((p) => p.properties.id === parcel.properties.id)) {
      setCompareParcels((items) => items.filter((p) => p.properties.id !== parcel.properties.id));
      return;
    }
    if (compareParcels.length >= 3) {
      setToast("Your comparison has 3 parcels. Remove one to add another.");
      return;
    }
    setCompareParcels((items) => [...items, parcel]);
    setToast("Property added to Compare.");
  }

  function changeSearchQuery(query: string) {
    searchAbortRef.current?.abort();
    setSearchLoading(false);
    setSearchQuery(query);
    setSearchResults([]);
    setSearchError(null);
  }

  async function copyMapLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast(
        selectedParcelRef.current
          ? "Link copied with the selected parcel. Recipients need their own workspace access."
          : "Map link copied. Recipients need their own workspace access."
      );
    } catch {
      setToast("Copy unavailable. Copy the map URL from your address bar.");
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed. Please try again.");
      window.location.reload();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Unable to sign out.");
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setToast("Fullscreen is not available in this browser.");
    }
  }

  function centerOf(point: { coordinates: number[] } | null): [number, number] | undefined {
    return point ? [point.coordinates[0], point.coordinates[1]] : undefined;
  }

  function fitPinnedResults() {
    const map = mapRef.current;
    const points = pinnedResults.flatMap((result) => (result.center ? [result.center.coordinates] : []));
    if (!map || !points.length) return;
    if (points.length === 1) {
      map.flyTo({ center: [points[0][0], points[0][1]], zoom: Math.max(map.getZoom(), 16), duration: 800 });
      return;
    }
    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ],
      { padding: getSelectedParcelCameraPadding(map), maxZoom: 16, duration: 800 }
    );
  }

  function zoomToParcels() {
    mapRef.current?.easeTo({ zoom: getParcelLayerConfig().minZoom + 1, duration: 700 });
  }

  function locateParcel() {
    if (!("geolocation" in navigator)) {
      setToast("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        const { longitude: lng, latitude: lat, accuracy } = position.coords;
        userLocationMarkerRef.current?.remove();
        const dot = document.createElement("div");
        dot.className = "user-location-dot";
        userLocationMarkerRef.current = new maplibregl.Marker({ element: dot }).setLngLat([lng, lat]).addTo(map);
        const precision = `Located within about ${Math.round(accuracy).toLocaleString()} m.`;
        const caution =
          accuracy > 50
            ? " Accuracy is low, so this may be a neighboring parcel."
            : " Confirm the highlighted boundary — GPS and parcel lines are both approximate.";

        if (!navigator.onLine) {
          const offline = offlineFeatureCollectionRef.current?.features.find((feature) =>
            booleanPointInPolygon([lng, lat], feature)
          );
          if (offline) {
            selectParcelFeature(offline);
            setToast(`${precision} Showing the downloaded parcel at your location.${caution}`);
          } else {
            map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 900 });
            setToast(`${precision} You're offline and no downloaded area covers this spot.`);
          }
          return;
        }

        const result = await selectParcelAtPoint(lng, lat);
        if (!result) return;
        if (result.parcel) {
          setToast(`${precision}${caution}`);
        } else {
          map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 900 });
          setToast(`${precision} No parcel record was found at your location.`);
        }
      },
      (err) => {
        setLocating(false);
        setToast(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is off. Allow location access for this site in your browser settings."
            : "Couldn't get your location. Try again in a moment."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  function goToMarket(center: [number, number]) {
    mapRef.current?.flyTo({ center, zoom: 14, pitch: 0, bearing: 0, duration: 1100 });
  }

  function setSelectedParcelState(nextParcel: ParcelFeature | null) {
    selectedParcelRef.current = nextParcel;
    setSelectedParcel(nextParcel);
    syncParcelUrl(nextParcel?.properties.id ?? null);
    if (nextParcel) {
      recentFeaturesRef.current.set(nextParcel.properties.id, nextParcel);
      setRecentParcels((items) =>
        [nextParcel.properties, ...items.filter((p) => p.id !== nextParcel.properties.id)].slice(0, 8)
      );
    }
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
    setOfflineStatus(
      `${area.parcelCount.toLocaleString()} downloaded parcel${
        area.parcelCount === 1 ? "" : "s"
      } loaded from this browser.`
    );
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

    const bbox =
      source === "current-view"
        ? getBoundsBbox(map.getBounds())
        : getMeasurementDownloadBbox(measurementMode, measurementPoints);
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
      setOfflineStatus(
        `${parcelCount.toLocaleString()} parcel${
          parcelCount === 1 ? "" : "s"
        } saved to this browser for offline review.`
      );
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
    if (authLoading || !authData?.authenticated || activePanel !== "offline") return;
    const timeout = window.setTimeout(() => {
      void refreshOfflineAreas();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [authData?.authenticated, authLoading, activePanel]);

  useEffect(() => {
    basemapModeRef.current = basemapMode;
    const map = mapRef.current;
    if (!map?.getLayer(SATELLITE_LAYER_ID)) return;
    applyBasemapMode(map, basemapMode, streetLayerVisibilityRef.current);
    applyOverlayPreferences(map);
  }, [basemapMode]);

  useEffect(() => {
    activePanelRef.current = activePanel;
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = activePanel === "measure" ? "crosshair" : "";
    if (activePanel === "details" && selectedParcelRef.current)
      focusMapOnSelectedParcel(map, selectedParcelRef.current);
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
    let cancelled = false;
    void import("maplibre-gl").then(module => {
      if (cancelled) return;
      maplibregl = module.default;
      setMapLibraryReady(true);
    }).catch(() => {
      if (!cancelled) setError("Unable to load the map. Please reload and try again.");
    });
    return () => { cancelled = true; };
  }, [authData?.authenticated, authLoading]);

  useEffect(() => {
    if (authLoading || !authData?.authenticated || !mapLibraryReady) return;
    if (!mapContainerRef.current || mapRef.current) return;

    const config = getMapConfig();
    configureMapPerformance();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: config.style,
      center: config.center,
      zoom: config.zoom,
      hash: "map",
      refreshExpiredTiles: false,
      maxTileCacheZoomLevels: MAP_TILE_CACHE_ZOOM_LEVELS,
      attributionControl: {
        compact: currentLayoutMode() === "sheet"
      }
    });

    // Zoom/compass live in our own control column so every control shares one look and layout.
    // "Locate" in that column also selects the parcel under the device, so the built-in geolocate control is omitted.
    const navigation = new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true });
    const navigationHost = navHostRef.current;
    if (navigationHost) navigationHost.appendChild(navigation.onAdd(map));
    else map.addControl(navigation, "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "imperial" }), "bottom-left");
    // On touch screens the compass only appears once the map is rotated or tilted.
    const syncCompass = () => {
      navigationHost?.classList.toggle("is-rotated", Math.abs(map.getBearing()) > 0.5 || map.getPitch() > 0.5);
    };
    map.on("rotate", syncCompass);
    map.on("pitch", syncCompass);
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);
    mapRef.current = map;
    const parcelLayerConfig = {
      ...getParcelLayerConfig(),
      vectorTilesEnabled: getParcelLayerConfig().vectorTilesEnabled && authData.vectorTilesAvailable !== false
    };

    function clearParcels() {
      setGeoJsonSourceData(map, "parcels", EMPTY_FEATURE_COLLECTION);
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

      if (zoom < minZoom || !overlayPreferencesRef.current.boundaries) {
        parcelAbortRef.current?.abort();
        setLoading(false);
        clearParcels();
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
        if (controller.signal.aborted) return;
        const shouldShowGeoJsonParcels = overlayPreferencesRef.current.boundaries &&
          (!parcelLayerConfig.vectorTilesEnabled || Boolean(payload.demo));
        setParcelGeoJsonLayerVisibility(shouldShowGeoJsonParcels);
        setGeoJsonSourceData(mapRef.current, "parcels", shouldShowGeoJsonParcels ? data : EMPTY_FEATURE_COLLECTION);
        if (payload.tooMany && payload.message) setToast(payload.message);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load visible parcels");
      } finally {
        if (parcelAbortRef.current === controller) {
          setLoading(false);
        }
      }
    }

    function cancelQueuedVisibleParcelLoad() {
      if (parcelDebounceRef.current) clearTimeout(parcelDebounceRef.current);
      parcelDebounceRef.current = null;
    }

    function queueVisibleParcelLoad(delay = 220) {
      cancelQueuedVisibleParcelLoad();
      if (!overlayPreferencesRef.current.boundaries) {
        parcelAbortRef.current?.abort();
        setLoading(false);
        return;
      }
      if (parcelLayerConfig.vectorTilesEnabled) {
        if (!map.getSource(PARCEL_TILE_SOURCE_ID)) return;
        const showParcels = map.getZoom() >= parcelLayerConfig.minZoom;
        setLoading(showParcels && !map.isSourceLoaded(PARCEL_TILE_SOURCE_ID));
        return;
      }
      parcelDebounceRef.current = setTimeout(() => {
        parcelDebounceRef.current = null;

        // Parcel requests must not wait for unrelated public basemap tiles.
        void loadVisibleParcels();
      }, delay);
    }
    parcelRefreshRef.current = queueVisibleParcelLoad;

    // Hover feedback: outline the parcel under the pointer and label it near the cursor.
    let hoveredParcelId: string | null = null;
    let hoverFrame = 0;
    function setHoveredParcel(id: string | null) {
      if (id === hoveredParcelId) return;
      hoveredParcelId = id;
      const filter: MapLibre.FilterSpecification = id ? ["==", ["get", "id"], id] : HOVER_FILTER_NONE;
      for (const layerId of [PARCEL_TILE_HOVER_LAYER_ID, PARCEL_GEOJSON_HOVER_LAYER_ID, OFFLINE_PARCEL_HOVER_LAYER_ID])
        if (map.getLayer(layerId)) map.setFilter(layerId, filter);
    }
    function clearHover() {
      cancelAnimationFrame(hoverFrame);
      setHoveredParcel(null);
      if (hoverTipRef.current) hoverTipRef.current.hidden = true;
      if (activePanelRef.current !== "measure") map.getCanvas().style.cursor = "";
    }
    function isVisibleLayer(layerId: string) {
      return Boolean(map.getLayer(layerId)) && map.getLayoutProperty(layerId, "visibility") !== "none";
    }
    function hoverAt(point: MapLibre.Point) {
      if (activePanelRef.current === "measure") {
        clearHover();
        return;
      }
      const layers = [
        SAVED_PARCEL_LAYER_ID,
        OFFLINE_PARCEL_FILL_LAYER_ID,
        PARCEL_TILE_FILL_LAYER_ID,
        PARCEL_GEOJSON_FILL_LAYER_ID
      ].filter(isVisibleLayer);
      const feature = layers.length ? map.queryRenderedFeatures(point, { layers })[0] : undefined;
      const props = feature?.properties ?? {};
      if (!feature || typeof props.id !== "string") {
        clearHover();
        return;
      }
      setHoveredParcel(props.id);
      map.getCanvas().style.cursor = "pointer";
      const tip = hoverTipRef.current;
      if (!tip) return;
      const label =
        feature.layer.id === SAVED_PARCEL_LAYER_ID
          ? `Saved · ${props.title}`
          : formatAddress(props.site_address ?? props.siteAddress) ||
            props.parcel_id ||
            props.parcelId ||
            props.apn ||
            "Parcel";
      tip.textContent = props.id === selectedParcelRef.current?.properties.id ? `${label} (selected)` : label;
      tip.hidden = false;
      tip.style.transform = `translate(${Math.round(point.x + 14)}px, ${Math.round(point.y + 16)}px)`;
    }
    map.on("mousemove", (event) => {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => hoverAt(event.point));
    });
    map.on("mouseout", clearHover);
    map.on("movestart", () => {
      if (hoverTipRef.current) hoverTipRef.current.hidden = true;
    });

    // `load` waits for visible raster tiles. Install independent sources as soon
    // as the style exists so a slow topo provider cannot block satellite/parcels.
    map.once("style.load", () => {
      streetLayerVisibilityRef.current = captureStreetBasemapLayerVisibility(map);

      map.addSource(SATELLITE_SOURCE_ID, {
        type: "raster",
        tiles: [config.satelliteTileUrl],
        tileSize: 256,
        maxzoom: config.satelliteMaxZoom,
        attribution: config.satelliteAttribution
      });

      const satelliteLayer: MapLibre.RasterLayerSpecification = {
        id: SATELLITE_LAYER_ID,
        type: "raster",
        source: SATELLITE_SOURCE_ID,
        layout: {
          visibility: basemapModeRef.current === "satellite" ? "visible" : "none"
        },
        paint: {
          "raster-opacity": 1
        }
      };

      // Keep base imagery beneath optional detail tiles while they load.
      map.addLayer(satelliteLayer);

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
            "raster-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              detailMinZoom,
              0,
              detailMinZoom + SATELLITE_DETAIL_FADE_ZOOM_DELTA,
              1
            ],
            "raster-resampling": "linear"
          }
        });
      }

      if (config.satelliteRoadLabelTileUrl) {
        map.addSource(SATELLITE_ROAD_LABEL_SOURCE_ID, {
          type: "raster",
          tiles: [config.satelliteRoadLabelTileUrl],
          tileSize: 256,
          maxzoom: config.satelliteLabelMaxZoom,
          attribution: config.satelliteLabelAttribution
        });

        map.addLayer({
          id: SATELLITE_ROAD_LABEL_LAYER_ID,
          type: "raster",
          source: SATELLITE_ROAD_LABEL_SOURCE_ID,
          layout: {
            visibility: basemapModeRef.current === "satellite" ? "visible" : "none"
          },
          paint: {
            "raster-fade-duration": 0,
            "raster-opacity": 1
          }
        });
      }

      if (config.satellitePlaceLabelTileUrl) {
        map.addSource(SATELLITE_PLACE_LABEL_SOURCE_ID, {
          type: "raster",
          tiles: [config.satellitePlaceLabelTileUrl],
          tileSize: 256,
          maxzoom: config.satelliteLabelMaxZoom,
          attribution: config.satelliteLabelAttribution
        });

        map.addLayer({
          id: SATELLITE_PLACE_LABEL_LAYER_ID,
          type: "raster",
          source: SATELLITE_PLACE_LABEL_SOURCE_ID,
          layout: {
            visibility: basemapModeRef.current === "satellite" ? "visible" : "none"
          },
          paint: {
            "raster-fade-duration": 0,
            "raster-opacity": 1
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
          tiles: [
            `${window.location.origin}/api/parcels/tiles/{z}/{x}/{y}?v=${process.env.NEXT_PUBLIC_PARCEL_DATASET_VERSION}&schema=${PARCEL_TILE_SCHEMA}`
          ],
          minzoom: parcelLayerConfig.minZoom,
          maxzoom: 18
        });

        // Paint values here are placeholders; paintParcelLayers sets the real ones for the active basemap.
        map.addLayer({
          id: PARCEL_TILE_FILL_LAYER_ID,
          type: "fill",
          source: PARCEL_TILE_SOURCE_ID,
          "source-layer": PARCEL_TILE_SOURCE_LAYER,
          minzoom: parcelLayerConfig.minZoom,
          paint: { "fill-color": MAP_THEME.streets.fill, "fill-opacity": 0 }
        });

        map.addLayer({
          id: PARCEL_TILE_CASING_LAYER_ID,
          type: "line",
          source: PARCEL_TILE_SOURCE_ID,
          "source-layer": PARCEL_TILE_SOURCE_LAYER,
          minzoom: parcelLayerConfig.minZoom,
          layout: { visibility: "none", "line-join": "round" },
          paint: { "line-color": MAP_THEME.satellite.casing, "line-opacity": 0, "line-width": 2 }
        });

        map.addLayer({
          id: PARCEL_TILE_LINE_LAYER_ID,
          type: "line",
          source: PARCEL_TILE_SOURCE_ID,
          "source-layer": PARCEL_TILE_SOURCE_LAYER,
          minzoom: parcelLayerConfig.minZoom,
          layout: { "line-join": "round" },
          paint: { "line-color": MAP_THEME.streets.line, "line-opacity": 0.6, "line-width": 1 }
        });

        map.addLayer({
          id: PARCEL_TILE_HOVER_LAYER_ID,
          type: "line",
          source: PARCEL_TILE_SOURCE_ID,
          "source-layer": PARCEL_TILE_SOURCE_LAYER,
          minzoom: parcelLayerConfig.minZoom,
          filter: HOVER_FILTER_NONE,
          layout: { "line-join": "round" },
          paint: { "line-color": MAP_THEME.streets.hover, "line-width": 2.4 }
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
          "fill-color": MAP_THEME.streets.fill,
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
          "line-color": MAP_THEME.streets.line,
          "line-opacity": 0.75,
          "line-width": 1
        }
      });

      map.addLayer({
        id: PARCEL_GEOJSON_HOVER_LAYER_ID,
        type: "line",
        source: "parcels",
        filter: HOVER_FILTER_NONE,
        paint: { "line-color": MAP_THEME.streets.hover, "line-width": 2.4 }
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
          "fill-color": MAP_THEME.offline.fill,
          "fill-opacity": 0.14
        }
      });

      map.addLayer({
        id: OFFLINE_PARCEL_LINE_LAYER_ID,
        type: "line",
        source: OFFLINE_PARCEL_SOURCE_ID,
        paint: {
          "line-color": MAP_THEME.offline.line,
          "line-opacity": 0.9,
          "line-width": 1.4
        }
      });

      map.addLayer({
        id: OFFLINE_PARCEL_HOVER_LAYER_ID,
        type: "line",
        source: OFFLINE_PARCEL_SOURCE_ID,
        filter: HOVER_FILTER_NONE,
        paint: { "line-color": MAP_THEME.offline.line, "line-width": 2.4 }
      });

      map.addLayer({
        id: "selected-parcel-fill",
        type: "fill",
        source: "selected-parcel",
        paint: {
          "fill-color": MAP_THEME.streets.selectedFill,
          "fill-opacity": 0.22
        }
      });

      // A halo under the selection line keeps it distinct from neighboring outlines on any basemap.
      map.addLayer({
        id: SELECTED_PARCEL_CASING_LAYER_ID,
        type: "line",
        source: "selected-parcel",
        layout: { "line-join": "round" },
        paint: {
          "line-color": MAP_THEME.streets.casing,
          "line-opacity": 0.95,
          "line-width": 6.5
        }
      });

      map.addLayer({
        id: SELECTED_PARCEL_LINE_LAYER_ID,
        type: "line",
        source: "selected-parcel",
        layout: { "line-join": "round" },
        paint: {
          "line-color": MAP_THEME.streets.selected,
          "line-width": 3
        }
      });

      // Saved parcels stay visible at every zoom so the pipeline reads at county scale.
      map.addSource(SAVED_PARCEL_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: SAVED_PARCEL_LAYER_ID,
        type: "circle",
        source: SAVED_PARCEL_SOURCE_ID,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 7, 18, 9],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5
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
          "fill-color": MAP_THEME.measure.fill,
          "fill-opacity": 0.22
        }
      });

      map.addLayer({
        id: MEASUREMENT_LINE_LAYER_ID,
        type: "line",
        source: MEASUREMENT_SOURCE_ID,
        filter: ["!=", ["geometry-type"], "Point"],
        paint: {
          "line-color": MAP_THEME.measure.line,
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
          "circle-stroke-color": MAP_THEME.measure.line,
          "circle-stroke-width": 3
        }
      });

      applyBasemapMode(map, basemapModeRef.current, streetLayerVisibilityRef.current);
      applyOverlayPreferences(map);
      queueVisibleParcelLoad(0);
      setBelowParcelZoom(map.getZoom() < parcelLayerConfig.minZoom);
      setMapReady(true);
    });

    map.on("sourcedata", event => {
      if (event.sourceId === PARCEL_TILE_SOURCE_ID && event.isSourceLoaded) setLoading(false);
      if (
        event.sourceId === SATELLITE_SOURCE_ID && event.tile &&
        event.isSourceLoaded && !satelliteLabelsReadyRef.current
      ) {
        satelliteLabelsReadyRef.current = true;
        applyOverlayPreferences(map);
      }
    });
    map.on("sourcedataloading", event => {
      if (event.sourceId === PARCEL_TILE_SOURCE_ID && overlayPreferencesRef.current.boundaries) setLoading(true);
    });
    map.on("error", event => {
      if ("sourceId" in event && event.sourceId === PARCEL_TILE_SOURCE_ID) {
        setLoading(false);
        setError("Unable to load parcel boundaries. Check your connection or sign in again.");
      }
    });

    map.on("moveend", () => {
      const center = map.getCenter();
      setCoordinate(
        `${Math.abs(center.lat).toFixed(5)}° ${center.lat >= 0 ? "N" : "S"} · ${Math.abs(center.lng).toFixed(5)}° ${
          center.lng >= 0 ? "E" : "W"
        } · z${map.getZoom().toFixed(1)}`
      );
      setBelowParcelZoom(map.getZoom() < parcelLayerConfig.minZoom);
      queueVisibleParcelLoad();
    });

    map.on("click", async (event) => {
      if (activePanelRef.current === "measure") {
        addMeasurementPoint(event.lngLat.lng, event.lngLat.lat);
        return;
      }

      const selectedId = selectedParcelRef.current?.properties.id;
      if (isVisibleLayer(SAVED_PARCEL_LAYER_ID)) {
        const savedId = map.queryRenderedFeatures(event.point, { layers: [SAVED_PARCEL_LAYER_ID] })[0]?.properties?.id;
        if (typeof savedId === "string") {
          if (savedId === selectedId) setActivePanel("details");
          else void selectParcelById(savedId);
          return;
        }
      }

      if (map.getZoom() < parcelLayerConfig.minZoom) {
        setToast("Zoom in until parcel outlines are visible before selecting a parcel.");
        return;
      }

      const clickedParcel = getSelectableParcelAtPoint(map, event.point);
      if (!clickedParcel.hasFeature) {
        if (selectedId) clearSelection();
        return;
      }

      // Clicking the selected parcel brings its details back instead of unselecting it.
      if (clickedParcel.parcelId && clickedParcel.parcelId === selectedId) {
        setActivePanel("details");
        return;
      }

      if (clickedParcel.source === "offline") {
        const cachedParcel = findCachedParcel(offlineFeatureCollectionRef.current, clickedParcel.parcelId);
        if (cachedParcel) {
          selectParcelFeature(cachedParcel);
          setToast("Selected parcel from a downloaded browser area.");
          return;
        }
      }

      const result = await selectParcelAtPoint(event.lngLat.lng, event.lngLat.lat);
      if (result && !result.parcel) setToast("No parcel record was found at that spot.");
    });

    return () => {
      parcelAbortRef.current?.abort();
      cancelQueuedVisibleParcelLoad();
      resizeObserver.disconnect();
      searchAbortRef.current?.abort();
      lookupAbortRef.current?.abort();
      cancelAnimationFrame(hoverFrame);
      userLocationMarkerRef.current?.remove();
      if (navigationHost) navigation.onRemove();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
      parcelRefreshRef.current = null;
      satelliteLabelsReadyRef.current = false;
      streetLayerVisibilityRef.current = {};
    };
    // The map is created once; its handlers call selection helpers that only use refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authData?.authenticated, authData?.vectorTilesAvailable, authLoading, mapLibraryReady]);

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
      const params = new URLSearchParams({ q: query, limit: "50" });
      const response = await fetch(`/api/parcels/search?${params.toString()}`, { signal: controller.signal });
      const payload = (await response.json()) as SearchPayload;

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Parcel search failed");
      }

      if (controller.signal.aborted) return;
      setSearchResults(payload.data);
      if (payload.data.length === 0) setSearchError("No parcel matches found.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSearchError(err instanceof Error ? err.message : "Parcel search failed");
    } finally {
      if (searchAbortRef.current === controller) setSearchLoading(false);
    }
  }

  function selectSearchResult(result: ParcelSearchResult) {
    void selectParcelById(result.id, centerOf(result.center));
  }

  // Numbered pins for the results listed in Explore, shown while that panel is open.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || activePanel !== "search") return;
    const markers = pinnedResults.flatMap((result, index) => {
      if (!result.center) return [];
      const element = document.createElement("button");
      element.type = "button";
      element.className = "result-pin";
      element.textContent = String(index + 1);
      element.title = parcelTitle(result);
      element.setAttribute("aria-label", `Result ${index + 1}: ${parcelTitle(result)}`);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        selectSearchResult(result);
      });
      return [new maplibregl.Marker({ element }).setLngLat(centerOf(result.center)!)];
    });
    // Add in reverse so lower numbers draw on top where pins overlap.
    for (const marker of [...markers].reverse()) marker.addTo(map);
    return () => {
      for (const marker of markers) marker.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection helpers only use refs and setters
  }, [mapReady, pinnedResults, activePanel]);

  // A shared link (?parcel=<id>) opens with that parcel selected.
  const initialParcelHandledRef = useRef(false);
  useEffect(() => {
    if (!mapReady || initialParcelHandledRef.current) return;
    initialParcelHandledRef.current = true;
    const parcelId = new URL(window.location.href).searchParams.get("parcel");
    if (parcelId) void selectParcelById(parcelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when the map is ready
  }, [mapReady]);

  if (authLoading) {
    return (
      <AuthShell bare>
        <section className="auth-status" role="status" aria-live="polite">
          <BrandMark size={44} />
          <span className="spinner" aria-hidden="true" />
          <div>
            <h1>Checking access…</h1>
            <p>Loading your private parcel workspace.</p>
          </div>
        </section>
      </AuthShell>
    );
  }

  if (authError && !authData) {
    return (
      <AuthShell bare>
        <section className="auth-card">
          <h1>Unable to check access</h1>
          <p>{authError}</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      </AuthShell>
    );
  }

  if (authData?.authEnabled && !authData.authenticated) {
    const canCreateAccount = Boolean(authData.accountCreationEnabled);
    const signupDisabled = !signupEmail.trim() || signupPassword.length < 8 || signupPassword !== signupPasswordConfirm;

    return (
      <AuthShell>
        <section className="auth-card">
          <span className="brand">
            <BrandMark />
            <span className="brand-name">Parcel</span>
          </span>
          {authMode === "sign-in" ? (
            <>
              <h1>Private parcel workspace</h1>
              <p>Sign in to explore Upper Peninsula parcel records and your saved projects.</p>
              <form className="form-stack" onSubmit={login}>
                <label>
                  Email or username
                  <input
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
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
                {authError ? (
                  <p role="alert" className="message error">
                    {authError}
                  </p>
                ) : null}
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
              <h1>Create an account</h1>
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
                    autoCapitalize="none"
                    inputMode="email"
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
                  <small className="field-hint">At least 8 characters.</small>
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
                {authError ? (
                  <p role="alert" className="message error">
                    {authError}
                  </p>
                ) : null}
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
          <p className="auth-note">
            Parcel boundaries and property data are approximate and are not a legal survey, title opinion, or zoning
            determination.
          </p>
        </section>
      </AuthShell>
    );
  }

  return (
    <div
      className={`map-layout ${activePanel === "map" ? "panel-collapsed" : "panel-open"}`}
      data-layout={layoutMode}
    >
      <main className="map-wrap" aria-label="Parcel map">
        <div ref={mapContainerRef} className="map-canvas" />
        <div ref={hoverTipRef} className="map-hover-tip" hidden aria-hidden="true" />
        {belowParcelZoom && boundaries && activePanel !== "measure" && !(activePanel === "search" && pinnedResults.length) ? (
          <button type="button" className="zoom-hint" onClick={zoomToParcels}>
            <Icon name="zoomIn" size={18} />
            Zoom in to see parcel boundaries
          </button>
        ) : null}
      </main>
      <WorkspaceChrome
        panel={activePanel}
        onPanel={setActivePanel}
        basemap={basemapMode}
        onBasemap={setBasemapMode}
        boundaries={boundaries}
        onBoundaries={setBoundaries}
        labels={labels}
        onLabels={setLabels}
        opacity={fillOpacity}
        onOpacity={setFillOpacity}
        savedLayer={savedLayer}
        onSavedLayer={setSavedLayer}
        savedCount={new Set(savedProjects.projects.flatMap((project) => project.savedParcels.map((s) => s.parcel.id))).size}
        openPopover={openPopover}
        onPopoverChange={setOpenPopover}
        searchQuery={searchQuery}
        onSearchQueryChange={changeSearchQuery}
        onSearchSubmit={() => void runSearch()}
        searchResults={searchResults}
        searchLoading={searchLoading}
        searchError={searchError}
        onSearchResultSelect={selectSearchResult}
        onSearchSeeAll={() => setActivePanel("search")}
        onLocate={locateParcel}
        locating={locating}
        compareCount={compareParcels.length}
        online={online}
        onHome={() => goToMarket(getMapConfig().center)}
        onShare={copyMapLink}
        onFullscreen={toggleFullscreen}
        onSignOut={authData?.authEnabled ? signOut : undefined}
        userName={authData?.user?.displayName || "Realtor"}
        coordinate={coordinate}
        error={error}
        loading={loading}
        toast={toast}
        onNavHost={setNavHost}
      />
      <ParcelDetails
        activePanel={activePanel}
        onActivePanelChange={setActivePanel}
        parcel={selectedParcel}
        saved={savedProjects}
        recentParcels={recentParcels}
        compareParcels={compareParcels}
        onRecentSelect={(parcel) => void selectParcelById(parcel.id)}
        onRecentClear={() => {
          recentFeaturesRef.current.clear();
          setRecentParcels([]);
        }}
        onCompareSelect={selectParcelFeature}
        onCompareToggle={toggleComparison}
        onCompareRemove={(id) => setCompareParcels((items) => items.filter((p) => p.properties.id !== id))}
        onMarketSelect={goToMarket}
        onFocusParcel={() => {
          if (selectedParcel && mapRef.current) focusMapOnSelectedParcel(mapRef.current, selectedParcel);
        }}
        searchQuery={searchQuery}
        onSearchQueryChange={changeSearchQuery}
        onSearchSubmit={runSearch}
        searchResults={searchResults}
        searchLoading={searchLoading}
        searchError={searchError}
        onSearchResultClick={selectSearchResult}
        onVisibleResultsChange={setPinnedResults}
        onFitResults={fitPinnedResults}
        onSavedParcelClick={(savedParcel) => void selectParcelById(savedParcel.parcel.id, centerOf(savedParcel.center))}
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
