"use client";

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

export default function SavedProjectsSidebar({ refreshKey, activeParcelId, onProjectNameSelect, onSavedParcelSelect }: Props) {
  const [projects, setProjects] = useState<SavedProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProjects() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/projects?limit=12&savedLimit=40", {
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

  return (
    <section className="panel-section saved-projects-panel" aria-labelledby="saved-projects-heading">
      <div className="section-heading-row">
        <div>
          <h2 id="saved-projects-heading">Saved projects</h2>
          {demo ? <p className="panel-note">Demo fallback</p> : null}
        </div>
        <button className="secondary-button compact-button" type="button" onClick={() => setManualRefreshKey((value) => value + 1)}>
          Refresh
        </button>
      </div>

      {loading ? <p>Loading saved parcels...</p> : null}
      {error ? <p className="message error">{error}</p> : null}

      {!loading && !error && projects.length === 0 ? (
        <p>No saved parcels yet.</p>
      ) : (
        <div className="saved-project-list">
          {projects.map((project, index) => (
            <details className="saved-project" key={project.id} open={index === 0 || project.savedParcels.some((saved) => saved.parcel.id === activeParcelId)}>
              <summary>
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.savedParcelCount.toLocaleString()} saved
                    {project.clientName ? ` - ${project.clientName}` : ""}
                  </small>
                </span>
              </summary>

              {project.savedParcels.length === 0 ? (
                <p className="panel-note">No parcels in this project.</p>
              ) : (
                <div className="saved-parcel-list">
                  <button className="text-button project-use-button" type="button" onClick={() => onProjectNameSelect(project.name)}>
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
                        {savedParcel.notes.length > 0 ? <span>{savedParcel.notes.length} note{savedParcel.notes.length === 1 ? "" : "s"}</span> : null}
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
    </section>
  );
}
