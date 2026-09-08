"use client";

import Icon from "@/components/Icon";
import { downloadParcelsCsv, PARCEL_TAGS } from "@/lib/parcel-presentation";
import { useEffect, useState } from "react";
import type { ParcelSearchResult, ProjectsResponseData, SavedParcelSummary, SavedProjectSummary } from "@/types/parcel";

type Props = {
  refreshKey: number;
  activeParcelId: string | null;
  onProjectNameSelect: (projectName: string) => void;
  onSavedParcelSelect: (parcel: ParcelSearchResult) => void;
};

type ProjectsPayload = {
  ok?: boolean;
  data?: ProjectsResponseData;
  error?: string;
  demo?: boolean;
};

function fmt(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function date(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parcelTitle(savedParcel: SavedParcelSummary) {
  return savedParcel.parcel.siteAddress || savedParcel.parcel.parcelId || savedParcel.parcel.apn || "Saved parcel";
}

function parcelSubtitle(savedParcel: SavedParcelSummary) {
  return [savedParcel.parcel.ownerName, savedParcel.tag].filter(Boolean).join(" - ");
}

function toSearchResult(savedParcel: SavedParcelSummary): ParcelSearchResult {
  return {
    ...savedParcel.parcel,
    center: savedParcel.center,
    matchKind: null,
    matchLabel: savedParcel.label || savedParcel.tag || "Saved parcel",
    rank: null
  };
}

export default function SavedProjectsSidebar({
  refreshKey,
  activeParcelId,
  onProjectNameSelect,
  onSavedParcelSelect
}: Props) {
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [projects, setProjects] = useState<SavedProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [collapseProjectsByDefault, setCollapseProjectsByDefault] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProjects() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/projects?limit=50&savedLimit=100", {
          signal: controller.signal,
          cache: "no-store"
        });
        const payload = (await response.json()) as ProjectsPayload;

        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? "Unable to load saved projects");
        }

        setProjects(payload.data.projects);
        setDemo(Boolean(payload.demo));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load saved projects");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadProjects();

    return () => controller.abort();
  }, [refreshKey, manualRefreshKey]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const updateProjectDensity = () => setCollapseProjectsByDefault(media.matches);

    updateProjectDensity();
    media.addEventListener("change", updateProjectDensity);
    return () => media.removeEventListener("change", updateProjectDensity);
  }, []);

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleProjects = projects
    .map((project) => ({
      ...project,
      savedParcels: project.savedParcels.filter(
        (saved) =>
          (!tagFilter || saved.tag === tagFilter) &&
          (!normalizedFilter ||
            [
              project.name,
              project.clientName,
              saved.parcel.siteAddress,
              saved.parcel.ownerName,
              saved.parcel.apn,
              saved.parcel.parcelId,
              ...saved.notes.map((note) => note.note)
            ].some((value) => value?.toLowerCase().includes(normalizedFilter)))
      )
    }))
    .filter((project) => project.savedParcels.length > 0 || (!normalizedFilter && !tagFilter));

  return (
    <section className="panel-section saved-projects-panel" aria-labelledby="saved-projects-heading">
      <div className="section-heading-row">
        <div>
          <div className="eyebrow">Your research library</div>
          <h2 id="saved-projects-heading">Saved projects</h2>
          {demo ? <p className="panel-note">Demo fallback</p> : null}
        </div>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={() => setManualRefreshKey((value) => value + 1)}
        >
          Refresh
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
        <select id="saved-tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          <option value="">All workflow tags</option>
          {PARCEL_TAGS.map((tag) => (
            <option value={tag} key={tag}>
              {tag.replaceAll("-", " ")}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="panel-note" role="status">
          Loading saved parcels…
        </p>
      ) : null}
      {error ? <p className="message error">{error}</p> : null}

      {!loading && !error && projects.length === 0 ? (
        <div className="empty-state">
          <Icon name="folder" size={35} />
          <h3>A place for your next opportunity</h3>
          <p>Select a parcel, choose Save property, and name a project to start your collection.</p>
        </div>
      ) : (
        <div className="saved-project-list">
          {visibleProjects.map((project, index) => (
            <details
              className="saved-project"
              key={project.id}
              open={
                project.savedParcels.some((saved) => saved.parcel.id === activeParcelId) ||
                (!collapseProjectsByDefault && index === 0)
              }
            >
              <summary>
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.savedParcelCount.toLocaleString()} saved
                    {project.clientName ? ` - ${project.clientName}` : ""}
                  </small>
                </span>
              </summary>

              {project.savedParcels.length > 0 ? (
                <div className="project-export">
                  <button
                    className="text-button"
                    onClick={() =>
                      downloadParcelsCsv(
                        project.savedParcels.map((saved) => saved.parcel),
                        "saved-project-parcels"
                      )
                    }
                  >
                    <Icon name="download" size={14} />
                    Export displayed parcels
                  </button>
                </div>
              ) : null}
              {project.savedParcels.length === 0 ? (
                <p className="panel-note">No parcels in this project.</p>
              ) : (
                <div className="saved-parcel-list">
                  <button
                    className="text-button project-use-button"
                    type="button"
                    onClick={() => onProjectNameSelect(project.name)}
                  >
                    Use project for next save
                  </button>
                  {project.savedParcels.map((savedParcel) => (
                    <button
                      className={savedParcel.parcel.id === activeParcelId ? "saved-parcel active" : "saved-parcel"}
                      key={savedParcel.id}
                      type="button"
                      onClick={() => onSavedParcelSelect(toSearchResult(savedParcel))}
                      disabled={!savedParcel.center}
                    >
                      <div className="saved-parcel-main">
                        <strong>{parcelTitle(savedParcel)}</strong>
                        <span>{parcelSubtitle(savedParcel) || fmt(savedParcel.parcel.apn)}</span>
                        <span>
                          {fmt(savedParcel.parcel.parcelId)} - {fmt(savedParcel.parcel.acreage)} ac
                        </span>
                      </div>
                      <div className="saved-parcel-meta">
                        <span>{date(savedParcel.createdAt)}</span>
                        {savedParcel.notes.length > 0 ? (
                          <span>
                            {savedParcel.notes.length} note{savedParcel.notes.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {savedParcel.notes[0] ? <p>{savedParcel.notes[0].note}</p> : null}
                    </button>
                  ))}
                </div>
              )}
            </details>
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
