import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import {
  demoEditResult,
  noStoreJson,
  notFound,
  parseJsonBody,
  resolveSavedWorkRequest,
  type IdRouteContext
} from "@/lib/saved-work-api";

export const runtime = "nodejs";

const updateSchema = z.object({ note: z.string().trim().min(1).max(2000) });

// Notes have no owner column; ownership comes from the saved parcel they belong to.
async function updateNote(request: Request, context: IdRouteContext) {
  const resolved = await resolveSavedWorkRequest(request, context);
  if (!resolved.ok) return resolved.response;
  const body = await parseJsonBody(request, updateSchema);
  if (!body) return noStoreJson({ ok: false, error: "Notes must be 1–2,000 characters." }, { status: 400 });
  if (!hasDatabaseConfig()) return demoEditResult();

  const rows = await query<{ id: string; note: string }>(
    `
    UPDATE parcel_notes n
    SET note = $3
    FROM saved_parcels sp
    WHERE n.id = $1 AND sp.id = n.saved_parcel_id AND sp.owner_user_id = $2
    RETURNING n.id::text, n.note
    `,
    [resolved.id, resolved.user.id, body.note]
  );
  if (!rows[0]) return notFound("Note");
  return noStoreJson({ ok: true, data: { ...rows[0], persisted: true } });
}

async function deleteNote(request: Request, context: IdRouteContext) {
  const resolved = await resolveSavedWorkRequest(request, context);
  if (!resolved.ok) return resolved.response;
  if (!hasDatabaseConfig()) return demoEditResult();

  const rows = await query<{ id: string }>(
    `
    DELETE FROM parcel_notes n
    USING saved_parcels sp
    WHERE n.id = $1 AND sp.id = n.saved_parcel_id AND sp.owner_user_id = $2
    RETURNING n.id::text
    `,
    [resolved.id, resolved.user.id]
  );
  if (!rows[0]) return notFound("Note");
  return noStoreJson({ ok: true, data: { id: rows[0].id, persisted: true } });
}

export const PATCH = withApiGuard(updateNote, {
  route: "PATCH /api/parcel-notes/:id",
  rateLimit: apiRateLimits.savedWork
});

export const DELETE = withApiGuard(deleteNote, {
  route: "DELETE /api/parcel-notes/:id",
  rateLimit: apiRateLimits.savedWork
});
