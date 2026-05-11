import { NextResponse } from "next/server";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import { getParcelTilePolicy, PARCEL_TILE_LAYER, parseTileParams } from "@/lib/parcel-tiles";

export const runtime = "nodejs";

type TileRouteContext = {
  params: Promise<{ z: string; x: string; y: string }> | { z: string; x: string; y: string };
};

type TileRow = {
  mvt: Buffer | null;
  feature_count: string;
};

function tileHeaders(extra?: Record<string, string>) {
  return {
    "Content-Type": "application/vnd.mapbox-vector-tile",
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    ...extra
  };
}

function emptyTile(extra?: Record<string, string>) {
  return new Response(null, {
    status: 204,
    headers: tileHeaders(extra)
  });
}

function tileBody(tile: Buffer): ArrayBuffer {
  const copy = new Uint8Array(tile.byteLength);
  copy.set(tile);
  return copy.buffer;
}

async function getParcelTile(_request: Request, context: TileRouteContext) {
  const params = await Promise.resolve(context.params);
  const parsed = parseTileParams(params);

  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { z, x, y } = parsed.data;
  const policy = getParcelTilePolicy(z);

  if (!policy.shouldServe) {
    return emptyTile({
      "X-Parcel-Tile-Min-Zoom": String(policy.minZoom),
      "X-Parcel-Tile-Reason": "below-min-zoom"
    });
  }

  if (!hasDatabaseConfig()) {
    return emptyTile({
      "X-Parcel-Tile-Reason": "demo-mode-no-vector-tile"
    });
  }

  try {
    const rows = await query<TileRow>(
      `
      WITH bounds AS (
        SELECT
          ST_TileEnvelope($1::integer, $2::integer, $3::integer) AS geom_3857,
          ST_Transform(ST_TileEnvelope($1::integer, $2::integer, $3::integer), 4326) AS geom_4326
      ),
      mvt_rows AS (
        SELECT
          p.id::text AS id,
          p.source_key,
          p.source_feature_id,
          p.parcel_id,
          p.apn,
          ST_AsMVTGeom(
            CASE
              WHEN $6::double precision > 0
                THEN ST_SimplifyPreserveTopology(ST_Transform(p.geom, 3857), $6::double precision)
              ELSE ST_Transform(p.geom, 3857)
            END,
            b.geom_3857,
            $4::integer,
            $5::integer,
            true
          ) AS geom
        FROM parcels p
        JOIN bounds b
          ON p.geom && b.geom_4326
         AND ST_Intersects(p.geom, b.geom_4326)
      ),
      clipped_rows AS (
        SELECT *
        FROM mvt_rows
        WHERE geom IS NOT NULL
      )
      SELECT
        ST_AsMVT(clipped_rows.*, $7::text, $4::integer, 'geom') AS mvt,
        count(*)::text AS feature_count
      FROM clipped_rows
      `,
      [z, x, y, policy.extent, policy.buffer, policy.simplifyMeters, PARCEL_TILE_LAYER]
    );

    const tile = rows[0]?.mvt;
    if (!tile || tile.length === 0) {
      return emptyTile({
        "X-Parcel-Tile-Min-Zoom": String(policy.minZoom),
        "X-Parcel-Tile-Feature-Count": rows[0]?.feature_count ?? "0"
      });
    }

    return new Response(tileBody(tile), {
      headers: tileHeaders({
        "X-Parcel-Tile-Min-Zoom": String(policy.minZoom),
        "X-Parcel-Tile-Feature-Count": rows[0]?.feature_count ?? "0",
        "X-Parcel-Tile-Simplify-Meters": String(policy.simplifyMeters)
      })
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Parcel vector tile query failed" },
      { status: 500 }
    );
  }
}

export const GET = withApiGuard(getParcelTile, {
  route: "GET /api/parcels/tiles/:z/:x/:y",
  rateLimit: apiRateLimits.tiles
});
