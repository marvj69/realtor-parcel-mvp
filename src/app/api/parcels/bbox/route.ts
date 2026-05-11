import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getNumberEnv, hasDatabaseConfig } from "@/lib/env";
import { getDemoParcelCollection } from "@/lib/demo-parcels";
import { parcelRowsToFeatureCollection } from "@/lib/parcels";
import type { ParcelRow } from "@/types/parcel";

export const runtime = "nodejs";

const bboxSchema = z
  .string()
  .transform((value) => value.split(",").map(Number))
  .refine((parts) => parts.length === 4 && parts.every(Number.isFinite), "bbox must be minLng,minLat,maxLng,maxLat")
  .refine(([minLng, minLat, maxLng, maxLat]) => minLng < maxLng && minLat < maxLat, "Invalid bbox extent")
  .refine(([minLng, minLat, maxLng, maxLat]) => {
    return minLng >= -180 && maxLng <= 180 && minLat >= -90 && maxLat <= 90;
  }, "bbox out of range");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bboxRaw = url.searchParams.get("bbox");

  if (!bboxRaw) {
    return NextResponse.json({ ok: false, error: "Missing bbox" }, { status: 400 });
  }

  const parsed = bboxSchema.safeParse(bboxRaw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid bbox" }, { status: 400 });
  }

  const [minLng, minLat, maxLng, maxLat] = parsed.data;
  const limit = Math.min(getNumberEnv("PARCEL_BBOX_LIMIT", 2000), 5000);

  if (!hasDatabaseConfig()) {
    return NextResponse.json({
      ok: true,
      data: getDemoParcelCollection([minLng, minLat, maxLng, maxLat], limit),
      limit,
      demo: true
    });
  }

  try {
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
        ST_AsGeoJSON(p.geom)::json AS geometry
      FROM parcels p
      LEFT JOIN parcel_sources s ON s.source_key = p.source_key
      WHERE p.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      ORDER BY p.source_key, p.source_feature_id
      LIMIT $5
      `,
      [minLng, minLat, maxLng, maxLat, limit]
    );

    return NextResponse.json({ ok: true, data: parcelRowsToFeatureCollection(rows), limit });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Parcel bbox query failed" },
      { status: 500 }
    );
  }
}
