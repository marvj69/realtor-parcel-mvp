import type { NextConfig } from "next";
import nextRuntimeFiles from "./config/next-runtime-files.json";
import parcelManifest from "./data/static-parcels/manifest.json";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PARCEL_DATASET_VERSION: parcelManifest.version
  },
  outputFileTracingExcludes: {
    "/*": ["./work/**/*", "./**/*.sqlite", "./data/parcel-archive/**/*", "./data/parcels/**/*", "./.env*", "./config/*.local.json"]
  },
  outputFileTracingIncludes: {
    "/*": nextRuntimeFiles.map(file => `./${file}`),
    "/api/parcels/**/*": ["./data/static-parcels/**/*"],
    "/api/saved-parcels": ["./data/static-parcels/**/*"],
    "/api/health": ["./data/static-parcels/**/*"]
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
