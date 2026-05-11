"use client";

import { useState, type FormEvent } from "react";
import type { ParcelFeature, ParcelSearchResult } from "@/types/parcel";

type Props = {
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

export default function ParcelDetails({
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
  onSearchResultClick
}: Props) {
  const [projectName, setProjectName] = useState("Houghton Project");
  const [tag, setTag] = useState("showing");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unable to save parcel");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="side-panel">
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
                onClick={() => onSearchResultClick(result)}
                disabled={!result.center}
              >
                <span className="result-title">{fmt(result.siteAddress) !== "—" ? fmt(result.siteAddress) : fmt(result.parcelId)}</span>
                <span>{fmt(result.ownerName)}</span>
                <span>
                  {fmt(result.apn)} · {fmt(result.acreage)} ac
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel-section">
        <h2>Parcel lookup</h2>
        <p>
          {loading
            ? "Loading visible parcel outlines…"
            : statusMessage}
        </p>
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
                <button className="primary-button" disabled={saving || !projectName.trim()} onClick={saveParcel}>
                  {saving ? "Saving…" : "Save parcel"}
                </button>
              </div>
              {saveMessage ? <p className="message success">{saveMessage}</p> : null}
              {saveError ? <p className="message error">{saveError}</p> : null}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
