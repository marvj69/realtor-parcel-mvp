import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import { searchDemoParcels } from "@/lib/demo-parcels";
import { parsePoint, parcelPropertiesFromRow } from "@/lib/parcels";
import type { ParcelRow, ParcelSearchResult } from "@/types/parcel";

export const runtime = "nodejs";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  mode: z.enum(["search", "autocomplete"]).default("search")
});

type RankedParcelSearchRow = ParcelRow & {
  match_kind: ParcelSearchResult["matchKind"];
  match_label: string | null;
  rank_score: string | number | null;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function searchParcels(request: Request) {
  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode") === "autocomplete" ? "autocomplete" : "search";
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? (modeParam === "autocomplete" ? 8 : 20),
    mode: modeParam
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Search query must be at least 2 characters" }, { status: 400 });
  }

  const { q, mode } = parsed.data;
  const limit = mode === "autocomplete" ? Math.min(parsed.data.limit, 10) : parsed.data.limit;
  const escapedQuery = escapeLike(q.toLowerCase());
  const containsPattern = `%${escapedQuery}%`;
  const prefixPattern = `${escapedQuery}%`;
  const normalizedQuery = q.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedPrefixPattern = normalizedQuery ? `${normalizedQuery}%` : "__never_match__";

  if (!hasDatabaseConfig()) {
    return NextResponse.json({ ok: true, data: searchDemoParcels(q, limit), demo: true, mode });
  }

  try {
    const rows = await query<RankedParcelSearchRow>(
      `
      WITH params AS (
        SELECT
          lower($1)::text AS q,
          $2::text AS contains_pattern,
          $3::text AS prefix_pattern,
          $4::text AS q_norm,
          $5::text AS norm_prefix_pattern
      ),
      candidate_parcels AS (
        SELECT
          p.*,
          s.source_url,
          s.source_updated_at::text AS source_updated_at,
          s.imported_at::text AS imported_at
        FROM parcels p
        LEFT JOIN parcel_sources s ON s.source_key = p.source_key
        CROSS JOIN params
        WHERE
          p.parcel_id ILIKE params.contains_pattern ESCAPE '\\' OR
          p.apn ILIKE params.contains_pattern ESCAPE '\\' OR
          p.owner_name ILIKE params.contains_pattern ESCAPE '\\' OR
          p.site_address ILIKE params.contains_pattern ESCAPE '\\' OR
          p.mailing_address ILIKE params.contains_pattern ESCAPE '\\' OR
          p.land_use ILIKE params.contains_pattern ESCAPE '\\' OR
          (
            params.q_norm <> '' AND
            (
              regexp_replace(lower(coalesce(p.parcel_id, '')), '[^a-z0-9]', '', 'g') LIKE params.norm_prefix_pattern OR
              regexp_replace(lower(coalesce(p.apn, '')), '[^a-z0-9]', '', 'g') LIKE params.norm_prefix_pattern
            )
          )
      )
      SELECT
        p.id::text,
        p.source_key,
        p.source_feature_id,
        p.provider,
        p.source_county,
        p.state,
        p.source_url,
        p.source_updated_at,
        p.imported_at,
        p.parcel_id,
        p.apn,
        p.owner_name,
        p.site_address,
        p.mailing_address,
        p.acreage,
        p.assessed_value,
        p.land_use,
        ST_AsGeoJSON(ST_PointOnSurface(p.geom))::json AS center,
        best_match.kind AS match_kind,
        best_match.label AS match_label,
        best_match.rank_score AS rank_score
      FROM candidate_parcels p
      CROSS JOIN params
      CROSS JOIN LATERAL (
        SELECT kind, label, rank_score
        FROM (
          VALUES
            (
              'apn'::text,
              p.apn,
              CASE
                WHEN p.apn IS NULL THEN 0
                WHEN lower(p.apn) = params.q THEN 1000
                WHEN params.q_norm <> '' AND regexp_replace(lower(p.apn), '[^a-z0-9]', '', 'g') = params.q_norm THEN 990
                WHEN lower(p.apn) LIKE params.prefix_pattern ESCAPE '\\' THEN 920
                WHEN params.q_norm <> '' AND regexp_replace(lower(p.apn), '[^a-z0-9]', '', 'g') LIKE params.norm_prefix_pattern THEN 900
                WHEN lower(p.apn) LIKE params.contains_pattern ESCAPE '\\' THEN 650
                ELSE similarity(lower(p.apn), params.q) * 250
              END::numeric
            ),
            (
              'parcel_id'::text,
              p.parcel_id,
              CASE
                WHEN p.parcel_id IS NULL THEN 0
                WHEN lower(p.parcel_id) = params.q THEN 980
                WHEN params.q_norm <> '' AND regexp_replace(lower(p.parcel_id), '[^a-z0-9]', '', 'g') = params.q_norm THEN 970
                WHEN lower(p.parcel_id) LIKE params.prefix_pattern ESCAPE '\\' THEN 910
                WHEN params.q_norm <> '' AND regexp_replace(lower(p.parcel_id), '[^a-z0-9]', '', 'g') LIKE params.norm_prefix_pattern THEN 890
                WHEN lower(p.parcel_id) LIKE params.contains_pattern ESCAPE '\\' THEN 640
                ELSE similarity(lower(p.parcel_id), params.q) * 240
              END::numeric
            ),
            (
              'site_address'::text,
              p.site_address,
              CASE
                WHEN p.site_address IS NULL THEN 0
                WHEN lower(p.site_address) = params.q THEN 780
                WHEN lower(p.site_address) LIKE params.prefix_pattern ESCAPE '\\' THEN 700
                WHEN lower(p.site_address) LIKE params.contains_pattern ESCAPE '\\' THEN 500
                ELSE similarity(lower(p.site_address), params.q) * 180
              END::numeric
            ),
            (
              'owner_name'::text,
              p.owner_name,
              CASE
                WHEN p.owner_name IS NULL THEN 0
                WHEN lower(p.owner_name) = params.q THEN 760
                WHEN lower(p.owner_name) LIKE params.prefix_pattern ESCAPE '\\' THEN 690
                WHEN lower(p.owner_name) LIKE params.contains_pattern ESCAPE '\\' THEN 480
                ELSE similarity(lower(p.owner_name), params.q) * 170
              END::numeric
            ),
            (
              'mailing_address'::text,
              p.mailing_address,
              CASE
                WHEN p.mailing_address IS NULL THEN 0
                WHEN lower(p.mailing_address) = params.q THEN 740
                WHEN lower(p.mailing_address) LIKE params.prefix_pattern ESCAPE '\\' THEN 660
                WHEN lower(p.mailing_address) LIKE params.contains_pattern ESCAPE '\\' THEN 440
                ELSE similarity(lower(p.mailing_address), params.q) * 150
              END::numeric
            ),
            (
              'land_use'::text,
              p.land_use,
              CASE
                WHEN p.land_use IS NULL THEN 0
                WHEN lower(p.land_use) = params.q THEN 520
                WHEN lower(p.land_use) LIKE params.prefix_pattern ESCAPE '\\' THEN 430
                WHEN lower(p.land_use) LIKE params.contains_pattern ESCAPE '\\' THEN 260
                ELSE similarity(lower(p.land_use), params.q) * 100
              END::numeric
            )
        ) AS candidates(kind, label, rank_score)
        WHERE
          label IS NOT NULL AND
          (
            lower(label) LIKE params.contains_pattern ESCAPE '\\' OR
            (
              params.q_norm <> '' AND
              regexp_replace(lower(label), '[^a-z0-9]', '', 'g') LIKE params.norm_prefix_pattern
            )
          )
        ORDER BY rank_score DESC
        LIMIT 1
      ) AS best_match
      ORDER BY
        best_match.rank_score DESC,
        CASE best_match.kind
          WHEN 'apn' THEN 0
          WHEN 'parcel_id' THEN 1
          WHEN 'site_address' THEN 2
          WHEN 'owner_name' THEN 3
          WHEN 'mailing_address' THEN 4
          ELSE 5
        END,
        p.source_county NULLS LAST,
        p.site_address NULLS LAST,
        p.parcel_id NULLS LAST
      LIMIT $6
      `,
      [q, containsPattern, prefixPattern, normalizedQuery, normalizedPrefixPattern, limit]
    );

    const data: ParcelSearchResult[] = rows.map((row) => ({
      ...parcelPropertiesFromRow(row),
      center: parsePoint(row.center),
      matchKind: row.match_kind,
      matchLabel: row.match_label,
      rank: row.rank_score === null ? null : Number(row.rank_score)
    }));

    return NextResponse.json({ ok: true, data, mode });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Parcel search failed" },
      { status: 500 }
    );
  }
}

export const GET = withApiGuard(searchParcels, {
  route: "GET /api/parcels/search",
  rateLimit: apiRateLimits.search
});
