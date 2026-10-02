/**
 * Parcel colors for the map and its legend. One place, so a restyle never leaves the legend behind.
 * Topographic maps are light and busy, so outlines are a deep slate-teal; over imagery they are white
 * with a dark casing. The selected parcel is always warm orange.
 */
export const MAP_THEME = {
  streets: {
    line: "#1f5f7a",
    fill: "#1f5f7a",
    hover: "#0a3347",
    selected: "#ea580c",
    selectedFill: "#f97316",
    casing: "#ffffff"
  },
  satellite: {
    line: "#ffffff",
    fill: "#ffffff",
    hover: "#ffd166",
    selected: "#ff8a00",
    selectedFill: "#ff8a00",
    casing: "#06140e"
  },
  offline: { line: "#17694f", fill: "#2b8a67" },
  measure: { line: "#0f766e", fill: "#14b8a6" }
} as const;

export type MapThemeMode = "streets" | "satellite";
