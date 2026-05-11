import { createHash } from "crypto";

export type RateLimitPolicy = {
  max: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  clientHash: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitStore = {
  entries: Map<string, RateLimitEntry>;
  lastPrunedAt: number;
};

declare global {
  var parcelMvpRateLimitStore: RateLimitStore | undefined;
}

const MAX_TRACKED_KEYS = 10_000;
const PRUNE_INTERVAL_MS = 60_000;

function getStore(): RateLimitStore {
  if (!globalThis.parcelMvpRateLimitStore) {
    globalThis.parcelMvpRateLimitStore = {
      entries: new Map<string, RateLimitEntry>(),
      lastPrunedAt: 0
    };
  }

  return globalThis.parcelMvpRateLimitStore;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function getClientHash(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const vercelIp = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) ?? "unknown-agent";
  const address = forwardedFor || vercelIp || realIp || "unknown-ip";

  return hashValue(`${address}:${userAgent}`);
}

function pruneExpiredEntries(store: RateLimitStore, now: number) {
  if (now - store.lastPrunedAt < PRUNE_INTERVAL_MS && store.entries.size < MAX_TRACKED_KEYS) return;

  for (const [key, entry] of store.entries) {
    if (entry.resetAt <= now || store.entries.size > MAX_TRACKED_KEYS) {
      store.entries.delete(key);
    }
  }

  store.lastPrunedAt = now;
}

export function checkRateLimit(request: Request, routeKey: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();
  const max = Math.max(1, Math.floor(policy.max));
  const windowMs = Math.max(1_000, Math.floor(policy.windowMs));
  const store = getStore();

  pruneExpiredEntries(store, now);

  const clientHash = getClientHash(request);
  const key = `${routeKey}:${clientHash}`;
  const current = store.entries.get(key);
  const entry = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };

  entry.count += 1;
  store.entries.set(key, entry);

  const allowed = entry.count <= max;
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  return {
    allowed,
    limit: max,
    remaining: Math.max(0, max - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds,
    clientHash
  };
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString()
  };
}
