import { randomUUID } from "crypto";
import { getClientHash } from "@/lib/rate-limit";

export type RequestLogContext = {
  requestId: string;
  method: string;
  route: string;
  path: string;
  queryKeys: string[];
  queryValueLengths: Record<string, number>;
  clientHash: string;
  userAgent: string | null;
};

export type RequestLogOutcome = {
  status: number;
  durationMs: number;
  rateLimit?: {
    limit: number;
    remaining: number;
    limited: boolean;
  };
  error?: {
    name: string;
    message: string;
  };
};

const SENSITIVE_QUERY_KEYS = new Set(["token", "key", "secret", "password", "database_url", "databaseUrl"]);

function safeUserAgent(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 160);
}

function getQueryValueLengths(url: URL): Record<string, number> {
  const lengths: Record<string, number> = {};

  for (const [key, value] of url.searchParams.entries()) {
    lengths[key] = SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) ? 0 : value.length;
  }

  return lengths;
}

export function createRequestLogContext(request: Request, route: string): RequestLogContext {
  const url = new URL(request.url);
  const requestId = request.headers.get("x-request-id") || request.headers.get("x-vercel-id") || randomUUID();

  return {
    requestId,
    method: request.method,
    route,
    path: url.pathname,
    queryKeys: [...new Set(url.searchParams.keys())].sort(),
    queryValueLengths: getQueryValueLengths(url),
    clientHash: getClientHash(request),
    userAgent: safeUserAgent(request.headers.get("user-agent"))
  };
}

export function serializeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return { name: "Error", message: "Unknown error" };
}

export function logApiRequest(context: RequestLogContext, outcome: RequestLogOutcome) {
  const level = outcome.status >= 500 ? "error" : outcome.status === 429 ? "warn" : "info";

  console[level](
    JSON.stringify({
      event: "api_request",
      at: new Date().toISOString(),
      requestId: context.requestId,
      method: context.method,
      route: context.route,
      path: context.path,
      queryKeys: context.queryKeys,
      queryValueLengths: context.queryValueLengths,
      status: outcome.status,
      durationMs: Math.round(outcome.durationMs),
      clientHash: context.clientHash,
      userAgent: context.userAgent,
      rateLimit: outcome.rateLimit,
      error: outcome.error
    })
  );
}
