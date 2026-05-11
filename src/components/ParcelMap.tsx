"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import maplibregl from "maplibre-gl";
import { area as turfArea, length as turfLength, lineString as turfLineString, polygon as turfPolygon } from "@turf/turf";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
import Disclaimer from "@/components/Disclaimer";
import ParcelDetails from "@/components/ParcelDetails";
import type { AppPanel, MeasurementMode, MeasurementPoint, MeasurementSummary } from "@/types/measurement";
import type { ParcelFeature, ParcelProperties, ParcelSearchResult } from "@/types/parcel";

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
const PARCEL_TILE_LINE_LAYER_ID = "parcel-tile-line";
const PARCEL_GEOJSON_LINE_LAYER_ID = "parcel-line";
const SELECTED_PARCEL_LINE_LAYER_ID = "selected-parcel-line";
const MEASUREMENT_SOURCE_ID = "measurements";
const MEASUREMENT_FILL_LAYER_ID = "measurement-fill";
const MEASUREMENT_LINE_LAYER_ID = "measurement-line";
const MEASUREMENT_POINT_LAYER_ID = "measurement-points";
const STREET_PARCEL_LINE_COLOR = "#1d4ed8";
const SATELLITE_PARCEL_LINE_COLOR = "#ff7a00";
const STREET_SELECTED_PARCEL_LINE_COLOR = "#ea580c";
const SATELLITE_SELECTED_PARCEL_LINE_COLOR = "#ff9f1c";

type MeasurementFeatureProperties = {
  kind: "line" | "shape" | "point";
  label?: string;
};

type BasemapMode = "streets" | "satellite";
type NumberInterpolateExpression = ["interpolate", ["linear"], ["zoom"], number, number, number, number];

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

function getMapConfig() {
  const centerRaw = process.env.NEXT_PUBLIC_DEFAULT_CENTER ?? "-88.5690,47.1211";
  const [lngRaw, latRaw] = centerRaw.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);

  return {
    styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty",
    satelliteTileUrl:
      process.env.NEXT_PUBLIC_SATELLITE_TILE_URL ??
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    satelliteAttribution:
      process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION ?? "USDA, USGS The National Map: Orthoimagery",
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

function setMeasurementSourceData(
  map: maplibregl.Map,
  data: FeatureCollection<Geometry, MeasurementFeatureProperties>
) {
  const source = map.getSource(MEASUREMENT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(data);
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
    basemapModeRef.current = basemapMode;
    const map = mapRef.current;
    if (!map?.getLayer(SATELLITE_LAYER_ID)) return;

    map.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", basemapMode === "satellite" ? "visible" : "none");
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
      style: config.styleUrl,
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
      for (const layerId of ["parcel-fill", "parcel-line"]) {
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
      setSelectedParcel(nextParcel);
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
    }

    async function selectParcelAt(lng: number, lat: number) {
      setError(null);
      try {
        const response = await fetch(`/api/parcels/lookup?lng=${lng}&lat=${lat}`);
        const payload = (await response.json()) as { ok?: boolean; data?: ParcelFeature | null; error?: string };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Unable to look up parcel");
        }

        setSelectedParcelFeature(payload.data ?? null);
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
          id: "parcel-tile-fill",
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
        id: "parcel-fill",
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

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    setAuthData((current) =>
      current
        ? {
            ...current,
            authenticated: false,
            user: null
          }
        : current
    );
    setSelectedParcel(null);
    setSearchResults([]);
    setActivePanel("map");
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

    if (map) {
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 17),
        duration: 700,
        essential: true
      });
    }

    try {
      const response = await fetch(`/api/parcels/lookup?lng=${lng}&lat=${lat}`);
      const payload = (await response.json()) as { ok?: boolean; data?: ParcelFeature | null; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Unable to load selected parcel");

      const nextParcel = payload.data ?? null;
      setSelectedParcel(nextParcel);
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
        <div className="map-status">
          <strong>{activePanel === "measure" ? "Measurement mode" : loading ? "Loading parcels…" : "Parcel layer"}</strong>
          <p>{activePanel === "measure" ? getMeasurementSummary(measurementMode, measurementPoints).hint : statusMessage}</p>
          {authData?.authEnabled && authData.authenticated ? (
            <div className="session-row">
              <span>{authData.user?.displayName ?? authData.user?.id ?? "Signed in"}</span>
              <button className="text-button" type="button" onClick={logout}>
                Sign out
              </button>
            </div>
          ) : null}
          <div className="map-basemap-toggle" role="group" aria-label="Base map">
            <button
              className={basemapMode === "streets" ? "active" : ""}
              type="button"
              aria-pressed={basemapMode === "streets"}
              onClick={() => setBasemapMode("streets")}
            >
              Map
            </button>
            <button
              className={basemapMode === "satellite" ? "active" : ""}
              type="button"
              aria-pressed={basemapMode === "satellite"}
              onClick={() => setBasemapMode("satellite")}
            >
              Satellite
            </button>
          </div>
        </div>
        <div ref={mapContainerRef} className="map-canvas" />
        <Disclaimer />
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
      />
    </div>
  );
}
