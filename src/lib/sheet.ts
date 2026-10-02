import type { AppPanel } from "@/types/measurement";

/**
 * Bottom-sheet geometry for phones and portrait tablets.
 *
 * peek – just the header and the first thing a person needs (search box, property summary, live
 *        measurement), so the map stays the main surface.
 * half – a working height with the map still visible above.
 * full – the whole map area, for long lists and forms.
 */
export type SheetState = "peek" | "half" | "full";

export const SHEET_STATES: readonly SheetState[] = ["peek", "half", "full"];

export const DEFAULT_SHEET_STATE: Record<AppPanel, SheetState> = {
  map: "peek",
  search: "half",
  details: "peek",
  saved: "half",
  compare: "half",
  measure: "peek",
  offline: "half"
};

const PEEK_PX: Record<AppPanel, number> = {
  map: 0,
  search: 124,
  details: 262,
  saved: 124,
  compare: 150,
  measure: 232,
  offline: 124
};

const HALF_RATIO = 0.58;
const MAX_FLICK_VELOCITY = 3;
/** A peek never takes more than this share of the map, so very short screens keep a usable map. */
const MAX_PEEK_RATIO = 0.52;

export function sheetHeights(panel: AppPanel, areaHeight: number): Record<SheetState, number> {
  const area = Math.max(0, Math.round(areaHeight));
  const peek = Math.min(PEEK_PX[panel], Math.round(area * MAX_PEEK_RATIO));
  const half = Math.max(peek, Math.round(area * HALF_RATIO));
  return { peek, half, full: area };
}

/** Snap to the nearest height after projecting the release velocity (px/ms, positive = downward). */
export function snapSheet(
  heights: Record<SheetState, number>,
  currentHeight: number,
  velocityDown: number
): { state: SheetState; close: boolean } {
  // A very fast flick is about 3 px/ms; clamp so a glitchy sample cannot throw the sheet across the screen.
  const velocity = Math.max(-MAX_FLICK_VELOCITY, Math.min(MAX_FLICK_VELOCITY, velocityDown));
  const projected = currentHeight - velocity * 160;
  let best: SheetState = "peek";
  let bestDistance = Infinity;
  for (const state of SHEET_STATES) {
    const distance = Math.abs(heights[state] - projected);
    if (distance < bestDistance) {
      best = state;
      bestDistance = distance;
    }
  }
  return { state: best, close: projected < heights.peek - 56 };
}

export function nextSheetState(state: SheetState): SheetState {
  return SHEET_STATES[(SHEET_STATES.indexOf(state) + 1) % SHEET_STATES.length];
}
