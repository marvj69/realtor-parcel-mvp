"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProjectsResponseData, SavedParcelSummary, SavedProjectSummary } from "@/types/parcel";

type ApiPayload<T> = { ok?: boolean; data?: T; error?: string; demo?: boolean };

async function send<T = unknown>(method: string, url: string, body?: unknown): Promise<ApiPayload<T>> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload<T>;
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}

export const savedWork = {
  save: (input: { parcelDatabaseId: string; projectName: string; tag: string | null; note: string }) =>
    send<{ persisted?: boolean }>("POST", "/api/saved-parcels", input),
  renameProject: (id: string, name: string) => send("PATCH", `/api/projects/${id}`, { name }),
  deleteProject: (id: string) => send("DELETE", `/api/projects/${id}`),
  setTag: (savedParcelId: string, tag: string | null) => send("PATCH", `/api/saved-parcels/${savedParcelId}`, { tag }),
  remove: (savedParcelId: string) => send("DELETE", `/api/saved-parcels/${savedParcelId}`),
  editNote: (noteId: string, note: string) => send("PATCH", `/api/parcel-notes/${noteId}`, { note }),
  deleteNote: (noteId: string) => send("DELETE", `/api/parcel-notes/${noteId}`)
};

export type SavedProjectsState = {
  projects: SavedProjectSummary[];
  loading: boolean;
  error: string | null;
  demo: boolean;
  refresh: () => void;
};

/** Loads the signed-in user's projects once and on demand; shared by the map, panels, and inspector. */
export function useSavedProjects(enabled: boolean): SavedProjectsState {
  const [projects, setProjects] = useState<SavedProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    // Deferred so the loading flag is not set synchronously inside the effect body.
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/projects?limit=50&savedLimit=100", {
          signal: controller.signal,
          cache: "no-store"
        });
        const payload = (await response.json()) as ApiPayload<ProjectsResponseData>;
        if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error ?? "Unable to load saved projects");
        setProjects(payload.data.projects);
        setDemo(Boolean(payload.demo));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load saved projects");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, version]);

  return { projects, loading, error, demo, refresh };
}

export type SavedEntry = { project: SavedProjectSummary; saved: SavedParcelSummary };

export function savedEntriesFor(projects: SavedProjectSummary[], parcelId: string): SavedEntry[] {
  return projects.flatMap((project) =>
    project.savedParcels.filter((saved) => saved.parcel.id === parcelId).map((saved) => ({ project, saved }))
  );
}
