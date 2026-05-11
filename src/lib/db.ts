import { Pool, type QueryResultRow } from "pg";
import { getRequiredDatabaseUrl } from "@/lib/env";

declare global {
  var parcelMvpPool: Pool | undefined;
}

export function getPool() {
  if (globalThis.parcelMvpPool) return globalThis.parcelMvpPool;

  const connectionString = getRequiredDatabaseUrl();
  const pool = new Pool({
    connectionString,
    max: 5,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
  });

  globalThis.parcelMvpPool = pool;
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}
