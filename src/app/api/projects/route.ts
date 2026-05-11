import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { requireCurrentUser, UnauthorizedError } from "@/lib/auth";
import { query } from "@/lib/db";
import { getDemoProjects } from "@/lib/demo-parcels";
import { hasDatabaseConfig } from "@/lib/env";
import { ensureAppUser } from "@/lib/ownership";
import { parcelPropertiesFromRow, parsePoint } from "@/lib/parcels";
import type { ParcelRow, ProjectsResponseData, SavedParcelSummary, SavedProjectSummary } from "@/types/parcel";

export const runtime = "nodejs";

const projectsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  savedLimit: z.coerce.number().int().min(1).max(200).default(100)
});

type ProjectSavedParcelRow = Partial<ParcelRow> & {
  project_id: string;
  project_name: string;
  client_name: string | null;
  description: string | null;
  project_created_at: string | null;
  project_updated_at: string | null;
  saved_parcel_id: string | null;
  saved_label: string | null;
  saved_tag: string | null;
  saved_created_at: string | null;
  note_id: string | null;
  note: string | null;
  note_created_at: string | null;
};

type RouteContext = {
  params: Promise<Record<string, never>>;
};

function jsonResponse(body: { ok: boolean; data?: ProjectsResponseData; error?: string; demo?: boolean }, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function authErrorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return jsonResponse({ ok: false, error: err.message }, { status: err.status });
  }
  return null;
}

function groupProjectRows(rows: ProjectSavedParcelRow[]): SavedProjectSummary[] {
  const projects = new Map<string, SavedProjectSummary>();
  const savedParcels = new Map<string, SavedParcelSummary>();

  for (const row of rows) {
    let project = projects.get(row.project_id);
    if (!project) {
      project = {
        id: row.project_id,
        name: row.project_name,
        clientName: row.client_name,
        description: row.description,
        createdAt: row.project_created_at,
        updatedAt: row.project_updated_at,
        savedParcelCount: 0,
        savedParcels: []
      };
      projects.set(row.project_id, project);
    }

    if (!row.saved_parcel_id || !row.id) continue;

    let savedParcel = savedParcels.get(row.saved_parcel_id);
    if (!savedParcel) {
      savedParcel = {
        id: row.saved_parcel_id,
        projectId: row.project_id,
        label: row.saved_label,
        tag: row.saved_tag,
        createdAt: row.saved_created_at,
        parcel: parcelPropertiesFromRow(row as ParcelRow),
        center: parsePoint(row.center),
        notes: []
      };
      savedParcels.set(row.saved_parcel_id, savedParcel);
      project.savedParcels.push(savedParcel);
    }

    if (row.note_id && row.note) {
      savedParcel.notes.push({
        id: row.note_id,
        note: row.note,
        createdAt: row.note_created_at
      });
    }
  }

  return [...projects.values()].map((project) => ({
    ...project,
    savedParcelCount: project.savedParcels.length
  }));
}

async function getProjects(request: Request) {
  let user;
  try {
    user = requireCurrentUser(request);
  } catch (err) {
    const response = authErrorResponse(err);
    if (response) return response;
    throw err;
  }

  const url = new URL(request.url);
  const parsed = projectsQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? 20,
    savedLimit: url.searchParams.get("savedLimit") ?? 100
  });

  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "Invalid project list request" }, { status: 400 });
  }

  if (!hasDatabaseConfig()) {
    return jsonResponse({ ok: true, data: { projects: getDemoProjects() }, demo: true });
  }

  const { limit, savedLimit } = parsed.data;

  try {
    await ensureAppUser(user);
    const rows = await query<ProjectSavedParcelRow>(
      `
      WITH scoped_projects AS (
        SELECT *
        FROM projects
        WHERE owner_user_id = $1
        ORDER BY updated_at DESC, created_at DESC
        LIMIT $2
      ),
      ranked_saved_parcels AS (
        SELECT
          sp.*,
          row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.created_at DESC) AS saved_rank
        FROM saved_parcels sp
        INNER JOIN scoped_projects pr ON pr.id = sp.project_id
        WHERE sp.owner_user_id = $1
      )
      SELECT
        pr.id::text AS project_id,
        pr.name AS project_name,
        pr.client_name,
        pr.description,
        pr.created_at::text AS project_created_at,
        pr.updated_at::text AS project_updated_at,
        sp.id::text AS saved_parcel_id,
        sp.label AS saved_label,
        sp.tag AS saved_tag,
        sp.created_at::text AS saved_created_at,
        n.id::text AS note_id,
        n.note,
        n.created_at::text AS note_created_at,
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
        ST_AsGeoJSON(ST_PointOnSurface(p.geom))::json AS center
      FROM scoped_projects pr
      LEFT JOIN ranked_saved_parcels sp
        ON sp.project_id = pr.id AND sp.saved_rank <= $3
      LEFT JOIN parcels p ON p.id = sp.parcel_id
      LEFT JOIN parcel_sources s ON s.source_key = p.source_key
      LEFT JOIN parcel_notes n ON n.saved_parcel_id = sp.id
      ORDER BY pr.updated_at DESC, pr.created_at DESC, sp.created_at DESC NULLS LAST, n.created_at DESC NULLS LAST
      `,
      [user.id, limit, savedLimit]
    );

    return jsonResponse({ ok: true, data: { projects: groupProjectRows(rows) } });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Unable to load saved projects" },
      { status: 500 }
    );
  }
}

const guardedGetProjects = withApiGuard(getProjects, {
  route: "GET /api/projects",
  rateLimit: apiRateLimits.projects
});

export function GET(request: Request, context: RouteContext) {
  void context;
  return guardedGetProjects(request, undefined);
}
