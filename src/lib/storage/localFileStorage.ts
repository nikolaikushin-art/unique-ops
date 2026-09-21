/**
 * LOCAL FILE STORAGE — files are kept in this browser (IndexedDB).
 * This is the original demo/offline implementation, moved here unchanged
 * so it can sit behind the same provider switch as yandexFileStorage.ts.
 * Used when VITE_STORAGE_PROVIDER is unset or 'local'.
 */

const IDB_NAME = 'uo-files';
const IDB_STORE = 'blobs';
const urlCache = new Map<string, string>();

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, blob: Blob) {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string) {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll(): Promise<[string, Blob][]> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    tx.oncomplete = () => resolve((keysReq.result as string[]).map((k, i) => [k, valsReq.result[i] as Blob]));
    tx.onerror = () => reject(tx.error);
  });
}

/** Call once before the app renders so publicUrl() can be synchronous. */
export async function init() {
  try {
    for (const [key, blob] of await idbGetAll()) {
      if (!urlCache.has(key)) urlCache.set(key, URL.createObjectURL(blob));
    }
  } catch {
    /* IndexedDB unavailable — uploads will not persist */
  }
}

export async function presignDownload(key: string) {
  return urlCache.get(key) ?? '';
}

export async function deleteObject(key: string) {
  const url = urlCache.get(key);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(key);
  await idbDelete(key);
}

export async function upload(
  file: File,
  key: string
): Promise<{ key: string; publicUrl: string | null }> {
  await idbPut(key, file);
  const url = URL.createObjectURL(file);
  urlCache.set(key, url);
  return { key, publicUrl: url };
}

export function publicUrl(key: string): string {
  return urlCache.get(key) ?? '';
}

export async function openFile(key: string, _isSensitive: boolean) {
  const url = urlCache.get(key);
  if (!url) {
    alert('Файл не найден в локальном хранилище этого браузера.');
    return;
  }
  window.open(url, '_blank');
}
