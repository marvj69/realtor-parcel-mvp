import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import { searchDemoParcels } from "@/lib/demo-parcels";
import { parsePoint, parcelPropertiesFromRow } from "@/lib/parcels";
import type { ParcelRow, ParcelSearchResult } from "@/types/parcel";

export const runtime = "nodejs";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? 20
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Search query must be at least 2 characters" }, { status: 400 });
  }

  const { q, limit } = parsed.data;
  const like = `%${q}%`;

  if (!hasDatabaseConfig()) {
    return NextResponse.json({ ok: true, data: searchDemoParcels(q, limit), demo: true });
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
        ST_AsGeoJSON(ST_PointOnSurface(p.geom))::json AS center
      FROM parcels p
      LEFT JOIN parcel_sources s ON s.source_key = p.source_key
      WHERE
        p.parcel_id ILIKE $1 OR
        p.apn ILIKE $1 OR
        p.owner_name ILIKE $1 OR
        p.site_address ILIKE $1 OR
        p.mailing_address ILIKE $1
      ORDER BY p.source_county NULLS LAST, p.site_address NULLS LAST
      LIMIT $2
      `,
      [like, limit]
    );

    const data: ParcelSearchResult[] = rows.map((row) => ({
      ...parcelPropertiesFromRow(row),
      center: parsePoint(row.center)
    }));

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Parcel search failed" },
      { status: 500 }
    );
  }
}
