import "server-only";

import type { Pool, PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { normalizeAccountEmail, type AppUser } from "@/lib/auth";

type Queryable = Pick<Pool | PoolClient, "query">;

export async function ensureAppUser(user: Pick<AppUser, "id" | "email" | "displayName">, client?: Queryable) {
  const db = client ?? getPool();

  await db.query(
    `
    INSERT INTO app_users (id, email, email_normalized, display_name, auth_provider)
    VALUES ($1, $2, $3, $4, 'private_env')
    ON CONFLICT (id)
    DO UPDATE SET
      email = COALESCE(EXCLUDED.email, app_users.email),
      email_normalized = COALESCE(EXCLUDED.email_normalized, app_users.email_normalized),
      display_name = COALESCE(EXCLUDED.display_name, app_users.display_name),
      updated_at = now()
    `,
    [user.id, user.email, normalizeAccountEmail(user.email), user.displayName]
  );
}
