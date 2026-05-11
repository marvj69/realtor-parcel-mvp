import { NextResponse } from "next/server";
import { getConfiguredAppUser, getCurrentUser, type AppUser } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, type RateLimitPolicy, type RateLimitResult } from "@/lib/rate-limit";
import {
  createRequestLogContext,
  logApiRequest as writeStructuredRequestLog,
  serializeError
} from "@/lib/request-log";

type GuardOptions = {
  route: string;
  requireAuth?: boolean;
  limit?: number;
  windowMs?: number;
};

type GuardOk = {
  ok: true;
  user: AppUser;
  headers: Headers;
  rateLimit?: RateLimitResult;
};

type GuardBlocked = {
  ok: false;
  response: NextResponse;
};

type LogContext = {
  route: string;
  status: number;
  userLabel?: string;
  startTime?: number;
  rateLimited?: boolean;
  error?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

type ApiHandler = (request: Request) => Promise<Response> | Response;
type ContextApiHandler<Context> = (request: Request, context: Context) => Promise<Response> | Response;

export const apiRateLimits = {
  health: { max: 120, windowMs: 60_000 },
  bbox: { max: 90, windowMs: 60_000 },
  lookup: { max: 120, windowMs: 60_000 },
  search: { max: 60, windowMs: 60_000 },
  saveParcel: { max: 20, windowMs: 60_000 },
  auth: { max: 20, windowMs: 60_000 },
  projects: { max: 60, windowMs: 60_000 },
  tiles: { max: 3000, windowMs: 60_000 }
} satisfies Record<string, RateLimitPolicy>;

const DEFAULT_RATE_LIMIT = { max: 240, windowMs: 60_000 } satisfies RateLimitPolicy;

function getDefaultLimit() {
  const value = Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? DEFAULT_RATE_LIMIT.max);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RATE_LIMIT.max;
}

function shouldDisableRateLimit() {
  return process.env.API_RATE_LIMIT_DISABLED === "true";
}

function elapsedMs(startTime?: number) {
  return startTime ? Date.now() - startTime : 0;
}

function headersFromRateLimit(rate: RateLimitResult) {
  return new Headers(rateLimitHeaders(rate));
}

function setHeaders(response: Response, headers: Headers) {
  const guarded = new Response(response.body, response);
  headers.forEach((value, key) => guarded.headers.set(key, value));
  return guarded;
}

function unauthenticatedUser(): AppUser {
  return {
    ...getConfiguredAppUser(),
    authenticated: false,
    authEnabled: true
  };
}

export function logApiRequest(request: Request, context: LogContext) {
  const logContext = createRequestLogContext(request, context.route);
  writeStructuredRequestLog(logContext, {
    status: context.status,
    durationMs: elapsedMs(context.startTime),
    rateLimit: context.rateLimited
      ? {
          limit: Number(context.meta?.rateLimit ?? 0),
          remaining: 0,
          limited: true
        }
      : undefined,
    error: context.error ? { name: "ApiRouteError", message: context.error } : undefined
  });
}

export async function guardApiRequest(request: Request, options: GuardOptions): Promise<GuardOk | GuardBlocked> {
  const startTime = Date.now();
  const requireAuth = options.requireAuth ?? true;
  const user = getCurrentUser(request);
  const userLabel = user?.id ?? getConfiguredAppUser().id;

  if (requireAuth && !user) {
    logApiRequest(request, {
      route: options.route,
      status: 401,
      userLabel,
      startTime,
      error: "unauthorized"
    });
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    };
  }

  const effectiveUser = user ?? unauthenticatedUser();

  if (shouldDisableRateLimit()) {
    return { ok: true, user: effectiveUser, headers: new Headers() };
  }

  const limit = options.limit ?? getDefaultLimit();
  const windowMs = options.windowMs ?? DEFAULT_RATE_LIMIT.windowMs;
  const rateLimit = checkRateLimit(request, options.route, { max: limit, windowMs });
  const headers = headersFromRateLimit(rateLimit);

  if (!rateLimit.allowed) {
    headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    logApiRequest(request, {
      route: options.route,
      status: 429,
      userLabel,
      startTime,
      rateLimited: true,
      error: "rate_limited",
      meta: { rateLimit: limit }
    });

    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "Too many requests. Please slow down and try again shortly.",
          retryAfterSeconds: rateLimit.retryAfterSeconds
        },
        { status: 429, headers }
      )
    };
  }

  return { ok: true, user: effectiveUser, headers, rateLimit };
}

export function apiJson(
  request: Request,
  route: string,
  body: unknown,
  init: ResponseInit & { headers?: Headers } = {},
  context: Omit<LogContext, "route" | "status"> & { status?: number } = {}
) {
  const status = context.status ?? init.status ?? 200;
  logApiRequest(request, {
    ...context,
    route,
    status
  });
  return NextResponse.json(body, { ...init, status });
}

export function withApiGuard(
  handler: ApiHandler,
  options: { route: string; rateLimit?: RateLimitPolicy; requireAuth?: boolean }
): (request: Request, context: unknown) => Promise<Response>;
export function withApiGuard<Context>(
  handler: ContextApiHandler<Context>,
  options: { route: string; rateLimit?: RateLimitPolicy; requireAuth?: boolean }
): (request: Request, context: Context) => Promise<Response>;
export function withApiGuard<Context>(
  handler: ApiHandler | ContextApiHandler<Context>,
  options: { route: string; rateLimit?: RateLimitPolicy; requireAuth?: boolean }
) {
  return async function guardedApiHandler(request: Request, context: Context): Promise<Response> {
    const startTime = Date.now();
    const guard = await guardApiRequest(request, {
      route: options.route,
      requireAuth: options.requireAuth,
      limit: options.rateLimit?.max,
      windowMs: options.rateLimit?.windowMs
    });

    if (!guard.ok) return guard.response;

    try {
      const response = await (handler as ContextApiHandler<Context>)(request, context);
      const guardedResponse = setHeaders(response, guard.headers);
      logApiRequest(request, {
        route: options.route,
        status: guardedResponse.status,
        startTime,
        userLabel: guard.user.id,
        meta: {
          rateLimit: guard.rateLimit?.limit,
          remaining: guard.rateLimit?.remaining
        }
      });
      return guardedResponse;
    } catch (error) {
      const serialized = serializeError(error);
      logApiRequest(request, {
        route: options.route,
        status: 500,
        startTime,
        userLabel: guard.user.id,
        error: serialized.message
      });
      return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500, headers: guard.headers });
    }
  };
}
