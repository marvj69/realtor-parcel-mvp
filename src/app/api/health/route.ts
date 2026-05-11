import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hasDatabaseConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  if (!hasDatabaseConfig()) {
    return NextResponse.json({
      ok: true,
      data: {
        mode: "demo",
        now: new Date().toISOString(),
        postgis_version: null,
        warning: "DATABASE_URL is not configured; server-side demo parcel data is active."
      }
    });
  }

  try {
    const [row] = await query<{ now: string; postgis_version: string }>(
      "SELECT now()::text AS now, PostGIS_Version() AS postgis_version"
    );
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Database health check failed" },
      { status: 500 }
    );
  }
}
