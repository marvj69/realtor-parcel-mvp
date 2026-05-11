import { config } from "dotenv";

export function loadEnv() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
}

export function getDatabaseConnectionString(): string | null {
  const value = process.env.DATABASE_DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!value) return null;
  if (value.includes("USER:PASSWORD@HOST.neon.tech/DB")) return null;
  return value;
}
