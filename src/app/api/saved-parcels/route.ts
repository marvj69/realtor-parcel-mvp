import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { requireCurrentUser, UnauthorizedError } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { hasDemoParcel } from "@/lib/demo-parcels";
import { hasDatabaseConfig } from "@/lib/env";
import { ensureAppUser } from "@/lib/ownership";
import { parcelPropertiesFromRow } from "@/lib/parcels";
import type { ParcelRow } from "@/types/parcel";

export const runtime = "nodejs";

const saveSchema = z.object({
  parcelDatabaseId: z.string().uuid(),
  projectName: z.string().trim().min(1).max(120),
  clientName: z.string().trim().max(120).optional().nullable(),
  tag: z.string().trim().max(60).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable()
});

type SavedParcelListRow = ParcelRow & {
  project_id: string;
  project_name: string;
  project_client_name: string | null;
  project_description: string | null;
  project_created_at: string;
  project_updated_at: string;
  saved_parcel_id: string | null;
  saved_tag: string | null;
  saved_label: string | null;
  saved_created_at: string | null;
  notes: Array<{ id: string; note: string; createdAt: string }> | null;
};

function authErrorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  return null;
}

function groupSavedParcels(rows: SavedParcelListRow[]) {
  const projects = new Map<
    string,
    {
      id: string;
      name: string;
      clientName: string | null;
      description: string | null;
      createdAt: string;
      updatedAt: string;
      savedParcels: Array<{
        id: string;
        label: string | null;
        tag: string | null;
        createdAt: string | null;
        parcel: ReturnType<typeof parcelPropertiesFromRow>;
        notes: Array<{ id: string; note: string; createdAt: string }>;
      }>;
    }
  >();

  for (const row of rows) {
    if (!projects.has(row.project_id)) {
      projects.set(row.project_id, {
        id: row.project_id,
        name: row.project_name,
        clientName: row.project_client_name,
        description: row.project_description,
        createdAt: row.project_created_at,
        updatedAt: row.project_updated_at,
        savedParcels: []
      });
    }

    if (!row.saved_parcel_id || !row.id) continue;

    projects.get(row.project_id)?.savedParcels.push({
      id: row.saved_parcel_id,
      label: row.saved_label,
      tag: row.saved_tag,
      createdAt: row.saved_created_at,
      parcel: parcelPropertiesFromRow(row),
      notes: row.notes ?? []
    });
  }

  return Array.from(projects.values());
}

async function listSavedParcels(request: Request) {
  let user;
  try {
    user = requireCurrentUser(request);
  } catch (err) {
    const response = authErrorResponse(err);
    if (response) return response;
    throw err;
  }

  if (!hasDatabaseConfig()) {
    return NextResponse.json({
      ok: true,
      data: { ownerUserId: user.id, projects: [] },
      demo: true
    });
  }

  try {
    await ensureAppUser(user);
    const result = await getPool().query<SavedParcelListRow>(
      `
      SELECT
        pr.id::text AS project_id,
        pr.name AS project_name,
        pr.client_name AS project_client_name,
        pr.description AS project_description,
        pr.created_at::text AS project_created_at,
        pr.updated_at::text AS project_updated_at,
        sp.id::text AS saved_parcel_id,
        sp.label AS saved_label,
        sp.tag AS saved_tag,
        sp.created_at::text AS saved_created_at,
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
        COALESCE(notes.items, '[]'::jsonb) AS notes
      FROM projects pr
      LEFT JOIN saved_parcels sp
        ON sp.project_id = pr.id AND sp.owner_user_id = pr.owner_user_id
      LEFT JOIN parcels p ON p.id = sp.parcel_id
      LEFT JOIN parcel_sources s ON s.source_key = p.source_key
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pn.id::text,
            'note', pn.note,
            'createdAt', pn.created_at::text
          )
          ORDER BY pn.created_at DESC
        ) AS items
        FROM parcel_notes pn
        WHERE pn.saved_parcel_id = sp.id
      ) notes ON true
      WHERE pr.owner_user_id = $1
      ORDER BY pr.updated_at DESC, sp.created_at DESC NULLS LAST
      `,
      [user.id]
    );

    return NextResponse.json({
      ok: true,
      data: {
        ownerUserId: user.id,
        projects: groupSavedParcels(result.rows)
      }
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unable to load saved parcels" },
      { status: 500 }
    );
  }
}

async function saveParcel(request: Request) {
  let user;
  try {
    user = requireCurrentUser(request);
  } catch (err) {
    const response = authErrorResponse(err);
    if (response) return response;
    throw err;
  }

  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid save request" }, { status: 400 });
  }

  const { parcelDatabaseId, projectName, clientName, tag, note } = parsed.data;

  if (!hasDatabaseConfig()) {
    if (!hasDemoParcel(parcelDatabaseId)) {
      return NextResponse.json({ ok: false, error: "Demo parcel not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        projectId: "demo-project",
        savedParcelId: `demo-save-${parcelDatabaseId}`,
        persisted: false,
        ownerUserId: user.id,
        projectName,
        clientName: clientName ?? null,
        tag: tag ?? null,
        note: note ?? null
      },
      demo: true
    });
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await ensureAppUser(user, client);

    const projectResult = await client.query<{ id: string }>(
      `
      INSERT INTO projects (owner_user_id, user_label, name, client_name)
      VALUES ($1, $1, $2, $3)
      ON CONFLICT (owner_user_id, name)
      DO UPDATE SET client_name = COALESCE(EXCLUDED.client_name, projects.client_name)
      RETURNING id::text
      `,
      [user.id, projectName, clientName ?? null]
    );

    const projectId = projectResult.rows[0]?.id;
    if (!projectId) throw new Error("Could not create project");

    const savedResult = await client.query<{ id: string }>(
      `
      INSERT INTO saved_parcels (owner_user_id, project_id, parcel_id, tag)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (project_id, parcel_id)
      DO UPDATE SET tag = COALESCE(EXCLUDED.tag, saved_parcels.tag)
      RETURNING id::text
      `,
      [user.id, projectId, parcelDatabaseId, tag ?? null]
    );

    const savedParcelId = savedResult.rows[0]?.id;
    if (!savedParcelId) throw new Error("Could not save parcel");

    if (note) {
      await client.query(
        `INSERT INTO parcel_notes (saved_parcel_id, note) VALUES ($1, $2)`,
        [savedParcelId, note]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, data: { ownerUserId: user.id, projectId, savedParcelId } });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unable to save parcel" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export const POST = withApiGuard(saveParcel, {
  route: "POST /api/saved-parcels",
  rateLimit: apiRateLimits.saveParcel
});

export const GET = withApiGuard(listSavedParcels, {
  route: "GET /api/saved-parcels",
  rateLimit: apiRateLimits.projects
});
