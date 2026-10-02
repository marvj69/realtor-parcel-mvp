"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { ConfirmAction, EditableNote, TagDot, TagSelect } from "@/components/SavedWorkControls";
import { downloadParcelsCsv, PARCEL_TAGS, parcelTitle, tagLabel } from "@/lib/parcel-presentation";
import { savedWork, type SavedProjectsState } from "@/lib/saved-work-client";
import type { SavedParcelSummary, SavedProjectSummary } from "@/types/parcel";

type Props = {
  saved: SavedProjectsState;
  activeParcelId: string | null;
  nextSaveProject: string;
  onProjectRenamed: (from: string, to: string) => void;
  onProjectDeleted: (name: string) => void;
  onProjectNameSelect: (projectName: string) => void;
  onSavedParcelSelect: (savedParcel: SavedParcelSummary) => void;
};

function fmt(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function date(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SavedParcelCard({
  savedParcel,
  active,
  onSelect,
  onChanged
}: {
  savedParcel: SavedParcelSummary;
  active: boolean;
  onSelect: () => void;
  onChanged: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const { parcel, notes } = savedParcel;
  return (
    <article className={active ? "saved-parcel active" : "saved-parcel"}>
      <button className="saved-parcel-main" type="button" onClick={onSelect} disabled={!savedParcel.center}>
        <strong>{parcelTitle(parcel)}</strong>
        <span>{parcel.ownerName || "Owner unavailable"}</span>
        <span>
          {fmt(parcel.parcelId || parcel.apn)} · {parcel.acreage === null ? "acres unavailable" : `${fmt(parcel.acreage)} ac`}
          {savedParcel.createdAt ? ` · saved ${date(savedParcel.createdAt)}` : ""}
        </span>
      </button>
      {notes[0] && !notesOpen ? <p className="saved-parcel-note">{notes[0].note}</p> : null}
      <div className="saved-parcel-controls">
        <TagSelect
          key={savedParcel.tag ?? ""}
          savedParcelId={savedParcel.id}
          tag={savedParcel.tag}
          onChanged={onChanged}
        />
        <button
          type="button"
          className="text-button"
          aria-expanded={notesOpen}
          onClick={() => setNotesOpen(!notesOpen)}
        >
          {notes.length ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : "No notes"}
          <Icon name={notesOpen ? "chevronDown" : "chevron"} size={13} />
        </button>
        <ConfirmAction
          label="Remove"
          confirmLabel="Remove"
          prompt="Remove from this project? Its notes are deleted too."
          onConfirm={async () => {
            await savedWork.remove(savedParcel.id);
            onChanged();
          }}
        />
      </div>
      {notesOpen ? (
        <div className="note-list">
          {notes.length ? (
            notes.map((note) => <EditableNote key={note.id} note={note} onChanged={onChanged} />)
          ) : (
            <p className="panel-note">Open the property and use Save &amp; notes to add one.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function ProjectCard({
  project,
  open,
  isNextSave,
  activeParcelId,
  onUse,
  onSelect,
  onChanged,
  onRenamed,
  onDeleted
}: {
  project: SavedProjectSummary & { visibleParcels: SavedParcelSummary[] };
  open: boolean;
  isNextSave: boolean;
  activeParcelId: string | null;
  onUse: () => void;
  onSelect: (savedParcel: SavedParcelSummary) => void;
  onChanged: () => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = project.savedParcelCount;

  return (
    <details className="saved-project" open={open}>
      <summary>
        <span>
          <strong>{project.name}</strong>
          <small>
            {count.toLocaleString()} saved
            {project.clientName ? ` · ${project.clientName}` : ""}
            {isNextSave ? " · next save" : ""}
          </small>
        </span>
      </summary>
      <div className="project-toolbar">
        {renaming ? (
          <form
            className="rename-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await savedWork.renameProject(project.id, name.trim());
                onRenamed(project.name, name.trim());
                setRenaming(false);
                onChanged();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to rename project.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="sr-only" htmlFor={`rename-${project.id}`}>
              Project name
            </label>
            <input
              id={`rename-${project.id}`}
              value={name}
              maxLength={120}
              autoFocus
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setRenaming(false);
                }
              }}
            />
            <button className="primary-button compact-button" disabled={busy || !name.trim() || name.trim() === project.name}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="text-button" disabled={busy} onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <button className="text-button" type="button" onClick={onUse} disabled={isNextSave}>
              <Icon name="folder" size={14} />
              {isNextSave ? "Next save goes here" : "Use for next save"}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setName(project.name);
                setError("");
                setRenaming(true);
              }}
            >
              <Icon name="edit" size={14} /> Rename
            </button>
            {project.visibleParcels.length ? (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  downloadParcelsCsv(
                    project.visibleParcels.map((saved) => saved.parcel),
                    "saved-project-parcels"
                  )
                }
              >
                <Icon name="download" size={14} /> Export CSV
              </button>
            ) : null}
            <ConfirmAction
              label="Delete project"
              confirmLabel="Delete project"
              prompt={
                count
                  ? `Delete “${project.name}” and its ${count} saved ${count === 1 ? "parcel" : "parcels"} and notes?`
                  : `Delete “${project.name}”?`
              }
              onConfirm={async () => {
                await savedWork.deleteProject(project.id);
                onDeleted(project.name);
                onChanged();
              }}
            />
          </>
        )}
        {error ? (
          <p role="alert" className="message error">
            {error}
          </p>
        ) : null}
      </div>
      {project.visibleParcels.length === 0 ? (
        <p className="panel-note project-empty">
          {count ? "No saved properties match these filters." : "No parcels in this project yet."}
        </p>
      ) : (
        <div className="saved-parcel-list">
          {project.visibleParcels.map((savedParcel) => (
            <SavedParcelCard
              key={savedParcel.id}
              savedParcel={savedParcel}
              active={savedParcel.parcel.id === activeParcelId}
              onSelect={() => onSelect(savedParcel)}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </details>
  );
}

export default function SavedProjectsSidebar({
  saved,
  activeParcelId,
  nextSaveProject,
  onProjectRenamed,
  onProjectDeleted,
  onProjectNameSelect,
  onSavedParcelSelect
}: Props) {
  const { projects, loading, error, demo, refresh } = saved;
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [collapseProjectsByDefault, setCollapseProjectsByDefault] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const updateProjectDensity = () => setCollapseProjectsByDefault(media.matches);

    updateProjectDensity();
    media.addEventListener("change", updateProjectDensity);
    return () => media.removeEventListener("change", updateProjectDensity);
  }, []);

  const normalizedFilter = filter.trim().toLowerCase();
  const filtering = Boolean(normalizedFilter || tagFilter);
  const visibleProjects = projects
    .map((project) => {
      const projectMatches = [project.name, project.clientName].some((value) =>
        value?.toLowerCase().includes(normalizedFilter)
      );
      return {
        ...project,
        visibleParcels: project.savedParcels.filter(
          (saved) =>
            (!tagFilter || saved.tag === tagFilter) &&
            (!normalizedFilter ||
              projectMatches ||
              [
                parcelTitle(saved.parcel),
                saved.parcel.siteAddress,
                saved.parcel.ownerName,
                saved.parcel.apn,
                saved.parcel.parcelId,
                ...saved.notes.map((note) => note.note)
              ].some((value) => value?.toLowerCase().includes(normalizedFilter)))
        )
      };
    })
    .filter((project) => project.visibleParcels.length > 0 || !filtering);

  return (
    <section className="panel-section saved-projects-panel" aria-labelledby="saved-projects-heading">
      <div className="section-heading-row">
        <div>
          <div className="eyebrow">Your research library</div>
          <h2 id="saved-projects-heading">Saved projects</h2>
          {demo ? <p className="panel-note">Demo fallback — changes are not stored.</p> : null}
        </div>
        <button className="secondary-button compact-button" type="button" onClick={refresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <p className="panel-note">Properties, notes, and next steps, organized by project.</p>
      <div className="saved-filter">
        <label className="sr-only" htmlFor="saved-filter">
          Filter saved projects and notes
        </label>
        <input
          id="saved-filter"
          placeholder="Search projects, properties, or notes"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <label className="sr-only" htmlFor="saved-tag">
          Filter by workflow tag
        </label>
        <span className="tag-select wide">
          <TagDot tag={tagFilter || null} />
          <select id="saved-tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="">All workflow tags</option>
            {PARCEL_TAGS.map((tag) => (
              <option value={tag} key={tag}>
                {tagLabel(tag)}
              </option>
            ))}
          </select>
        </span>
      </div>
      {loading && projects.length === 0 ? (
        <p className="panel-note" role="status">
          Loading saved parcels…
        </p>
      ) : null}
      {error ? <p className="message error">{error}</p> : null}

      {!loading && !error && projects.length === 0 ? (
        <div className="empty-state">
          <Icon name="folder" size={35} />
          <h3>A place for your next opportunity</h3>
          <p>Select a parcel and choose Save to start your first project.</p>
        </div>
      ) : (
        <div className="saved-project-list">
          {visibleProjects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              open={
                filtering ||
                project.savedParcels.some((saved) => saved.parcel.id === activeParcelId) ||
                (!collapseProjectsByDefault && index === 0)
              }
              isNextSave={project.name === nextSaveProject}
              activeParcelId={activeParcelId}
              onUse={() => onProjectNameSelect(project.name)}
              onSelect={onSavedParcelSelect}
              onChanged={refresh}
              onRenamed={onProjectRenamed}
              onDeleted={onProjectDeleted}
            />
          ))}
        </div>
      )}
      {!loading && !error && projects.length > 0 && visibleProjects.length === 0 ? (
        <p className="panel-note">No saved properties match these filters.</p>
      ) : null}
      {projects.length > 0 ? (
        <p className="panel-note">
          Showing up to 50 projects and 100 saved parcels per project. Filters and exports apply to loaded records.
        </p>
      ) : null}
    </section>
  );
}
