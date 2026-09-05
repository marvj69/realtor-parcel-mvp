import type { NextConfig } from "next";
import nextRuntimeFiles from "./config/next-runtime-files.json";

const nextConfig: NextConfig = {
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
