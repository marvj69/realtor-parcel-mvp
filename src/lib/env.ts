export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getDatabaseUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) return null;
  if (value.includes("USER:PASSWORD@HOST.neon.tech/DB")) return null;
  return value;
}

export function hasDatabaseConfig(): boolean {
  return Boolean(getDatabaseUrl());
}

export function getRequiredDatabaseUrl(): string {
  const value = getDatabaseUrl();
  if (!value) {
    throw new Error("Missing DATABASE_URL. Configure Neon/PostGIS for persistent parcel data.");
  }
  return value;
}

export function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getPublicMapConfig() {
  const centerRaw = process.env.NEXT_PUBLIC_DEFAULT_CENTER ?? "-88.5690,47.1211";
  const [lngRaw, latRaw] = centerRaw.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);

  return {
    styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || null,
    center: [Number.isFinite(lng) ? lng : -88.569, Number.isFinite(lat) ? lat : 47.1211] as [number, number],
    zoom: getNumberEnv("NEXT_PUBLIC_DEFAULT_ZOOM", 13)
  };
}
