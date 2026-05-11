import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimits, withApiGuard } from "@/lib/api-guard";
import { verifyPasswordAccount } from "@/lib/accounts";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  expiredSessionCookieOptions,
  getConfiguredAppUser,
  getCurrentUser,
  isPrivateAuthEnabled,
  sessionCookieOptions,
  toPublicUser,
  verifyPrivateAppPassword,
  verifyPrivateAppUsername
} from "@/lib/auth";
import { hasDatabaseConfig } from "@/lib/env";
import { ensureAppUser } from "@/lib/ownership";

export const runtime = "nodejs";

const loginSchema = z.object({
  username: z.string().trim().max(254).optional(),
  password: z.string().min(1).max(500)
});

async function getSession(request: Request) {
  const user = getCurrentUser(request);

  return NextResponse.json({
    ok: true,
    data: {
      authEnabled: isPrivateAuthEnabled(),
      accountCreationEnabled: isPrivateAuthEnabled() && hasDatabaseConfig(),
      authenticated: Boolean(user),
      user: user ? toPublicUser(user) : null
    }
  });
}

async function createSession(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
  }

  if (!isPrivateAuthEnabled()) {
    const configuredUser = getConfiguredAppUser();
    const response = NextResponse.json({
      ok: true,
      data: {
        authEnabled: false,
        accountCreationEnabled: false,
        authenticated: true,
        user: toPublicUser({ ...configuredUser, authenticated: true, authEnabled: false })
      }
    });
    response.cookies.set(AUTH_COOKIE_NAME, "", expiredSessionCookieOptions());
    return response;
  }

  const { username, password } = parsed.data;
  if (username && hasDatabaseConfig()) {
    const accountResult = await verifyPasswordAccount(username, password);
    if (accountResult.status === "matched") {
      const response = NextResponse.json({
        ok: true,
        data: {
          authEnabled: true,
          accountCreationEnabled: true,
          authenticated: true,
          user: toPublicUser(accountResult.user)
        }
      });
      response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(accountResult.user), sessionCookieOptions());
      return response;
    }

    if (accountResult.status === "invalid") {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }
  }

  if (!verifyPrivateAppUsername(username) || !verifyPrivateAppPassword(password)) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const configuredUser = getConfiguredAppUser();
  const user = { ...configuredUser, authenticated: true, authEnabled: true };

  if (hasDatabaseConfig()) {
    await ensureAppUser(user);
  }

  const token = createSessionToken(configuredUser);
  const response = NextResponse.json({
    ok: true,
    data: {
      authEnabled: true,
      accountCreationEnabled: hasDatabaseConfig(),
      authenticated: true,
      user: toPublicUser(user)
    }
  });
  response.cookies.set(AUTH_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}

async function deleteSession() {
  const response = NextResponse.json({
    ok: true,
    data: {
      authEnabled: isPrivateAuthEnabled(),
      accountCreationEnabled: isPrivateAuthEnabled() && hasDatabaseConfig(),
      authenticated: false,
      user: null
    }
  });
  response.cookies.set(AUTH_COOKIE_NAME, "", expiredSessionCookieOptions());
  return response;
}

export const GET = withApiGuard(getSession, {
  route: "GET /api/auth/session",
  requireAuth: false,
  rateLimit: apiRateLimits.auth
});

export const POST = withApiGuard(createSession, {
  route: "POST /api/auth/session",
  requireAuth: false,
  rateLimit: apiRateLimits.auth
});

export const DELETE = withApiGuard(deleteSession, {
  route: "DELETE /api/auth/session",
  requireAuth: false,
  rateLimit: apiRateLimits.auth
});
