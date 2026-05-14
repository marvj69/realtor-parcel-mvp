"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import SavedProjectsSidebar from "@/components/SavedProjectsSidebar";
import type { AppPanel, MeasurementMode, MeasurementPoint, MeasurementSummary } from "@/types/measurement";
import type { OfflineAreaSummary } from "@/types/offline";
import type { ParcelFeature, ParcelSearchResult } from "@/types/parcel";

type Props = {
  activePanel: AppPanel;
  onActivePanelChange: (panel: AppPanel) => void;
  parcel: ParcelFeature | null;
  visibleCount: number;
  totalInView: number;
  loading: boolean;
  error: string | null;
  statusMessage: string;
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

function fmt(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function money(value: number | null) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

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

function matchKindLabel(kind: ParcelSearchResult["matchKind"]) {
  switch (kind) {
    case "parcel_id":
      return "Parcel ID";
    case "apn":
      return "APN";
    case "owner_name":
      return "Owner";
    case "site_address":
      return "Site address";
    case "mailing_address":
      return "Mailing address";
    case "land_use":
      return "Land use";
    default:
      return "Match";
  }
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export default function ParcelDetails({
  activePanel,
  onActivePanelChange,
  parcel,
  visibleCount,
  totalInView,
  loading,
  error,
  statusMessage,
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
}: Props) {
  const [projectName, setProjectName] = useState("Houghton Project");
  const [tag, setTag] = useState("showing");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  async function saveParcel() {
    if (!parcel) return;
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const response = await fetch("/api/saved-parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcelDatabaseId: parcel.properties.id,
          projectName,
          tag,
          note
        })
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string; data?: { persisted?: boolean } };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to save parcel");
      }

      setSaveMessage(payload.data?.persisted === false ? "Demo save accepted. Configure DATABASE_URL to persist projects." : "Parcel saved to project.");
      setNote("");
      setProjectRefreshKey((value) => value + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unable to save parcel");
    } finally {
      setSaving(false);
    }
  }

  function activatePanel(panel: AppPanel) {
    onActivePanelChange(panel);
  }

  function selectSearchResult(result: ParcelSearchResult) {
    onSearchResultClick(result);
    activatePanel("details");
  }

  function selectSavedParcel(result: ParcelSearchResult) {
    onSavedParcelClick(result);
    activatePanel("details");
  }

  const isCollapsed = activePanel === "map";

  return (
    <aside className={isCollapsed ? "side-panel collapsed" : "side-panel"} aria-label="Parcel workspace">
      <nav className="bottom-tab-bar" aria-label="Workspace tools">
        {(
          [
            ["map", "Map"],
            ["search", "Search"],
            ["saved", "Saved"],
            ["details", parcel ? "Parcel" : "Details"],
            ["measure", "Measure"],
            ["offline", "Offline"]
          ] as const
        ).map(([panel, label]) => (
          <button
            className={activePanel === panel ? "active" : ""}
            key={panel}
            type="button"
            aria-pressed={activePanel === panel}
            onClick={() => activatePanel(panel)}
          >
            <span>{label}</span>
            {panel === "details" && parcel ? <small>Selected</small> : null}
            {panel === "measure" && measurementPoints.length > 0 ? <small>{measurementPoints.length}</small> : null}
            {panel === "offline" && offlineAreas.length > 0 ? <small>{offlineAreas.length}</small> : null}
          </button>
        ))}
      </nav>

      {!isCollapsed ? (
        <div className="bottom-panel">
          {activePanel === "search" ? (
            <section className="panel-section search-panel">
              <h2>Find a parcel</h2>
              <form className="search-form" onSubmit={onSearchSubmit}>
                <label>
                  Search APN, owner, address, or mailing address
                  <div className="search-row">
                    <input
                      value={searchQuery}
                      onChange={(event) => onSearchQueryChange(event.target.value)}
                      placeholder="e.g. Shelden, 052-217, Lake Superior"
                    />
                    <button className="primary-button" disabled={searchLoading || searchQuery.trim().length < 2}>
                      {searchLoading ? "Searching…" : "Search"}
                    </button>
                  </div>
                </label>
              </form>
              {searchError ? <p className="message subtle">{searchError}</p> : null}
              {searchResults.length > 0 ? (
                <div className="search-results">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      className="search-result"
                      type="button"
                      onClick={() => selectSearchResult(result)}
                      disabled={!result.center}
                    >
                      <span className="result-title">
                        {fmt(result.siteAddress) !== "—" ? fmt(result.siteAddress) : fmt(result.parcelId)}
                      </span>
                      <span>
                        {matchKindLabel(result.matchKind)}: {fmt(result.matchLabel)}
                      </span>
                      <span>{fmt(result.ownerName)}</span>
                      <span>
                        {fmt(result.apn)} · {fmt(result.acreage)} ac
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {activePanel === "saved" ? (
            <SavedProjectsSidebar
              refreshKey={projectRefreshKey}
              activeParcelId={parcel?.properties.id ?? null}
              onProjectNameSelect={(nextProjectName) => {
                setProjectName(nextProjectName);
                activatePanel(parcel ? "details" : "search");
              }}
              onSavedParcelSelect={selectSavedParcel}
            />
          ) : null}

          {activePanel === "details" ? (
            <>
              <section className="panel-section lookup-panel">
                <h2>Parcel lookup</h2>
                <p>{loading ? "Loading visible parcel outlines…" : statusMessage}</p>
                {totalInView > visibleCount ? (
                  <p className="panel-note">{totalInView.toLocaleString()} parcels are in this map view.</p>
                ) : null}
                {error ? <p className="message error">{error}</p> : null}
              </section>

              {!parcel ? (
                <section className="empty-state">
                  <h3>No parcel selected</h3>
                  <p>Zoom in and click a parcel. If nothing appears, run the seed script or import a real county parcel dataset.</p>
                </section>
              ) : (
                <>
                  <section className="panel-section">
                    <h2>{fmt(parcel.properties.siteAddress) !== "—" ? fmt(parcel.properties.siteAddress) : fmt(parcel.properties.parcelId)}</h2>
                    <p>{fmt(parcel.properties.ownerName)}</p>
                    <div className="detail-grid">
                      <div className="detail-row">
                        <span className="detail-label">Parcel ID</span>
                        <span className="detail-value">{fmt(parcel.properties.parcelId)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">APN</span>
                        <span className="detail-value">{fmt(parcel.properties.apn)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Owner</span>
                        <span className="detail-value">{fmt(parcel.properties.ownerName)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Site address</span>
                        <span className="detail-value">{fmt(parcel.properties.siteAddress)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Acreage</span>
                        <span className="detail-value">{fmt(parcel.properties.acreage)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Land use</span>
                        <span className="detail-value">{fmt(parcel.properties.landUse)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Source legal description</span>
                        <span className="detail-value">{parcel.properties.legalDescription?.trim() || "Not available from source"}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Assessed value</span>
                        <span className="detail-value">{money(parcel.properties.assessedValue)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Mailing address</span>
                        <span className="detail-value">{fmt(parcel.properties.mailingAddress)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">County / source</span>
                        <span className="detail-value">
                          {fmt(parcel.properties.provider)} · {fmt(parcel.properties.sourceCounty)}, {fmt(parcel.properties.state)}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Source key</span>
                        <span className="detail-value">{fmt(parcel.properties.sourceKey)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Source updated</span>
                        <span className="detail-value">{date(parcel.properties.sourceUpdatedAt)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Imported</span>
                        <span className="detail-value">{date(parcel.properties.importedAt)}</span>
                      </div>
                    </div>
                    <p className="detail-disclaimer">
                      Parcel boundaries are approximate and for general reference only. They are not a legal survey, title opinion,
                      zoning determination, or substitute for municipal/county verification.
                    </p>
                  </section>

                  <section className="panel-section">
                    <h3>Save to project</h3>
                    <div className="form-stack">
                      <label>
                        Project name
                        <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                      </label>
                      <label>
                        Tag
                        <input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="showing, lead, cma, follow-up" />
                      </label>
                      <label>
                        Note
                        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Private note for this parcel" />
                      </label>
                      <div className="button-row">
                        <button className="primary-button" type="button" disabled={saving || !projectName.trim()} onClick={saveParcel}>
                          {saving ? "Saving…" : "Save parcel"}
                        </button>
                      </div>
                      {saveMessage ? <p className="message success">{saveMessage}</p> : null}
                      {saveError ? <p className="message error">{saveError}</p> : null}
                    </div>
                  </section>
                </>
              )}
            </>
          ) : null}

          {activePanel === "offline" ? (
            <section className="panel-section offline-panel">
              <div className="section-heading-row">
                <div>
                  <h2>Offline areas</h2>
                  <p>Parcel outlines and details are saved in this browser. Basemap imagery may still need a network connection unless the browser has cached those tiles.</p>
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

              {!offlineStorageSupported ? <p className="message error">This browser cannot save offline parcel areas.</p> : null}
              {offlineStatus ? <p className="message success">{offlineStatus}</p> : null}
              {offlineError ? <p className="message error">{offlineError}</p> : null}

              {offlineAreas.length === 0 ? (
                <p className="panel-note">No offline parcel areas saved in this browser yet.</p>
              ) : (
                <div className="offline-area-list">
                  {offlineAreas.map((area) => (
                    <article className={area.id === activeOfflineAreaId ? "offline-area active" : "offline-area"} key={area.id}>
                      <div>
                        <strong>{area.name}</strong>
                        <span>
                          {area.parcelCount.toLocaleString()} parcels · {bytes(area.storageBytes)} · {dateTime(area.downloadedAt)}
                        </span>
                      </div>
                      <div className="button-row">
                        <button className="secondary-button compact-button" type="button" disabled={offlineLoading} onClick={() => onOfflineAreaOpen(area.id)}>
                          View
                        </button>
                        <button className="text-button" type="button" disabled={offlineLoading} onClick={() => onOfflineAreaDelete(area.id)}>
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
                <button className="secondary-button" type="button" onClick={onMeasurementUndo} disabled={measurementPoints.length === 0}>
                  Undo point
                </button>
                <button className="secondary-button" type="button" onClick={onMeasurementClear} disabled={measurementPoints.length === 0}>
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
                      <button className="text-button" type="button" onClick={() => onMeasurementPointRemove(point.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
