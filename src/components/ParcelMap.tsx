"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import Disclaimer from "@/components/Disclaimer";
import ParcelDetails from "@/components/ParcelDetails";
import type { ParcelFeature, ParcelProperties } from "@/types/parcel";

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

export default function ParcelMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    async function loadVisibleParcels() {
      if (!mapRef.current) return;
      const zoom = mapRef.current.getZoom();
      const minZoom = Number(process.env.NEXT_PUBLIC_PARCEL_MIN_ZOOM ?? 13);

      if (zoom < minZoom) {
        setGeoJsonSourceData(mapRef.current, "parcels", EMPTY_FEATURE_COLLECTION);
        setVisibleCount(0);
        return;
      }

      const bounds = mapRef.current.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/parcels/bbox?bbox=${encodeURIComponent(bbox)}`);
        const payload = (await response.json()) as {
          ok?: boolean;
          data?: FeatureCollection<Polygon | MultiPolygon, ParcelProperties>;
          error?: string;
        };

        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? "Unable to load visible parcels");
        }

        setGeoJsonSourceData(mapRef.current, "parcels", payload.data);
        setVisibleCount(payload.data.features.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load visible parcels");
      } finally {
        setLoading(false);
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

      void loadVisibleParcels();
    });

    map.on("moveend", () => {
      void loadVisibleParcels();
    });

    map.on("click", async (event) => {
      setError(null);
      try {
        const lng = event.lngLat.lng;
        const lat = event.lngLat.lat;
        const response = await fetch(`/api/parcels/lookup?lng=${lng}&lat=${lat}`);
        const payload = (await response.json()) as { ok?: boolean; data?: ParcelFeature | null; error?: string };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Unable to look up parcel");
        }

        const nextParcel = payload.data ?? null;
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to look up parcel");
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="map-layout">
      <div className="map-wrap">
        <div className="map-status">
          <strong>Click a parcel to inspect it</strong>
          <p>Start with the seed data, then import real public county GIS parcels.</p>
        </div>
        <div ref={mapContainerRef} className="map-canvas" />
        <Disclaimer />
      </div>
      <ParcelDetails parcel={selectedParcel} visibleCount={visibleCount} loading={loading} error={error} />
    </div>
  );
}
