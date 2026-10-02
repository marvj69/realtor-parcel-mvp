"use client";

import { useSyncExternalStore } from "react";

/**
 * "side"  – desktop: navigation rail, side panel and map side by side.
 * "sheet" – phones and portrait tablets: the panel is a bottom sheet over the map.
 *
 * Landscape phones are too short for a sheet, so they keep the side layout with compact chrome.
 * The result is exposed as `data-layout` on the workspace, so CSS and JavaScript always agree.
 */
export type LayoutMode = "side" | "sheet";

const SHEET_QUERY = "(max-width: 959px)";
const LANDSCAPE_PHONE_QUERY = "(max-height: 520px) and (orientation: landscape) and (min-width: 560px)";

export function currentLayoutMode(): LayoutMode {
  if (typeof window === "undefined") return "side";
  if (window.matchMedia(LANDSCAPE_PHONE_QUERY).matches) return "side";
  return window.matchMedia(SHEET_QUERY).matches ? "sheet" : "side";
}

function subscribe(onChange: () => void) {
  const lists = [SHEET_QUERY, LANDSCAPE_PHONE_QUERY].map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, currentLayoutMode, () => "side");
}
