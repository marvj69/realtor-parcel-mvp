import { hasStaticParcels, getStaticParcels } from "@/lib/static-parcels";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import { getDemoParcelById, getDemoParcelByPoint } from "@/lib/demo-parcels";
import { parcelRowToFeature } from "@/lib/parcels";
import type { ParcelRow } from "@/types/parcel";

export const runtime = "nodejs";

const coordinateSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});
const idSchema = z.string().uuid();

const PARCEL_COLUMNS = `
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
  p.legal_description,
  ST_AsGeoJSON(p.geom)::json AS geometry`;

// Shared links and saved parcels select by ID so overlapping source polygons cannot
// substitute a different parcel. A saved snapshot in Neon covers parcels that a later
// dataset refresh no longer contains.
async function lookupParcelById(id: string) {
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ ok: false, error: "Invalid parcel id" }, { status: 400 });
  }

  if (hasStaticParcels()) {
    const row = (await getStaticParcels()).get(id);
    if (row) return NextResponse.json({ ok: true, data: parcelRowToFeature(row), storage: "static" });
  }

  if (!hasDatabaseConfig()) {
    return NextResponse.json({ ok: true, data: getDemoParcelById(id), demo: true });
  }

  const rows = await query<ParcelRow>(
    `SELECT ${PARCEL_COLUMNS}
     FROM parcels p
     LEFT JOIN parcel_sources s ON s.source_key = p.source_key
     WHERE p.id = $1`,
    [id]
  );
  return NextResponse.json({ ok: true, data: rows[0] ? parcelRowToFeature(rows[0]) : null });
}

async function lookupParcel(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id !== null) return lookupParcelById(id);

  const parsed = coordinateSchema.safeParse({
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng")
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid lat/lng" }, { status: 400 });
  }

  const { lat, lng } = parsed.data;

  if (hasStaticParcels()) {
    const store = await getStaticParcels();
    return NextResponse.json({ ok: true, data: store.lookup(lng, lat), storage: "static" });
  }

  if (!hasDatabaseConfig()) {
    return NextResponse.json({ ok: true, data: getDemoParcelByPoint(lng, lat), demo: true });
  }

  try {
    const rows = await query<ParcelRow>(
      `
      WITH click_point AS (
        SELECT ST_SetSRID(ST_Point($1, $2), 4326) AS geom
      )
      SELECT ${PARCEL_COLUMNS}
      FROM parcels p
      CROSS JOIN click_point cp
      LEFT JOIN parcel_sources s ON s.source_key = p.source_key
      WHERE ST_Intersects(p.geom, cp.geom)
      ORDER BY
        CASE WHEN p.owner_name IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN p.apn IS NOT NULL OR p.parcel_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN p.site_address IS NOT NULL THEN 0 ELSE 1 END,
        ST_Area(p.geom::geography) ASC
      LIMIT 1
      `,
      [lng, lat]
    );

    const feature = rows[0] ? parcelRowToFeature(rows[0]) : null;
    return NextResponse.json({ ok: true, data: feature });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Parcel lookup failed" },
      { status: 500 }
    );
  }
}

export const GET = withApiGuard(lookupParcel, {
  route: "GET /api/parcels/lookup",
  rateLimit: apiRateLimits.lookup
});
