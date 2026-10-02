"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import SavedProjectsSidebar from "@/components/SavedProjectsSidebar";
import ParcelInspector from "@/components/ParcelInspector";
import ParcelExplorer from "@/components/ParcelExplorer";
import ParcelCompare from "@/components/ParcelCompare";
import Icon from "@/components/Icon";
import { readStored, STORAGE_KEYS, writeStored } from "@/lib/browser-prefs";
import { useLayoutMode } from "@/lib/layout-mode";
import {
  DEFAULT_SHEET_STATE,
  nextSheetState,
  sheetHeights,
  snapSheet,
  type SheetState
} from "@/lib/sheet";
import type { SavedProjectsState } from "@/lib/saved-work-client";
import type { AppPanel, MeasurementMode, MeasurementPoint, MeasurementSummary } from "@/types/measurement";
import type { OfflineAreaSummary } from "@/types/offline";
import type { ParcelFeature, ParcelProperties, ParcelSearchResult, SavedParcelSummary } from "@/types/parcel";

const DEFAULT_PROJECT_NAME = "My property research";
const isString = (value: unknown): value is string => typeof value === "string";

const PANEL_TITLES: Record<AppPanel, string> = {
  map: "Map",
  search: "Explore",
  details: "Property",
  saved: "Projects",
  compare: "Compare",
  measure: "Measure",
  offline: "Offline areas"
};

