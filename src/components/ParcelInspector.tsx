"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BrandMark from "@/components/Brand";
import Icon from "@/components/Icon";
import ParcelOutline from "@/components/ParcelOutline";
import ParcelMeasurements from "@/components/ParcelMeasurements";
import { ConfirmAction, EditableNote, TagDot, TagSelect } from "@/components/SavedWorkControls";
import { measureParcel } from "@/lib/parcel-measurements";
import {
  displayMoney,
  displayRecordDate,
  displayValue,
  downloadParcelsCsv,
  formatAddress,
  ownerMailingHint,
  PARCEL_DISCLAIMER,
  PARCEL_TAGS,
  parcelTitle,
  safeSourceUrl,
  tagLabel
} from "@/lib/parcel-presentation";
import { savedEntriesFor, savedWork, type SavedEntry, type SavedProjectsState } from "@/lib/saved-work-client";
import type { ParcelFeature } from "@/types/parcel";

type Draft = { tag: string; note: string };

type Props = {
  parcel: ParcelFeature;
  draft: Draft | undefined;
  onDraftChange: (draft: Draft) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onProjectSaved: (name: string) => void;
  saved: SavedProjectsState;
  onCompare: () => void;
  compared: boolean;
  onFocus: () => void;
};

const MAILING_HINT_NOTE =
  "Hint only, based on the recorded mailing address. Owners use other mailing addresses for many reasons — verify before relying on it.";

