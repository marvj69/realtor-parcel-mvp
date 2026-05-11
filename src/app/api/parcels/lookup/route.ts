import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import { getDemoParcelByPoint } from "@/lib/demo-parcels";
import { parcelRowToFeature } from "@/lib/parcels";
import type { ParcelRow } from "@/types/parcel";

export const runtime = "nodejs";

const coordinateSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

async function lookupParcel(request: Request) {
  const url = new URL(request.url);
  const parsed = coordinateSchema.safeParse({
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng")
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid lat/lng" }, { status: 400 });
  }

  const { lat, lng } = parsed.data;

  if (!hasDatabaseConfig()) {
    return NextResponse.json({ ok: true, data: getDemoParcelByPoint(lng, lat), demo: true });
  }

  try {
    const rows = await query<ParcelRow>(
      `
      WITH click_point AS (
        SELECT ST_SetSRID(ST_Point($1, $2), 4326) AS geom
      )
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
        p.legal_description,
        ST_AsGeoJSON(p.geom)::json AS geometry
      FROM parcels p
      CROSS JOIN click_point cp
      LEFT JOIN parcel_sources s ON s.source_key = p.source_key
      WHERE ST_Intersects(p.geom, cp.geom)
      ORDER BY ST_Area(p.geom::geography) ASC
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
