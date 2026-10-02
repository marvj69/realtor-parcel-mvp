import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser, UnauthorizedError, type AppUser } from "@/lib/auth";

export type IdRouteContext = { params: Promise<{ id: string }> };

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const notFound = (what: string) => noStoreJson({ ok: false, error: `${what} not found` }, { status: 404 });

// Without DATABASE_URL the app runs a read-only demo, so edits succeed without persisting.
export const demoEditResult = () => noStoreJson({ ok: true, data: { persisted: false }, demo: true });

/** Resolves the signed-in user and a UUID route id, or the response to return instead. */
export async function resolveSavedWorkRequest(
  request: Request,
  context: IdRouteContext
): Promise<{ ok: true; user: AppUser; id: string } | { ok: false; response: NextResponse }> {
  let user: AppUser;
  try {
    user = requireCurrentUser(request);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return { ok: false, response: noStoreJson({ ok: false, error: err.message }, { status: err.status }) };
    }
    throw err;
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, response: notFound("Record") };
  return { ok: true, user, id };
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

export function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}
