import type { OfflineArea, OfflineAreaSummary } from "@/types/offline";

const DB_NAME = "realtor-parcel-offline";
const DB_VERSION = 1;
const AREA_STORE = "areas";

function offlineStorageError() {
  return new Error("This browser does not support offline area storage.");
}

function getIndexedDb() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw offlineStorageError();
  }

  return window.indexedDB;
}

function openOfflineDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;

    try {
      request = getIndexedDb().open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AREA_STORE)) {
        const store = db.createObjectStore(AREA_STORE, { keyPath: "id" });
        store.createIndex("downloadedAt", "downloadedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? offlineStorageError());
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
) {
  return openOfflineDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(AREA_STORE, mode);
        const store = transaction.objectStore(AREA_STORE);
        const request = callback(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? offlineStorageError());
        transaction.oncomplete = () => db.close();
        transaction.onabort = () => {
          db.close();
          reject(transaction.error ?? offlineStorageError());
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? offlineStorageError());
        };
      })
  );
}

function summarizeArea(area: OfflineArea): OfflineAreaSummary {
  return {
    id: area.id,
    name: area.name,
    bbox: area.bbox,
    zoom: area.zoom,
    parcelCount: area.parcelCount,
    downloadedAt: area.downloadedAt,
    storageBytes: area.storageBytes
  };
}

export function isOfflineAreaStorageSupported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function estimateOfflineAreaBytes(area: Omit<OfflineArea, "storageBytes">) {
  return new Blob([JSON.stringify(area)]).size;
}

export async function requestPersistentOfflineStorage() {
  if (typeof navigator === "undefined") return false;
  return (await navigator.storage?.persist?.()) ?? false;
}

export async function listOfflineAreas() {
  const areas = await withStore<OfflineArea[]>("readonly", (store) => store.getAll());
  return areas
    .map(summarizeArea)
    .sort((a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime());
}

export async function getOfflineArea(id: string) {
  return (await withStore<OfflineArea | undefined>("readonly", (store) => store.get(id))) ?? null;
}

export async function saveOfflineArea(area: OfflineArea) {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(area));
}

export async function deleteOfflineArea(id: string) {
  await withStore<undefined>("readwrite", (store) => store.delete(id));
}
