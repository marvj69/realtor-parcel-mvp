import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/*": ["./work/**/*", "./**/*.sqlite", "./data/parcel-archive/**/*", "./data/parcels/**/*", "./.env*", "./config/*.local.json"]
  },
  outputFileTracingIncludes: {
    "/api/parcels/**/*": ["./data/static-parcels/**/*"],
    "/api/saved-parcels": ["./data/static-parcels/**/*"],
    "/api/health": ["./data/static-parcels/**/*"]
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
