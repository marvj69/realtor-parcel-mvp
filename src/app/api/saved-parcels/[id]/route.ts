import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";
import { PARCEL_TAGS } from "@/lib/parcel-presentation";
import {
  demoEditResult,
  noStoreJson,
  notFound,
  parseJsonBody,
  resolveSavedWorkRequest,
  type IdRouteContext
} from "@/lib/saved-work-api";

export const runtime = "nodejs";

const updateSchema = z.object({ tag: z.enum(PARCEL_TAGS).nullable() });

async function updateSavedParcel(request: Request, context: IdRouteContext) {
  const resolved = await resolveSavedWorkRequest(request, context);
  if (!resolved.ok) return resolved.response;
  const body = await parseJsonBody(request, updateSchema);
  if (!body) return noStoreJson({ ok: false, error: "Invalid saved parcel update" }, { status: 400 });
  if (!hasDatabaseConfig()) return demoEditResult();

  const rows = await query<{ id: string; tag: string | null }>(
    `UPDATE saved_parcels SET tag = $3 WHERE id = $1 AND owner_user_id = $2 RETURNING id::text, tag`,
    [resolved.id, resolved.user.id, body.tag]
  );
  if (!rows[0]) return notFound("Saved parcel");
  return noStoreJson({ ok: true, data: { ...rows[0], persisted: true } });
}

// Removes the parcel from its project along with its notes. The retained parcel
// snapshot stays in place because other projects may still reference it.
async function deleteSavedParcel(request: Request, context: IdRouteContext) {
  const resolved = await resolveSavedWorkRequest(request, context);
  if (!resolved.ok) return resolved.response;
  if (!hasDatabaseConfig()) return demoEditResult();

  const rows = await query<{ id: string }>(
    `DELETE FROM saved_parcels WHERE id = $1 AND owner_user_id = $2 RETURNING id::text`,
    [resolved.id, resolved.user.id]
  );
  if (!rows[0]) return notFound("Saved parcel");
  return noStoreJson({ ok: true, data: { id: rows[0].id, persisted: true } });
}

export const PATCH = withApiGuard(updateSavedParcel, {
  route: "PATCH /api/saved-parcels/:id",
  rateLimit: apiRateLimits.savedWork
});

export const DELETE = withApiGuard(deleteSavedParcel, {
  route: "DELETE /api/saved-parcels/:id",
  rateLimit: apiRateLimits.savedWork
});
