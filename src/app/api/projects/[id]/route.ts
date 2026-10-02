import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import {
  demoEditResult,
  isUniqueViolation,
  noStoreJson,
  notFound,
  parseJsonBody,
  resolveSavedWorkRequest,
  type IdRouteContext
} from "@/lib/saved-work-api";

export const runtime = "nodejs";

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    clientName: z.string().trim().max(120).nullable().optional()
  })
  .refine((value) => value.name !== undefined || value.clientName !== undefined);

async function updateProject(request: Request, context: IdRouteContext) {
  const resolved = await resolveSavedWorkRequest(request, context);
  if (!resolved.ok) return resolved.response;
  const body = await parseJsonBody(request, updateSchema);
  if (!body) return noStoreJson({ ok: false, error: "Invalid project update" }, { status: 400 });
  if (!hasDatabaseConfig()) return demoEditResult();

  try {
    const rows = await query<{ id: string; name: string; client_name: string | null }>(
      `
      UPDATE projects
      SET name = COALESCE($3, name),
          client_name = CASE WHEN $4 THEN NULLIF($5, '') ELSE client_name END
      WHERE id = $1 AND owner_user_id = $2
      RETURNING id::text, name, client_name
      `,
      [resolved.id, resolved.user.id, body.name ?? null, body.clientName !== undefined, body.clientName ?? null]
    );
    if (!rows[0]) return notFound("Project");
    return noStoreJson({
      ok: true,
      data: { id: rows[0].id, name: rows[0].name, clientName: rows[0].client_name, persisted: true }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return noStoreJson({ ok: false, error: "You already have a project with that name." }, { status: 409 });
    }
    throw err;
  }
}

// Removing a project removes its saved parcels and their notes (ON DELETE CASCADE).
async function deleteProject(request: Request, context: IdRouteContext) {
  const resolved = await resolveSavedWorkRequest(request, context);
  if (!resolved.ok) return resolved.response;
  if (!hasDatabaseConfig()) return demoEditResult();

  const rows = await query<{ id: string }>(
    `DELETE FROM projects WHERE id = $1 AND owner_user_id = $2 RETURNING id::text`,
    [resolved.id, resolved.user.id]
  );
  if (!rows[0]) return notFound("Project");
  return noStoreJson({ ok: true, data: { id: rows[0].id, persisted: true } });
}

export const PATCH = withApiGuard(updateProject, {
  route: "PATCH /api/projects/:id",
  rateLimit: apiRateLimits.savedWork
});

export const DELETE = withApiGuard(deleteProject, {
  route: "DELETE /api/projects/:id",
  rateLimit: apiRateLimits.savedWork
});
