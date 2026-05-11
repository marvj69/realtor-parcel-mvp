import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { createPasswordAccount, DuplicateAccountError } from "@/lib/accounts";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  isPrivateAuthEnabled,
  sessionCookieOptions,
  toPublicUser,
  verifyPrivateAppPassword
} from "@/lib/auth";
import { hasDatabaseConfig } from "@/lib/env";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().max(120).optional(),
  password: z.string().min(8).max(200),
  workspacePassword: z.string().min(1).max(500)
});

async function registerAccount(request: Request) {
  if (!hasDatabaseConfig()) {
    return NextResponse.json(
      { ok: false, error: "Account creation requires a configured Neon database." },
      { status: 503 }
    );
  }

  if (!isPrivateAuthEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Account creation requires the private workspace password to be configured." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid email and a password with at least 8 characters." }, { status: 400 });
  }

  const { email, displayName, password, workspacePassword } = parsed.data;
  if (!verifyPrivateAppPassword(workspacePassword)) {
    return NextResponse.json({ ok: false, error: "Invalid workspace password" }, { status: 401 });
  }

  try {
    const user = await createPasswordAccount({ email, displayName, password });
    const response = NextResponse.json({
      ok: true,
      data: {
        authEnabled: true,
        accountCreationEnabled: true,
        authenticated: true,
        user: toPublicUser(user)
      }
    });
    response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(user), sessionCookieOptions());
    return response;
  } catch (err) {
    if (err instanceof DuplicateAccountError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unable to create account" },
      { status: 500 }
    );
  }
}

export const POST = withApiGuard(registerAccount, {
  route: "POST /api/auth/register",
  requireAuth: false,
  rateLimit: apiRateLimits.auth
});
