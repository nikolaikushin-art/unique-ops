/**
 * BACKUP / RESTORE — the app keeps everything in this browser, so one cleared cache would lose the studio.
 * A backup is a single JSON file: all data (localStorage `uo:*` / `uo-*`) and, optionally, the files (IndexedDB).
 */
const APP_TAG = 'unique-operations-backup';
export const BACKUP_LAST_KEY = 'uo:backup:last';
const IDB_NAME = 'uo-files';
const IDB_STORE = 'blobs';
/** never part of a backup — per-device session state */
const SKIP = new Set(['uo:auth:session', 'uo-elevated-until', BACKUP_LAST_KEY]);

const isAppKey = (k: string) => (k.startsWith('uo:') || k.startsWith('uo-')) && !SKIP.has(k) && k !== IDB_NAME;

export function collectLocalData(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isAppKey(k)) out[k] = localStorage.getItem(k) ?? '';
  }
  return out;
}

export function hasStudioData(): boolean {
  try {
    const raw = localStorage.getItem('uo:db:customers');
    return !!raw && JSON.parse(raw).length > 0;
  } catch { return false; }
}

export function lastBackupAt(): Date | null {
  const raw = localStorage.getItem(BACKUP_LAST_KEY);
  return raw ? new Date(raw) : null;
}

export function backupAgeDays(): number | null {
  const d = lastBackupAt();
  return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

async function readAllBlobs(): Promise<{ key: string; data: string }[]> {
  const idb = await openIdb();
  const pairs: [string, Blob][] = await new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const keys = store.getAllKeys();
    const vals = store.getAll();
    tx.oncomplete = () => resolve((keys.result as string[]).map((k, i) => [k, vals.result[i] as Blob]));
    tx.onerror = () => reject(tx.error);
  });
  const out: { key: string; data: string }[] = [];
  for (const [key, blob] of pairs) out.push({ key, data: await blobToDataUrl(blob) });
  return out;
}

export async function countStoredFiles(): Promise<number> {
  try {
    const idb = await openIdb();
    return await new Promise((resolve, reject) => {
      const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch { return 0; }
}

export interface BackupResult { filename: string; keys: number; files: number; bytes: number }

/** Builds the backup and downloads it. Remembers the time so the reminder banner can calm down. */
export async function downloadBackup(withFiles: boolean): Promise<BackupResult> {
  const data = collectLocalData();
  const files = withFiles ? await readAllBlobs().catch(() => []) : [];
  const payload = { app: APP_TAG, version: 1, exported_at: new Date().toISOString(), with_files: withFiles, data, files };
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const filename = `unique-operations-backup-${stamp}${withFiles ? '-files' : ''}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  localStorage.setItem(BACKUP_LAST_KEY, new Date().toISOString());
  return { filename, keys: Object.keys(data).length, files: files.length, bytes: json.length };
}

export interface BackupSummary { exported_at: string; keys: number; files: number; customers: number; bookings: number; invoices: number }

export async function readBackupFile(file: File): Promise<{ payload: { data: Record<string, string>; files?: { key: string; data: string }[] }; summary: BackupSummary }> {
  const payload = JSON.parse(await file.text());
  if (payload?.app !== APP_TAG || typeof payload.data !== 'object') throw new Error('Это не файл резервной копии Unique Operations');
  const count = (k: string) => { try { return JSON.parse(payload.data[`uo:db:${k}`] ?? '[]').length as number; } catch { return 0; } };
  return {
    payload,
    summary: { exported_at: payload.exported_at, keys: Object.keys(payload.data).length, files: (payload.files ?? []).length, customers: count('customers'), bookings: count('bookings'), invoices: count('invoices') },
  };
}

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();

/** Replaces the current data with the backup, then the caller reloads the page. */
export async function restoreBackup(payload: { data: Record<string, string>; files?: { key: string; data: string }[] }): Promise<void> {
  // safety copy of what is about to be replaced, kept in memory of the browser session only
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isAppKey(k)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
  for (const [k, v] of Object.entries(payload.data)) if (isAppKey(k)) localStorage.setItem(k, v);
  if (payload.files) {
    const idb = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    for (const f of payload.files) {
      const blob = await dataUrlToBlob(f.data);
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blob, f.key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }
  localStorage.setItem(BACKUP_LAST_KEY, new Date().toISOString());
}
