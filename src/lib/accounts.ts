import "server-only";

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import {
  createPasswordHash,
  normalizeAccountEmail,
  verifyPasswordHash,
  type AppUser
} from "@/lib/auth";

type AccountUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  password_hash: string | null;
};

export class DuplicateAccountError extends Error {
  status = 409;

  constructor() {
    super("An account with that email already exists");
    this.name = "DuplicateAccountError";
  }
}

function rowToAppUser(row: AccountUserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    authenticated: true,
    authEnabled: true
  };
}

export async function findPasswordAccountByEmail(email: string) {
  const normalizedEmail = normalizeAccountEmail(email);
  if (!normalizedEmail) return null;

  const result = await getPool().query<AccountUserRow>(
    `
    SELECT id, email, display_name, password_hash
    FROM app_users
    WHERE email_normalized = $1 AND password_hash IS NOT NULL
    LIMIT 1
    `,
    [normalizedEmail]
  );

  return result.rows[0] ?? null;
}

export async function verifyPasswordAccount(email: string, password: string) {
  const row = await findPasswordAccountByEmail(email);
  if (!row) return { status: "not_found" as const };

  const passwordMatches = row.password_hash ? await verifyPasswordHash(password, row.password_hash) : false;
  if (!passwordMatches) return { status: "invalid" as const };

  await getPool().query("UPDATE app_users SET last_login_at = now() WHERE id = $1", [row.id]);
  return {
    status: "matched" as const,
    user: rowToAppUser(row)
  };
}

export async function createPasswordAccount(input: {
  email: string;
  displayName?: string | null;
  password: string;
}) {
  const normalizedEmail = normalizeAccountEmail(input.email);
  if (!normalizedEmail) {
    throw new Error("A valid email is required");
  }

  const passwordHash = await createPasswordHash(input.password);
  const id = randomUUID();
  const displayName = input.displayName?.trim() || normalizedEmail;

  try {
    const result = await getPool().query<AccountUserRow>(
      `
      INSERT INTO app_users (
        id,
        email,
        email_normalized,
        display_name,
        auth_provider,
        password_hash,
        last_login_at
      )
      VALUES ($1, $2, $3, $4, 'password', $5, now())
      RETURNING id, email, display_name, password_hash
      `,
      [id, input.email.trim(), normalizedEmail, displayName, passwordHash]
    );

    const user = result.rows[0];
    if (!user) throw new Error("Unable to create account");
    return rowToAppUser(user);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      throw new DuplicateAccountError();
    }
    throw err;
  }
}
