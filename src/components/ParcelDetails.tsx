"use client";

import { useState } from "react";
import type { ParcelFeature } from "@/types/parcel";

type Props = {
  parcel: ParcelFeature | null;
  visibleCount: number;
  loading: boolean;
  error: string | null;
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

export default function ParcelDetails({ parcel, visibleCount, loading, error }: Props) {
  const [projectName, setProjectName] = useState("Demo Project");
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
      <section className="panel-section">
        <h2>Parcel lookup</h2>
        <p>
          {loading
            ? "Loading visible parcel outlines…"
            : `${visibleCount.toLocaleString()} parcel outline${visibleCount === 1 ? "" : "s"} loaded in the current view.`}
        </p>
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
            <h2>{fmt(parcel.properties.siteAddress)}</h2>
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
                <span className="detail-label">Source</span>
                <span className="detail-value">
                  {fmt(parcel.properties.provider)} · {fmt(parcel.properties.sourceCounty)}, {fmt(parcel.properties.state)}
                </span>
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
