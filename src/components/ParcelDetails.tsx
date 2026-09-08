"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import SavedProjectsSidebar from "@/components/SavedProjectsSidebar";
import ParcelInspector from "@/components/ParcelInspector";
import ParcelExplorer from "@/components/ParcelExplorer";
import ParcelCompare from "@/components/ParcelCompare";
import Icon from "@/components/Icon";
import type { AppPanel, MeasurementMode, MeasurementPoint, MeasurementSummary } from "@/types/measurement";
import type { OfflineAreaSummary } from "@/types/offline";
import type { ParcelFeature, ParcelSearchResult } from "@/types/parcel";

type Props = {
  recentParcels: ParcelFeature[];
  compareParcels: ParcelFeature[];
  onRecentSelect: (parcel: ParcelFeature) => void;
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
  onSavedParcelClick: (result: ParcelSearchResult) => void;
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
  const [expanded, setExpanded] = useState(false);
  const [projectName, setProjectName] = useState("My property research");
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
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
  return (
    <aside
      className={`side-panel ${isCollapsed ? "collapsed" : ""} ${expanded ? "expanded" : ""}`}
      aria-label="Parcel workspace"
    >
      {!isCollapsed ? (
        <>
          <div className="panel-topline">
            <span>
              <Icon name="layers" size={15} />
              WORKSPACE <span>/</span>{" "}
              {activePanel === "search"
                ? "Explore"
                : activePanel === "details"
                ? "Property"
                : activePanel === "saved"
                ? "Projects"
                : activePanel === "compare"
                ? "Compare"
                : activePanel === "offline"
                ? "Offline areas"
                : "Measure"}
            </span>
            <button
              className="icon-button panel-expand"
              aria-label={expanded ? "Reduce workspace panel" : "Expand workspace panel"}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <Icon name="expand" size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Collapse workspace panel"
              onClick={() => onActivePanelChange("map")}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="bottom-panel" key={activePanel}>
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
                onMarketSelect={props.onMarketSelect}
              />
            ) : null}
            {activePanel === "saved" ? (
              <SavedProjectsSidebar
                refreshKey={projectRefreshKey}
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
                  draft={parcelDrafts[parcel.properties.id] || { tag: "lead", note: "" }}
                  onDraftChange={(draft) => setParcelDrafts((items) => ({ ...items, [parcel.properties.id]: draft }))}
                  projectName={projectName}
                  onProjectNameChange={setProjectName}
                  onSaved={() => setProjectRefreshKey((key) => key + 1)}
                  onCompare={() => props.onCompareToggle(parcel)}
                  compared={props.compareParcels.some((p) => p.properties.id === parcel.properties.id)}
                  onFocus={props.onFocusParcel}
                />
              ) : (
                <div className="empty-state">
                  <Icon name="pin" size={36} />
                  <h2>Select a property</h2>
                  <p>Click an outlined parcel on the map or search by address, owner, or parcel ID.</p>
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
                onSelect={props.onRecentSelect}
                onExplore={() => onActivePanelChange("search")}
              />
            ) : null}
            {activePanel === "offline" ? (
              <section className="panel-section offline-panel">
                <div className="section-heading-row">
                  <div>
                    <h2>Offline areas</h2>
                    <p>
                      Parcel outlines and details are saved in this browser. Basemap imagery may still need a network
                      connection unless the browser has cached those tiles.
                    </p>
                  </div>
                </div>

                <div className="button-row">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={offlineLoading || !offlineStorageSupported}
                    onClick={onOfflineCurrentViewDownload}
                  >
                    {offlineLoading ? "Saving..." : "Download current view"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={offlineLoading || !offlineStorageSupported || !offlineMeasuredAreaAvailable}
                    onClick={onOfflineMeasuredAreaDownload}
                  >
                    Download measured area
                  </button>
                </div>

                {!offlineStorageSupported ? (
                  <p className="message error">This browser cannot save offline parcel areas.</p>
                ) : null}
                {offlineStatus ? <p className="message success">{offlineStatus}</p> : null}
                {offlineError ? <p className="message error">{offlineError}</p> : null}

                {offlineAreas.length === 0 ? (
                  <p className="panel-note">No offline parcel areas saved in this browser yet.</p>
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
                            View
                          </button>
                          <button
                            className="text-button"
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
                <div className="section-heading-row">
                  <div>
                    <h2>Measure</h2>
                    <p>Tap the map to add points. Use the point list to remove individual points.</p>
                  </div>
                </div>

                <div className="measure-mode-row" role="group" aria-label="Measurement type">
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

                <div className="measurement-readout">
                  <span>{measurementSummary.title}</span>
                  <strong>{measurementSummary.primary}</strong>
                  <small>{measurementSummary.secondary}</small>
                  <p>{measurementSummary.hint}</p>
                </div>

                <div className="button-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onMeasurementUndo}
                    disabled={measurementPoints.length === 0}
                  >
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

                {measurementPoints.length > 0 ? (
                  <div className="measurement-point-list">
                    {measurementPoints.map((point, index) => (
                      <div className="measurement-point-row" key={point.id}>
                        <span>
                          Point {index + 1}
                          <small>
                            {formatCoordinate(point.lat)}, {formatCoordinate(point.lng)}
                          </small>
                        </span>
                        <button
                          className="text-button"
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