function SaveMenu({
  projectNames,
  savedProjectNames,
  saving,
  onSave,
  onClose
}: {
  projectNames: string[];
  savedProjectNames: Set<string>;
  saving: boolean;
  onSave: (projectName: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [newName, setNewName] = useState("");
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [onClose]);
  return (
    <>
      <div className="menu-backdrop" aria-hidden="true" />
      <div
        ref={ref}
        className="save-menu popover"
        role="dialog"
        aria-label="Save to a project"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <strong>Save to project</strong>
        {projectNames.length ? (
          <div className="save-menu-list">
            {projectNames.map((name) => (
              <button key={name} type="button" disabled={saving} onClick={() => onSave(name)}>
                <Icon name={savedProjectNames.has(name) ? "check" : "folder"} size={16} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="save-menu-new"
          onSubmit={(event) => {
            event.preventDefault();
            if (newName.trim()) onSave(newName.trim());
          }}
        >
          <label htmlFor="save-menu-new-project">New project</label>
          <div>
            <input
              id="save-menu-new-project"
              value={newName}
              maxLength={120}
              autoFocus={!projectNames.length}
              placeholder="e.g. Lakefront buyer search"
              onChange={(event) => setNewName(event.target.value)}
            />
            <button className="primary-button compact-button" disabled={saving || !newName.trim()}>
              Create
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function SavedActivity({ entries, onChanged }: { entries: SavedEntry[]; onChanged: () => void }) {
  if (!entries.length) return null;
  return (
    <div className="saved-activity">
      <h3 className="section-title">Saved in {entries.length === 1 ? "1 project" : `${entries.length} projects`}</h3>
      {entries.map(({ project, saved }) => (
        <article key={saved.id} className="saved-entry">
          <div className="saved-entry-head">
            <strong>
              <Icon name="folder" size={16} />
              {project.name}
            </strong>
            <TagSelect key={saved.tag ?? ""} savedParcelId={saved.id} tag={saved.tag} onChanged={onChanged} />
          </div>
          {saved.notes.length ? (
            <div className="note-list">
              {saved.notes.map((note) => (
                <EditableNote key={note.id} note={note} onChanged={onChanged} />
              ))}
            </div>
          ) : (
            <p className="panel-note">No notes yet.</p>
          )}
          <ConfirmAction
            label="Remove from project"
            confirmLabel="Remove"
            prompt={`Remove from “${project.name}”? Its notes are deleted too.`}
            onConfirm={async () => {
              await savedWork.remove(saved.id);
              onChanged();
            }}
          />
        </article>
      ))}
    </div>
  );
}

export default function ParcelInspector({
  parcel,
  draft,
  onDraftChange,
  projectName,
  onProjectNameChange,
  onProjectSaved,
  saved,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const p = parcel.properties;
  const measurements = useMemo(() => measureParcel(parcel.geometry), [parcel.geometry]);
  const sourceUrl = safeSourceUrl(p.sourceUrl);
  const mailingHint = ownerMailingHint(p);
  const entries = savedEntriesFor(saved.projects, p.id);
  const noteCount = entries.reduce((total, entry) => total + entry.saved.notes.length, 0);
  const projectNames = saved.projects.map((project) => project.name);
  const savedProjectNames = new Set(entries.map((entry) => entry.project.name));
  const currentEntry = entries.find((entry) => entry.project.name === projectName.trim());
  const creatingProject = !projectNames.includes(projectName);
  // Default the tag to what this parcel already has in the chosen project.
  const { tag, note } = draft ?? { tag: currentEntry?.saved.tag ?? "lead", note: "" };
  const setTag = (tag: string) => onDraftChange({ tag, note });
  const setNote = (note: string) => onDraftChange({ tag, note });

  async function save(targetProject = projectName.trim()) {
    if (!targetProject) return;
    setSaving(true);
    setMessage("");
    setError("");
    setMenuOpen(false);
    try {
      const payload = await savedWork.save({ parcelDatabaseId: p.id, projectName: targetProject, tag, note });
      onProjectSaved(targetProject);
      setMessage(
        payload.data?.persisted === false ? "Demo preview only. This parcel was not stored." : `Saved to ${targetProject}.`
      );
      onDraftChange({ tag, note: "" });
      saved.refresh();
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
      <div className="print-brand">
        <BrandMark size={22} className="print-mark" />
        <span>Parcel · Property brief</span>
      </div>
      <h1>{parcelTitle(p)}</h1>
      <p>
        Prepared {new Date().toLocaleDateString()} · {p.sourceCounty}, {p.state}
      </p>
      <ParcelOutline parcel={parcel} />
      <ParcelMeasurements measurements={measurements} variant="print" />
      <dl className="record-list">
        {[
          ["Parcel ID", p.parcelId],
          ["APN", p.apn],
          ["Owner", p.ownerName],
          ["Mailing address", formatAddress(p.mailingAddress)],
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
      <p className="print-disclaimer">{PARCEL_DISCLAIMER}</p>
    </article>
  );

  const saveTarget = projectName.trim() || "a project";

  return (
    <>
      <section className="parcel-hero panel-section">
        <h3 className="hero-title">{parcelTitle(p)}</h3>
        <div className="hero-meta">
          <span>
            {p.sourceCounty || "County unavailable"}
            {p.state ? `, ${p.state}` : ""}
          </span>
          <button className="parcel-id-copy" onClick={copyId} title="Copy parcel ID">
            <span className="mono">{p.parcelId || p.apn || "Parcel ID unavailable"}</span>
            <Icon name="copy" size={14} />
          </button>
        </div>

        <div className="parcel-actions">
          <div className="split-button">
            {currentEntry ? (
              <button className="primary-button saved" onClick={() => setTab("notes")} title={`Saved in ${saveTarget}`}>
                <Icon name="bookmarkCheck" size={17} />
                <span>Saved</span>
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={saving || !projectName.trim()}
                onClick={() => void save()}
                title={`Save to ${saveTarget}`}
              >
                <Icon name="bookmark" size={17} />
                <span>{saving ? "Saving…" : `Save to ${saveTarget}`}</span>
              </button>
            )}
            <button
              className="primary-button split-toggle"
              aria-label="Choose a project to save to"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name="chevronDown" size={17} />
            </button>
            {menuOpen ? (
              <SaveMenu
                projectNames={projectNames}
                savedProjectNames={savedProjectNames}
                saving={saving}
                onSave={(name) => void save(name)}
                onClose={() => setMenuOpen(false)}
              />
            ) : null}
          </div>
          <button
            className={compared ? "secondary-button selected" : "secondary-button"}
            onClick={onCompare}
            aria-pressed={compared}
          >
            <Icon name={compared ? "check" : "compare"} size={17} />
            <span className="btn-label">{compared ? "Added" : "Compare"}</span>
          </button>
          <button
            className="icon-button bordered"
            onClick={onFocus}
            title="Fit parcel on map"
            aria-label="Fit parcel on map"
          >
            <Icon name="target" size={19} />
          </button>
        </div>
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

        {entries.length || mailingHint ? (
          <div className="parcel-badges">
            {entries.map(({ project, saved: savedParcel }) => (
              <button
                key={savedParcel.id}
                type="button"
                className="saved-chip"
                onClick={() => setTab("notes")}
                title="Show saved details and notes"
              >
                <TagDot tag={savedParcel.tag} />
                <span>
                  {project.name} · {tagLabel(savedParcel.tag)}
                </span>
              </button>
            ))}
            {mailingHint ? (
              <span className="hint-chip" title={MAILING_HINT_NOTE}>
                <Icon name="info" size={14} />
                {mailingHint.label}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="parcel-summary">
          <ParcelOutline parcel={parcel} />
          <dl className="hero-facts">
            <div>
              <dt>Recorded acreage</dt>
              <dd className="stat">
                {p.acreage === null ? "—" : displayValue(p.acreage)}
                <small>{p.acreage === null ? "unavailable" : "acres"}</small>
              </dd>
            </div>
            <div>
              <dt>Assessed value</dt>
              <dd className="stat">{displayMoney(p.assessedValue)}</dd>
              <dd className="stat-note">Assessment, not market value</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label="Property information">
        {(
          [
            ["overview", "Overview"],
            ["notes", noteCount ? `Save & notes (${noteCount})` : "Save & notes"],
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
        className="panel-section tab-panel"
        role="tabpanel"
        id={`parcel-panel-${tab}`}
        aria-labelledby={`parcel-tab-${tab}`}
      >
        {tab === "overview" ? (
          <>
            <h3 className="section-title">Property record</h3>
            <dl className="record-list">
              {[
                ["Owner of record", p.ownerName],
                ["Site address", formatAddress(p.siteAddress)],
                ["Mailing address", formatAddress(p.mailingAddress)],
                ["APN", p.apn],
                ["Land use / class", p.landUse]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={label === "APN" ? "mono" : undefined}>{displayValue(value)}</dd>
                  {label === "Mailing address" && mailingHint ? (
                    <dd className="record-hint">
                      <strong>{mailingHint.label}.</strong> {MAILING_HINT_NOTE}
                    </dd>
                  ) : null}
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
            <ParcelMeasurements measurements={measurements} />
            <div className="export-actions">
              <button className="secondary-button" ref={printTriggerRef} onClick={() => setPrintPreview(true)}>
                <Icon name="print" size={17} /> Print brief
              </button>
              <button className="secondary-button" onClick={() => downloadParcelsCsv([p])}>
                <Icon name="download" size={17} /> Export CSV
              </button>
            </div>
          </>
        ) : null}
        {tab === "notes" ? (
          <>
            <h3 className="section-title">Organize this property</h3>
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
              {projectNames.length ? (
                <label>
                  Project
                  <select
                    value={creatingProject ? "__new__" : projectName}
                    disabled={saving}
                    onChange={(event) => onProjectNameChange(event.target.value === "__new__" ? "" : event.target.value)}
                  >
                    {projectNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                        {savedProjectNames.has(name) ? " ✓" : ""}
                      </option>
                    ))}
                    <option value="__new__">＋ New project…</option>
                  </select>
                </label>
              ) : null}
              {creatingProject ? (
                <label>
                  {projectNames.length ? "New project name" : "Project name"}
                  <input
                    required
                    maxLength={120}
                    value={projectName}
                    autoFocus={projectNames.length > 0}
                    onChange={(e) => onProjectNameChange(e.target.value)}
                    placeholder="e.g. Lakefront buyer search"
                  />
                </label>
              ) : null}
              <fieldset className="tag-picker">
                <legend>Workflow tag</legend>
                <div>
                  {PARCEL_TAGS.map((value) => (
                    <button
                      type="button"
                      key={value}
                      disabled={saving}
                      aria-pressed={tag === value}
                      className={tag === value ? "tag active" : "tag"}
                      onClick={() => setTag(value)}
                    >
                      <TagDot tag={value} />
                      {tagLabel(value)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>
                Private note
                <textarea
                  disabled={saving}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Showing observations, questions to verify, or next steps…"
                />
                {note.length > 1800 ? <small className="char-count">{note.length.toLocaleString()} / 2,000</small> : null}
              </label>
              <button className="primary-button" disabled={saving || !projectName.trim()}>
                <Icon name="bookmark" size={17} />
                {saving ? "Saving…" : currentEntry ? "Update saved property" : "Save to project"}
              </button>
            </form>
            <SavedActivity entries={entries} onChanged={saved.refresh} />
          </>
        ) : null}
        {tab === "source" ? (
          <>
            <h3 className="section-title">Data provenance</h3>
            <dl className="record-list">
              {[
                ["Provider", p.provider],
                ["County", p.sourceCounty],
                ["Source updated", displayRecordDate(p.sourceUpdatedAt)],
                ["Imported", displayRecordDate(p.importedAt)],
                ["Source key", p.sourceKey],
                ["Source feature ID", p.sourceFeatureId],
                ["Site address (as recorded)", p.siteAddress],
                ["Mailing address (as recorded)", p.mailingAddress]
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
      </section>
      <p className="verification-note">
        <Icon name="info" size={16} />
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
                    <Icon name="print" size={17} />
                    Print / Save PDF
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Close property brief preview"
                    onClick={() => setPrintPreview(false)}
                  >
                    <Icon name="close" size={20} />
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
