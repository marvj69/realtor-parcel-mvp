import "server-only";

import type { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getNumberEnv } from "@/lib/env";

export const AUTH_COOKIE_NAME = "realtor_parcel_session";
export const DEFAULT_APP_USER_ID = "private-app-user";

const TOKEN_VERSION = 1;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AppUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  authenticated: boolean;
  authEnabled: boolean;
};

type SessionPayload = {
  v: number;
  sub: string;
  email: string | null;
  name: string | null;
  iat: number;
  exp: number;
};

export class UnauthorizedError extends Error {
  status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function timingSafeTextEqual(left: string, right: string) {
  return timingSafeEqual(hash(left), hash(right));
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function getSessionSecret(): string | null {
  return envValue("APP_AUTH_SESSION_SECRET") ?? envValue("APP_AUTH_PASSWORD");
}

function getSessionTtlSeconds() {
  return getNumberEnv("APP_AUTH_SESSION_TTL_SECONDS", DEFAULT_SESSION_TTL_SECONDS);
}

export function isPrivateAuthEnabled() {
  return Boolean(envValue("APP_AUTH_PASSWORD"));
}

export function getConfiguredAppUser(): Omit<AppUser, "authenticated" | "authEnabled"> {
  return {
    id: envValue("APP_AUTH_USER_ID") ?? DEFAULT_APP_USER_ID,
    email: envValue("APP_AUTH_USER_EMAIL"),
    displayName: envValue("APP_AUTH_USER_NAME") ?? "Private app user"
  };
}

export function verifyPrivateAppPassword(password: string) {
  const expected = envValue("APP_AUTH_PASSWORD");
  if (!expected) return true;
  return timingSafeTextEqual(password, expected);
}

export function verifyPrivateAppUsername(username: string | null | undefined) {
  const expected = envValue("APP_AUTH_USERNAME");
  if (!expected) return true;
  return timingSafeTextEqual(username?.trim() ?? "", expected);
}

export function createSessionToken(user = getConfiguredAppUser()) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("APP_AUTH_SESSION_SECRET or APP_AUTH_PASSWORD is required to create a session.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: TOKEN_VERSION,
    sub: user.id,
    email: user.email,
    name: user.displayName,
    iat: now,
    exp: now + getSessionTtlSeconds()
  };
  const body = encodeJson(payload);
  return `${body}.${sign(body, secret)}`;
}

function parseCookieHeader(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  for (const chunk of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = chunk.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }

  return null;
}

function verifySessionToken(token: string): SessionPayload | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body, secret);
  if (!timingSafeTextEqual(signature, expected)) return null;

  const payload = decodeJson<SessionPayload>(body);
  const configuredUser = getConfiguredAppUser();
  const now = Math.floor(Date.now() / 1000);

  if (!payload || payload.v !== TOKEN_VERSION || payload.sub !== configuredUser.id || payload.exp <= now) {
    return null;
  }

  return payload;
}

export function getCurrentUser(request: Request): AppUser | null {
  const configuredUser = getConfiguredAppUser();
  const authEnabled = isPrivateAuthEnabled();

  if (!authEnabled) {
    return {
      ...configuredUser,
      authenticated: true,
      authEnabled: false
    };
  }

  const token = parseCookieHeader(request.headers.get("cookie"), AUTH_COOKIE_NAME);
  const payload = token ? verifySessionToken(token) : null;
  if (!payload) return null;

  return {
    id: payload.sub,
    email: payload.email,
    displayName: payload.name,
    authenticated: true,
    authEnabled: true
  };
}

export function requireCurrentUser(request: Request) {
  const user = getCurrentUser(request);
  if (!user) throw new UnauthorizedError();
  return user;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionTtlSeconds()
  };
}

export function expiredSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  };
}

export function toPublicUser(user: AppUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName
  };
}

export type RequestUser = {
  authenticated: boolean;
  userLabel: string;
  appUser: AppUser | null;
};

export function getConfiguredUserLabel() {
  return getConfiguredAppUser().id;
}

export function isAuthRequired() {
  return isPrivateAuthEnabled();
}

export function isValidLoginPassword(password: string) {
  return verifyPrivateAppPassword(password);
}

export function getRequestUser(request: Request): RequestUser {
  const appUser = getCurrentUser(request);
  const configuredUser = getConfiguredAppUser();

  return {
    authenticated: Boolean(appUser),
    userLabel: appUser?.id ?? configuredUser.id,
    appUser
  };
}

export function setSessionCookie(response: NextResponse, userLabel?: string) {
  void userLabel;
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(), sessionCookieOptions());
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, "", expiredSessionCookieOptions());
}
