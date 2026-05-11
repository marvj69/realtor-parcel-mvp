import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { getDatabaseConnectionString, loadEnv } from "./load-env";

loadEnv();

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: tsx scripts/apply-schema.ts <sql-file>");
  process.exit(1);
}

const connectionString = getDatabaseConnectionString();
if (!connectionString) {
  console.error("Missing DATABASE_URL or DATABASE_DIRECT_URL. Set a Neon/PostGIS connection string before running database scripts.");
  process.exit(1);
}

const databaseUrl = connectionString;
const sqlPath = path.resolve(process.cwd(), fileArg);
const sql = fs.readFileSync(sqlPath, "utf8");

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    await client.query(sql);
    console.log(`Applied SQL file: ${fileArg}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
