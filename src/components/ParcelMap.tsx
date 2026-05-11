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

function getMapConfig() {
  const centerRaw = process.env.NEXT_PUBLIC_DEFAULT_CENTER ?? "-88.5690,47.1211";
  const [lngRaw, latRaw] = centerRaw.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);

  return {
    styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty",
    center: [Number.isFinite(lng) ? lng : -88.569, Number.isFinite(lat) ? lat : 47.1211] as [number, number],
    zoom: Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM ?? 13)
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
  error?: string;
};

type SearchPayload = {
  ok?: boolean;
  data?: ParcelSearchResult[];
  error?: string;
};

export default function ParcelMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const parcelAbortRef = useRef<AbortController | null>(null);
  const parcelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [totalInView, setTotalInView] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Zoom in to view parcels.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ParcelSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
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

    function clearParcels(message: string) {
      setGeoJsonSourceData(map, "parcels", EMPTY_FEATURE_COLLECTION);
      setVisibleCount(0);
      setTotalInView(0);
      setStatusMessage(message);
    }

    async function loadVisibleParcels() {
      if (!mapRef.current) return;
      const zoom = mapRef.current.getZoom();
      const minZoom = Number(process.env.NEXT_PUBLIC_PARCEL_MIN_ZOOM ?? 13);

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
        zoom: String(zoom)
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
        setGeoJsonSourceData(mapRef.current, "parcels", data);
        setVisibleCount(data.features.length);
        setTotalInView(payload.count ?? data.features.length);
        setStatusMessage(
          payload.message ??
            `${data.features.length.toLocaleString()} parcel outline${data.features.length === 1 ? "" : "s"} loaded.`
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
      map.addSource("parcels", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION
      });

      map.addSource("selected-parcel", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION
      });

      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "parcels",
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.08
        }
      });

      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "parcels",
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
  }, []);

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

  return (
    <div className="map-layout">
      <div className="map-wrap">
        <div className="map-status">
          <strong>{loading ? "Loading parcels…" : "Parcel layer"}</strong>
          <p>{statusMessage}</p>
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
      />
    </div>
  );
}
