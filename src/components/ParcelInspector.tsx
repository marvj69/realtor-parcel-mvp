"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import ParcelOutline from "@/components/ParcelOutline";
import {
  displayMoney,
  displayRecordDate,
  displayValue,
  downloadParcelsCsv,
  PARCEL_DISCLAIMER,
  PARCEL_TAGS,
  parcelTitle,
  safeSourceUrl
} from "@/lib/parcel-presentation";
import type { ParcelFeature } from "@/types/parcel";

type Props = {
  parcel: ParcelFeature;
  draft: { tag: string; note: string };
  onDraftChange: (draft: { tag: string; note: string }) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onSaved: () => void;
  onCompare: () => void;
  compared: boolean;
  onFocus: () => void;
};

export default function ParcelInspector({
  parcel,
  draft,
  onDraftChange,
  projectName,
  onProjectNameChange,
  onSaved,
  onCompare,
  compared,
  onFocus
}: Props) {
  const [printPreview, setPrintPreview] = useState(false);
  const printDialogRef = useRef<HTMLDialogElement>(null);
  const printTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (printPreview) printDialogRef.current?.showModal();
  }, [printPreview]);
  const [tab, setTab] = useState<"overview" | "notes" | "source">("overview");
  const { tag, note } = draft;
  const setTag = (tag: string) => onDraftChange({ ...draft, tag });
  const setNote = (note: string) => onDraftChange({ ...draft, note });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const p = parcel.properties;
  const sourceUrl = safeSourceUrl(p.sourceUrl);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/saved-parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelDatabaseId: p.id, projectName: projectName.trim(), tag, note })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to save parcel.");
      setMessage(
        payload.data?.persisted === false
          ? "Demo preview only. This parcel was not stored."
          : `Saved to ${projectName.trim()}.`
      );
      setNote("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save parcel.");
    } finally {
      setSaving(false);
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(p.parcelId || p.apn || p.id);
      setMessage("Parcel ID copied.");
    } catch {
      setError("Copy unavailable in this browser. Select the parcel ID to copy it.");
    }
  }

  const brief = (
    <article className="print-brief">
      <div className="print-brand">PARCEL / Property brief</div>
      <h1>{parcelTitle(p)}</h1>
      <p>
        Prepared {new Date().toLocaleDateString()} · {p.sourceCounty}, {p.state}
      </p>
      <ParcelOutline parcel={parcel} />
      <dl className="record-list">
        {[
          ["Parcel ID", p.parcelId],
          ["APN", p.apn],
          ["Owner", p.ownerName],
          ["Mailing address", p.mailingAddress],
          ["Recorded acreage", displayValue(p.acreage)],
          ["Land use / class", p.landUse],
          ["Assessed value (not market value)", displayMoney(p.assessedValue)],
          ["Legal description", p.legalDescription],
          ["Provider", p.provider],
          ["Source URL", sourceUrl],
          ["Source updated (UTC)", displayRecordDate(p.sourceUpdatedAt)],
          ["Imported (UTC)", displayRecordDate(p.importedAt)]
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{displayValue(value)}</dd>
          </div>
        ))}
      </dl>
      <p>{PARCEL_DISCLAIMER}</p>
    </article>
  );

  return (
    <>
      <section className="parcel-hero panel-section">
        <div className="eyebrow">
          <span className="status-dot" /> Selected property{" "}
          <span className="county-chip">
            {p.sourceCounty || "County unavailable"}
            {p.state ? `, ${p.state}` : ""}
          </span>
        </div>
        <h2>{parcelTitle(p)}</h2>
        <button className="parcel-id-copy" onClick={copyId} title="Copy parcel ID">
          {p.parcelId || p.apn || "Parcel ID unavailable"}
          <Icon name="copy" size={14} />
        </button>
        <div className="parcel-summary">
          <ParcelOutline parcel={parcel} />
          <div className="hero-facts">
            <span>Recorded acreage</span>
            <strong>
              {p.acreage === null ? "—" : displayValue(p.acreage)}{" "}
              <small>{p.acreage === null ? "unavailable" : "acres"}</small>
            </strong>
            <span>Assessed value</span>
            <b>{displayMoney(p.assessedValue)}</b>
            <small>Assessment, not market value</small>
          </div>
        </div>
        <div className="parcel-actions">
          <button className="primary-button" onClick={() => setTab("notes")}>
            <Icon name="folder" size={17} /> Save property
          </button>
          <button
            className={compared ? "secondary-button selected" : "secondary-button"}
            onClick={onCompare}
            aria-pressed={compared}
          >
            <Icon name={compared ? "check" : "compare"} size={17} />
            {compared ? "Added" : "Compare"}
          </button>
          <button className="icon-button" onClick={onFocus} title="Fit parcel on map" aria-label="Fit parcel on map">
            <Icon name="target" size={18} />
          </button>
        </div>
      </section>
      <div className="inspector-tabs" role="tablist" aria-label="Property information">
        {(
          [
            ["overview", "Overview"],
            ["notes", "Save & notes"],
            ["source", "Source record"]
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            id={`parcel-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`parcel-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              const tabs = ["overview", "notes", "source"] as const;
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next = tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3];
                setTab(next);
                document.getElementById(`parcel-tab-${next}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        className="panel-section"
        role="tabpanel"
        id={`parcel-panel-${tab}`}
        aria-labelledby={`parcel-tab-${tab}`}
      >
        {tab === "overview" ? (
          <>
            <h3 className="section-title">
              <Icon name="home" size={17} /> Property record
            </h3>
            <dl className="record-list">
              {[
                ["Owner of record", p.ownerName],
                ["Site address", p.siteAddress],
                ["Mailing address", p.mailingAddress],
                ["APN", p.apn],
                ["Land use / class", p.landUse]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{displayValue(value)}</dd>
                </div>
              ))}
            </dl>
            <details className="disclosure">
              <summary>
                Source legal description
                <Icon name="chevron" size={16} />
              </summary>
              <p>{p.legalDescription || "Not available from source"}</p>
            </details>
            <div className="export-actions">
              <button className="secondary-button" ref={printTriggerRef} onClick={() => setPrintPreview(true)}>
                <Icon name="print" size={16} /> Print brief
              </button>
              <button className="secondary-button" onClick={() => downloadParcelsCsv([p])}>
                <Icon name="download" size={16} /> Export CSV
              </button>
            </div>
          </>
        ) : null}
        {tab === "notes" ? (
          <>
            <h3>Organize this property</h3>
            <p className="panel-note">
              Save to a client or research project. Unsaved notes stay in this session while you switch tools. Save to
              keep them in your project.
            </p>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label>
                Project name
                <input
                  required
                  maxLength={120}
                  value={projectName}
                  onChange={(e) => onProjectNameChange(e.target.value)}
                  placeholder="e.g. Lakefront buyer search"
                />
              </label>
              <fieldset className="tag-picker">
                <legend>Workflow tag</legend>
                {PARCEL_TAGS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    disabled={saving}
                    aria-pressed={tag === value}
                    className={tag === value ? "tag active" : "tag"}
                    onClick={() => setTag(value)}
                  >
                    {value.replaceAll("-", " ")}
                  </button>
                ))}
              </fieldset>
              <label>
                Private note
                <textarea
                  disabled={saving}
                  maxLength={5000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Showing observations, questions to verify, or next steps…"
                />
              </label>
              <button className="primary-button" disabled={saving || !projectName.trim()}>
                <Icon name="folder" size={17} />
                {saving ? "Saving…" : "Save to project"}
              </button>
            </form>
          </>
        ) : null}
        {tab === "source" ? (
          <>
            <h3 className="section-title">
              <Icon name="shield" size={18} /> Data provenance
            </h3>
            <dl className="record-list">
              {[
                ["Provider", p.provider],
                ["County", p.sourceCounty],
                ["Source updated", displayRecordDate(p.sourceUpdatedAt)],
                ["Imported", displayRecordDate(p.importedAt)],
                ["Source key", p.sourceKey],
                ["Source feature ID", p.sourceFeatureId]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{displayValue(value)}</dd>
                </div>
              ))}
            </dl>
            {sourceUrl ? (
              <a className="secondary-button source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={16} /> Open original data source
              </a>
            ) : (
              <p className="panel-note">No source link available.</p>
            )}
          </>
        ) : null}
        {message ? (
          <p role="status" className="message success">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="message error">
            {error}
          </p>
        ) : null}
      </section>
      <p className="verification-note">
        <Icon name="info" size={17} />
        Verify public-record information with the county or municipality before relying on it for a transaction.
      </p>
      {printPreview
        ? createPortal(
            <dialog
              ref={printDialogRef}
              className="print-dialog"
              aria-label="Property brief preview"
              onCancel={() => setPrintPreview(false)}
            >
              <div className="print-toolbar">
                <strong>Property brief preview</strong>
                <div className="button-row">
                  <button className="primary-button" onClick={() => window.print()}>
                    <Icon name="print" size={16} />
                    Print / Save PDF
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Close property brief preview"
                    onClick={() => setPrintPreview(false)}
                  >
                    <Icon name="close" size={19} />
                  </button>
                </div>
              </div>
              {brief}
            </dialog>,
            document.body
          )
        : brief}
    </>
  );
}
