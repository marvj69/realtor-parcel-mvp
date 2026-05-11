import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getNumberEnv, hasDatabaseConfig } from "@/lib/env";
import { getDemoParcelCollection } from "@/lib/demo-parcels";
import { parcelRowsToFeatureCollection } from "@/lib/parcels";
import type { ParcelRow } from "@/types/parcel";

export const runtime = "nodejs";

const MIN_PARCEL_ZOOM = 13;

type BboxPolicy = {
  limit: number;
  tolerance: number;
  simplified: boolean;
};

type BboxParseResult =
  | { success: true; data: [number, number, number, number] }
  | { success: false; error: { issues: { message: string }[] } };

const bboxSchema = z
  .string()
  .transform((value) => value.split(",").map(Number))
  .refine((parts) => parts.length === 4 && parts.every(Number.isFinite), "bbox must be minLng,minLat,maxLng,maxLat")
  .refine(([minLng, minLat, maxLng, maxLat]) => minLng < maxLng && minLat < maxLat, "Invalid bbox extent")
  .refine(([minLng, minLat, maxLng, maxLat]) => {
    return minLng >= -180 && maxLng <= 180 && minLat >= -90 && maxLat <= 90;
  }, "bbox out of range");

const separatedBboxSchema = z.object({
  west: z.coerce.number().min(-180).max(180),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90)
}).refine(({ west, south, east, north }) => west < east && south < north, "Invalid bbox extent");

const zoomSchema = z.coerce.number().min(0).max(24).default(0);

function getBbox(url: URL): BboxParseResult {
  const bboxRaw = url.searchParams.get("bbox");
  if (bboxRaw) {
    const parsed = bboxSchema.safeParse(bboxRaw);
    if (!parsed.success) return parsed;
    const [west, south, east, north] = parsed.data;
    return { success: true, data: [west, south, east, north] };
  }

  const parsed = separatedBboxSchema.safeParse({
    west: url.searchParams.get("west"),
    south: url.searchParams.get("south"),
    east: url.searchParams.get("east"),
    north: url.searchParams.get("north")
  });

  if (!parsed.success) {
    return parsed;
  }

  const { west, south, east, north } = parsed.data;
  return { success: true, data: [west, south, east, north] };
}

function getPolicy(zoom: number): BboxPolicy {
  const envLimit = Math.min(getNumberEnv("PARCEL_BBOX_LIMIT", 1200), 2500);

  if (zoom < 15) {
    return { limit: Math.min(envLimit, 600), tolerance: 0.00008, simplified: true };
  }

  if (zoom < 17) {
    return { limit: Math.min(envLimit, 1200), tolerance: 0.000025, simplified: true };
  }

  return { limit: Math.min(envLimit, 2000), tolerance: 0.000005, simplified: true };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = getBbox(url);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid bbox" }, { status: 400 });
  }

  const zoomParsed = zoomSchema.safeParse(url.searchParams.get("zoom") ?? undefined);
  const zoom = zoomParsed.success ? zoomParsed.data : 0;
  const [minLng, minLat, maxLng, maxLat] = parsed.data;
  const policy = getPolicy(zoom);

  if (zoom < MIN_PARCEL_ZOOM) {
    return NextResponse.json({
      ok: true,
      data: { type: "FeatureCollection", features: [] },
      count: 0,
      limit: policy.limit,
      minZoom: MIN_PARCEL_ZOOM,
      zoom,
      shouldLoad: false,
      message: "Zoom in to view parcels."
    });
  }

  if (!hasDatabaseConfig()) {
    const data = getDemoParcelCollection([minLng, minLat, maxLng, maxLat], policy.limit);
    return NextResponse.json({
      ok: true,
      data,
      count: data.features.length,
      limit: policy.limit,
      minZoom: MIN_PARCEL_ZOOM,
      zoom,
      shouldLoad: true,
      demo: true
    });
  }

  try {
    const countRows = await query<{ count: string }>(
      `
      SELECT count(*)::text AS count
      FROM parcels p
      WHERE p.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      `,
      [minLng, minLat, maxLng, maxLat]
    );
    const count = Number(countRows[0]?.count ?? 0);

    if (count > policy.limit) {
      return NextResponse.json({
        ok: true,
        data: { type: "FeatureCollection", features: [] },
        count,
        limit: policy.limit,
        minZoom: MIN_PARCEL_ZOOM,
        zoom,
        shouldLoad: false,
        tooMany: true,
        message: `Too many parcels in view (${count.toLocaleString()}). Zoom in to view parcel boundaries.`
      });
    }

    const rows = await query<ParcelRow>(
      `
      SELECT
        p.id::text,
        p.source_key,
        p.source_feature_id,
        p.provider,
        p.source_county,
        p.state,
        s.source_url,
        s.source_updated_at::text AS source_updated_at,
        s.imported_at::text AS imported_at,
        p.parcel_id,
        p.apn,
        p.owner_name,
        p.site_address,
        p.mailing_address,
        p.acreage,
        p.assessed_value,
        p.land_use,
        ST_AsGeoJSON(
          CASE
            WHEN $6::numeric > 0 THEN ST_SimplifyPreserveTopology(p.geom, $6::numeric)
            ELSE p.geom
          END
        )::json AS geometry
      FROM parcels p
      LEFT JOIN parcel_sources s ON s.source_key = p.source_key
      WHERE p.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      ORDER BY p.source_key, p.source_feature_id
      LIMIT $5
      `,
      [minLng, minLat, maxLng, maxLat, policy.limit, policy.tolerance]
    );

    return NextResponse.json({
      ok: true,
      data: parcelRowsToFeatureCollection(rows),
      count,
      limit: policy.limit,
      minZoom: MIN_PARCEL_ZOOM,
      zoom,
      shouldLoad: true,
      simplified: policy.simplified
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Parcel bbox query failed" },
      { status: 500 }
    );
  }
}
