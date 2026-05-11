import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { hasDemoParcel } from "@/lib/demo-parcels";
import { hasDatabaseConfig } from "@/lib/env";

export const runtime = "nodejs";

const saveSchema = z.object({
  parcelDatabaseId: z.string().uuid(),
  projectName: z.string().trim().min(1).max(120),
  clientName: z.string().trim().max(120).optional().nullable(),
  tag: z.string().trim().max(60).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable()
});

export async function POST(request: Request) {
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

    const projectResult = await client.query<{ id: string }>(
      `
      INSERT INTO projects (user_label, name, client_name)
      VALUES ('default', $1, $2)
      ON CONFLICT (user_label, name)
      DO UPDATE SET client_name = COALESCE(EXCLUDED.client_name, projects.client_name)
      RETURNING id::text
      `,
      [projectName, clientName ?? null]
    );

    const projectId = projectResult.rows[0]?.id;
    if (!projectId) throw new Error("Could not create project");

    const savedResult = await client.query<{ id: string }>(
      `
      INSERT INTO saved_parcels (project_id, parcel_id, tag)
      VALUES ($1, $2, $3)
      ON CONFLICT (project_id, parcel_id)
      DO UPDATE SET tag = COALESCE(EXCLUDED.tag, saved_parcels.tag)
      RETURNING id::text
      `,
      [projectId, parcelDatabaseId, tag ?? null]
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
    return NextResponse.json({ ok: true, data: { projectId, savedParcelId } });
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
