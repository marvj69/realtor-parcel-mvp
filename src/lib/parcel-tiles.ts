import { getNumberEnv } from "@/lib/env";

export const PARCEL_TILE_LAYER = "parcels";
export const PARCEL_TILE_EXTENT = 4096;
export const PARCEL_TILE_BUFFER = 64;
export const MAX_TILE_ZOOM = 22;

export type TileParams = {
  z: number;
  x: number;
  y: number;
};

export type TilePolicy = {
  minZoom: number;
  shouldServe: boolean;
  extent: number;
  buffer: number;
  simplifyMeters: number;
};

export function parseTileParams(raw: { z?: string; x?: string; y?: string }) {
  const z = Number(raw.z);
  const x = Number(raw.x);
  const y = Number(raw.y);

  if (![z, x, y].every(Number.isInteger)) {
    return { ok: false as const, error: "Tile z/x/y must be integers." };
  }

  if (z < 0 || z > MAX_TILE_ZOOM) {
    return { ok: false as const, error: `Tile zoom must be between 0 and ${MAX_TILE_ZOOM}.` };
  }

  const maxIndex = 2 ** z;
  if (x < 0 || x >= maxIndex || y < 0 || y >= maxIndex) {
    return { ok: false as const, error: "Tile x/y are out of range for this zoom." };
  }

  return { ok: true as const, data: { z, x, y } satisfies TileParams };
}

export function getParcelTilePolicy(z: number): TilePolicy {
  const minZoom = getNumberEnv("PARCEL_TILE_MIN_ZOOM", getNumberEnv("NEXT_PUBLIC_PARCEL_MIN_ZOOM", 13));

  if (z < minZoom) {
    return {
      minZoom,
      shouldServe: false,
      extent: PARCEL_TILE_EXTENT,
      buffer: PARCEL_TILE_BUFFER,
      simplifyMeters: 0
    };
  }

  let simplifyMeters = 0;
  if (z < 14) simplifyMeters = 24;
  else if (z < 15) simplifyMeters = 12;
  else if (z < 17) simplifyMeters = 2;
  else if (z < 18) simplifyMeters = 0.5;

  return {
    minZoom,
    shouldServe: true,
    extent: PARCEL_TILE_EXTENT,
    buffer: PARCEL_TILE_BUFFER,
    simplifyMeters
  };
}