type Props = {
  saved: SavedProjectsState;
  recentParcels: ParcelProperties[];
  compareParcels: ParcelFeature[];
  onRecentSelect: (parcel: ParcelProperties) => void;
  onRecentClear: () => void;
  onCompareSelect: (parcel: ParcelFeature) => void;
  onCompareToggle: (parcel: ParcelFeature) => void;
  onCompareRemove: (id: string) => void;
  onFocusParcel: () => void;
  onMarketSelect: (center: [number, number]) => void;
  activePanel: AppPanel;
  onActivePanelChange: (panel: AppPanel) => void;
  parcel: ParcelFeature | null;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  searchResults: ParcelSearchResult[];
  searchLoading: boolean;
  searchError: string | null;
  onSearchResultClick: (result: ParcelSearchResult) => void;
  onVisibleResultsChange: (results: ParcelSearchResult[]) => void;
  onFitResults: () => void;
  onSavedParcelClick: (savedParcel: SavedParcelSummary) => void;
  measurementMode: MeasurementMode;
  measurementPoints: MeasurementPoint[];
  measurementSummary: MeasurementSummary;
  onMeasurementModeChange: (mode: MeasurementMode) => void;
  onMeasurementPointRemove: (pointId: string) => void;
  onMeasurementUndo: () => void;
  onMeasurementClear: () => void;
  offlineAreas: OfflineAreaSummary[];
  offlineStorageSupported: boolean;
  offlineLoading: boolean;
  offlineStatus: string | null;
  offlineError: string | null;
  activeOfflineAreaId: string | null;
  offlineMeasuredAreaAvailable: boolean;
  onOfflineCurrentViewDownload: () => void;
  onOfflineMeasuredAreaDownload: () => void;
  onOfflineAreaOpen: (areaId: string) => void;
  onOfflineAreaDelete: (areaId: string) => void;
};
function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function bytes(value: number | null | undefined) {
  if (!value || value <= 0) return "—";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024)).toLocaleString()} KB`;
  return `${(value / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

type DragState = {
  startY: number;
  startHeight: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
};

export default function ParcelDetails(props: Props) {
  const {
    activePanel,
    onActivePanelChange,
    parcel,
    searchQuery,
    onSearchQueryChange,
    onSearchSubmit,
    searchResults,
    searchLoading,
    searchError,
    onSearchResultClick,
    onSavedParcelClick,
    measurementMode,
    measurementPoints,
    measurementSummary,
    onMeasurementModeChange,
    onMeasurementPointRemove,
    onMeasurementUndo,
    onMeasurementClear,
    offlineAreas,
    offlineStorageSupported,
    offlineLoading,
    offlineStatus,
    offlineError,
    activeOfflineAreaId,
    offlineMeasuredAreaAvailable,
    onOfflineCurrentViewDownload,
    onOfflineMeasuredAreaDownload,
    onOfflineAreaOpen,
    onOfflineAreaDelete
  } = props;
  const [parcelDrafts, setParcelDrafts] = useState<Record<string, { tag: string; note: string }>>({});
  // The last project used is the one-click save target, remembered in this browser. A remembered
  // name that no longer exists (renamed or deleted elsewhere) falls back to the newest project.
  const [chosenProject, setChosenProject] = useState<{ name: string; fromStorage: boolean } | null>(() => {
    const name = readStored<string | null>(STORAGE_KEYS.lastProject, null, isString);
    return name ? { name, fromStorage: true } : null;
  });
  const { projects } = props.saved;
  const staleChoice =
    chosenProject?.fromStorage && !props.saved.loading && !projects.some((project) => project.name === chosenProject.name);
  const projectName = (!staleChoice && chosenProject?.name) || projects[0]?.name || DEFAULT_PROJECT_NAME;
  const rememberProject = (name: string) => {
    setChosenProject({ name, fromStorage: false });
    writeStored(STORAGE_KEYS.lastProject, name);
  };
  const setProjectName = (name: string) => {
    if (projects.some((project) => project.name === name)) rememberProject(name);
    else setChosenProject({ name, fromStorage: false });
  };
  const latestSearchSubmitRef = useRef(onSearchSubmit);
  useEffect(() => {
    latestSearchSubmitRef.current = onSearchSubmit;
  }, [onSearchSubmit]);
  useEffect(() => {
    if (searchQuery.trim().length < 3) return;
    const timeout = setTimeout(() => {
      void latestSearchSubmitRef.current();
    }, 320);
    return () => clearTimeout(timeout);
  }, [searchQuery]);
  const isCollapsed = activePanel === "map";

  // ---------- Bottom sheet (phones and portrait tablets) ----------
  const isSheet = useLayoutMode() === "sheet";
  const asideRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [areaHeight, setAreaHeight] = useState(0);
  const [dragging, setDragging] = useState(false);
  // A person's chosen size only applies to the panel they chose it on; a new panel opens at its own default.
  const [choice, setChoice] = useState<{ panel: AppPanel; state: SheetState } | null>(null);
  const sheetState: SheetState =
    choice && choice.panel === activePanel ? choice.state : DEFAULT_SHEET_STATE[activePanel];
  const heights = sheetHeights(activePanel, areaHeight);
  const targetPx = isCollapsed ? 0 : heights[sheetState];

  useEffect(() => {
    if (!isSheet) return;
    const wrap = asideRef.current?.parentElement?.querySelector<HTMLElement>(".map-wrap");
    if (!wrap) return;
    const update = () => setAreaHeight(wrap.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [isSheet]);

  /** Applies a height straight to the DOM so dragging never re-renders the panels. */
  const applyHeight = useCallback((px: number) => {
    const aside = asideRef.current;
    if (!aside) return;
    aside.style.setProperty("--sheet-px", `${Math.round(px)}px`);
    aside.parentElement?.style.setProperty("--sheet-covered", `${Math.round(px)}px`);
  }, []);

  useLayoutEffect(() => {
    if (isSheet) applyHeight(targetPx);
    else asideRef.current?.parentElement?.style.setProperty("--sheet-covered", "0px");
  }, [isSheet, targetPx, applyHeight]);

  const chooseState = (state: SheetState) => setChoice({ panel: activePanel, state });

  function onHeadPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isSheet || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const aside = asideRef.current;
    if (!aside) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      startHeight: aside.getBoundingClientRect().height,
      lastY: event.clientY,
      lastTime: performance.now(),
      velocity: 0,
      moved: false
    };
    setDragging(true);
  }

  function onHeadPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientY - drag.startY;
    if (Math.abs(delta) > 4) drag.moved = true;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastTime);
    drag.velocity = 0.7 * drag.velocity + 0.3 * ((event.clientY - drag.lastY) / elapsed);
    drag.lastY = event.clientY;
    drag.lastTime = now;
    if (drag.moved) {
      applyHeight(Math.min(heights.full, Math.max(heights.peek - 90, drag.startHeight - delta)));
    }
  }

  function endHeadDrag(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved || cancelled) {
      applyHeight(targetPx);
      if (!cancelled) chooseState(nextSheetState(sheetState));
      return;
    }
    const current = asideRef.current?.getBoundingClientRect().height ?? targetPx;
    const { state, close } = snapSheet(heights, current, drag.velocity);
    if (close) {
      onActivePanelChange("map");
      return;
    }
    applyHeight(heights[state]);
    chooseState(state);
  }

  // Raise the sheet when a text field gets focus (so the keyboard doesn't cover it) or when
  // keyboard navigation reaches content hidden below the peek.
  function onPanelFocus(event: FocusEvent<HTMLElement>) {
    if (!isSheet || (event.target as HTMLElement).closest(".panel-head")) return;
    const target = event.target as HTMLElement;
    if ((target.tagName === "INPUT" || target.tagName === "TEXTAREA") && sheetState !== "full") chooseState("full");
    else if (sheetState === "peek" && target.matches(":focus-visible")) chooseState("half");
  }

  return (
    <aside
      ref={asideRef}
      className={`side-panel${isCollapsed ? " collapsed" : ""}${dragging ? " dragging" : ""}`}
      aria-label="Parcel workspace"
      data-panel={activePanel}
      data-state={isSheet ? sheetState : undefined}
      onFocusCapture={onPanelFocus}
    >
      {!isCollapsed ? (
        <>
          <div
            className="panel-head"
            onPointerDown={onHeadPointerDown}
            onPointerMove={onHeadPointerMove}
            onPointerUp={(event) => endHeadDrag(event)}
            onPointerCancel={(event) => endHeadDrag(event, true)}
          >
            <span className="sheet-grabber" aria-hidden="true" />
            <h2 className="panel-title">{PANEL_TITLES[activePanel]}</h2>
            <button
              className="icon-button sheet-toggle"
              aria-label={sheetState === "full" ? "Reduce workspace panel" : "Expand workspace panel"}
              aria-expanded={sheetState === "full"}
              onClick={() => chooseState(sheetState === "full" ? "half" : "full")}
            >
              <Icon name={sheetState === "full" ? "chevronDown" : "chevronUp"} size={20} />
            </button>
            <button
              className="icon-button"
              aria-label="Collapse workspace panel"
              onClick={() => onActivePanelChange("map")}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="panel-body" key={activePanel}>
            {activePanel === "search" ? (
              <ParcelExplorer
                query={searchQuery}
                onQueryChange={onSearchQueryChange}
                onSubmit={onSearchSubmit}
                results={searchResults}
                loading={searchLoading}
                error={searchError}
                onSelect={onSearchResultClick}
                recent={props.recentParcels}
                onRecentSelect={props.onRecentSelect}
                onRecentClear={props.onRecentClear}
                onMarketSelect={props.onMarketSelect}
                onVisibleResultsChange={props.onVisibleResultsChange}
                onFitResults={props.onFitResults}
              />
            ) : null}
            {activePanel === "saved" ? (
              <SavedProjectsSidebar
                saved={props.saved}
                nextSaveProject={projectName}
                onProjectRenamed={(from, to) => {
                  if (from === projectName) rememberProject(to);
                }}
                onProjectDeleted={(name) => {
                  if (name === projectName) {
                    setChosenProject(null);
                    writeStored(STORAGE_KEYS.lastProject, null);
                  }
                }}
                activeParcelId={parcel?.properties.id ?? null}
                onProjectNameSelect={(name) => {
                  setProjectName(name);
                  onActivePanelChange(parcel ? "details" : "search");
                }}
                onSavedParcelSelect={onSavedParcelClick}
              />
            ) : null}
            {activePanel === "details" ? (
              parcel ? (
                <ParcelInspector
                  key={parcel.properties.id}
                  parcel={parcel}
                  draft={parcelDrafts[parcel.properties.id]}
                  onDraftChange={(draft) => setParcelDrafts((items) => ({ ...items, [parcel.properties.id]: draft }))}
                  projectName={projectName}
                  onProjectNameChange={setProjectName}
                  onProjectSaved={rememberProject}
                  saved={props.saved}
                  onCompare={() => props.onCompareToggle(parcel)}
                  compared={props.compareParcels.some((p) => p.properties.id === parcel.properties.id)}
                  onFocus={props.onFocusParcel}
                />
              ) : (
                <div className="empty-state">
                  <Icon name="pin" size={28} />
                  <h3>Select a property</h3>
                  <p>Tap an outlined parcel on the map, or search by address, owner, or parcel ID.</p>
                  <button className="primary-button" onClick={() => onActivePanelChange("search")}>
                    Find a parcel
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
              )
            ) : null}
            {activePanel === "compare" ? (
              <ParcelCompare
                parcels={props.compareParcels}
                onRemove={props.onCompareRemove}
                onSelect={props.onCompareSelect}
                onExplore={() => onActivePanelChange("search")}
              />
            ) : null}
            {activePanel === "offline" ? (
              <section className="panel-section offline-panel">
                <p className="panel-lead">
                  Parcel outlines and details are saved in this browser. Basemap imagery may still need a network
                  connection unless the browser has cached those tiles.
                </p>

                <div className="button-stack">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={offlineLoading || !offlineStorageSupported}
                    onClick={onOfflineCurrentViewDownload}
                  >
                    <Icon name="download" size={17} />
                    {offlineLoading ? "Saving…" : "Download current view"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={offlineLoading || !offlineStorageSupported || !offlineMeasuredAreaAvailable}
                    onClick={onOfflineMeasuredAreaDownload}
                  >
                    <Icon name="ruler" size={17} />
                    Download measured area
                  </button>
                </div>

                {!offlineStorageSupported ? (
                  <p className="message error">This browser cannot save offline parcel areas.</p>
                ) : null}
                {offlineStatus ? <p className="message success">{offlineStatus}</p> : null}
                {offlineError ? <p className="message error">{offlineError}</p> : null}

                <h3 className="section-title">Saved areas</h3>
                {offlineAreas.length === 0 ? (
                  <div className="empty-state compact">
                    <Icon name="offline" size={26} />
                    <p>No offline parcel areas saved in this browser yet.</p>
                  </div>
                ) : (
                  <div className="offline-area-list">
                    {offlineAreas.map((area) => (
                      <article
                        className={area.id === activeOfflineAreaId ? "offline-area active" : "offline-area"}
                        key={area.id}
                      >
                        <div>
                          <strong>{area.name}</strong>
                          <span>
                            {area.parcelCount.toLocaleString()} parcels · {bytes(area.storageBytes)} ·{" "}
                            {dateTime(area.downloadedAt)}
                          </span>
                        </div>
                        <div className="button-row">
                          <button
                            className="secondary-button compact-button"
                            type="button"
                            disabled={offlineLoading}
                            onClick={() => onOfflineAreaOpen(area.id)}
                          >
                            View on map
                          </button>
                          <button
                            className="text-button danger-text"
                            type="button"
                            disabled={offlineLoading}
                            onClick={() => onOfflineAreaDelete(area.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {activePanel === "measure" ? (
              <section className="panel-section measure-panel">
                <div className="measurement-readout">
                  <span>{measurementSummary.title}</span>
                  <strong>{measurementSummary.primary}</strong>
                  <small>{measurementSummary.secondary}</small>
                </div>

                <div className="segmented measure-modes" role="group" aria-label="Measurement type">
                  {(
                    [
                      ["distance", "Distance"],
                      ["area", "Area"],
                      ["rectangle", "Box"]
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      className={measurementMode === mode ? "active" : ""}
                      key={mode}
                      type="button"
                      aria-pressed={measurementMode === mode}
                      onClick={() => onMeasurementModeChange(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="button-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onMeasurementUndo}
                    disabled={measurementPoints.length === 0}
                  >
                    <Icon name="undo" size={16} />
                    Undo point
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onMeasurementClear}
                    disabled={measurementPoints.length === 0}
                  >
                    Clear
                  </button>
                </div>

                <p className="panel-note">{measurementSummary.hint}</p>

                {measurementPoints.length > 0 ? (
                  <div className="measurement-point-list">
                    {measurementPoints.map((point, index) => (
                      <div className="measurement-point-row" key={point.id}>
                        <span>
                          Point {index + 1}
                          <small className="mono">
                            {formatCoordinate(point.lat)}, {formatCoordinate(point.lng)}
                          </small>
                        </span>
                        <button
                          className="text-button danger-text"
                          type="button"
                          onClick={() => onMeasurementPointRemove(point.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}
