// Per-browser conveniences (map settings, recent parcels, last project). Storage can be
// unavailable or cleared at any time, so every read falls back and every write is best effort.
export const STORAGE_KEYS = {
  mapPrefs: "parcel.mapPrefs.v1",
  recentParcels: "parcel.recentParcels.v1",
  lastProject: "parcel.lastProject.v1"
} as const;

export function readStored<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or full storage: keep working without persistence.
  }
}
