import type { NextConfig } from "next";
import nextRuntimeFiles from "./config/next-runtime-files.json";
import parcelManifestData from "./data/static-parcels/manifest.json";
import type { DatasetManifest } from "./src/lib/static-parcel-format";

const parcelManifest = parcelManifestData as DatasetManifest;
const runtimeAssets = ["./data/static-parcels/manifest.json", ...parcelManifest.parts.map(part => `./data/static-parcels/${part}`)];
const searchAssets = ["./data/static-parcels/manifest.json", ...(parcelManifest.search?.parts ?? parcelManifest.parts).map(part => `./data/static-parcels/${part}`)];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PARCEL_DATASET_VERSION: parcelManifest.version
  },
  outputFileTracingExcludes: {
    "/*": ["./work/**/*", "./**/*.sqlite", "./data/parcel-archive/**/*", "./data/parcels/**/*", "./.env*", "./config/*.local.json"],
    "/api/parcels/search": parcelManifest.search ? runtimeAssets.slice(1) : [],
    "/api/parcels/bbox": parcelManifest.search ? searchAssets.slice(1) : [],
    "/api/parcels/lookup": parcelManifest.search ? searchAssets.slice(1) : [],
    "/api/parcels/tiles/**/*": parcelManifest.search ? searchAssets.slice(1) : [],
    "/api/saved-parcels": parcelManifest.search ? searchAssets.slice(1) : [],
    "/api/health": parcelManifest.search ? searchAssets.slice(1) : []
  },
  outputFileTracingIncludes: {
    "/*": nextRuntimeFiles.map(file => `./${file}`),
    "/api/parcels/bbox": runtimeAssets,
    "/api/parcels/lookup": runtimeAssets,
    "/api/parcels/tiles/**/*": runtimeAssets,
    "/api/parcels/search": searchAssets,
    "/api/saved-parcels": runtimeAssets,
    "/api/health": runtimeAssets
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
