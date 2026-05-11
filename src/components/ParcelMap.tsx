"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import Disclaimer from "@/components/Disclaimer";
import ParcelDetails from "@/components/ParcelDetails";
import type { ParcelFeature, ParcelProperties, ParcelSearchResult } from "@/types/parcel";

const EMPTY_FEATURE_COLLECTION: FeatureCollection<Polygon | MultiPolygon, ParcelProperties> = {
  type: "FeatureCollection",
  features: []
};

const PARCEL_TILE_SOURCE_ID = "parcel-tiles";
const PARCEL_TILE_SOURCE_LAYER = "parcels";
const SATELLITE_SOURCE_ID = "usgs-satellite";
const SATELLITE_LAYER_ID = "usgs-satellite-layer";

type BasemapMode = "streets" | "satellite";

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
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("streets");
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
  }, [basemapMode]);

  useEffect(() => {
    if (authLoading || !authData?.authenticated) return;
    if (!mapContainerRef.current || mapRef.current) return;

    const config = getMapConfig();
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: config.styleUrl,
      center: config.center,
      zoom: config.zoom,
      attributionControl: { compact: false }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
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
          id: "parcel-tile-line",
          type: "line",
          source: PARCEL_TILE_SOURCE_ID,
          "source-layer": PARCEL_TILE_SOURCE_LAYER,
          minzoom: parcelLayerConfig.minZoom,
          paint: {
            "line-color": "#1d4ed8",
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              parcelLayerConfig.minZoom,
              0.45,
              16,
              0.8
            ],
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
        id: "parcel-line",
        type: "line",
        source: "parcels",
        layout: {
          visibility: parcelLayerConfig.vectorTilesEnabled ? "none" : "visible"
        },
        paint: {
          "line-color": "#1d4ed8",
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
        id: "selected-parcel-line",
        type: "line",
        source: "selected-parcel",
        paint: {
          "line-color": "#ea580c",
          "line-width": 3
        }
      });

      queueVisibleParcelLoad(0);
    });

    map.on("moveend", () => {
      queueVisibleParcelLoad();
    });

    map.on("click", async (event) => {
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
          <strong>{loading ? "Loading parcels…" : "Parcel layer"}</strong>
          <p>{statusMessage}</p>
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
      />
    </div>
  );
}
