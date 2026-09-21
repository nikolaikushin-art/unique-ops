/**
 * YANDEX OBJECT STORAGE — real backend file provider.
 *
 * Security note: this module NEVER holds an AWS/Yandex access or secret key.
 * Every upload/download/delete is brokered through a small server-side
 * function (see /functions/storage-presign) that holds the real
 * YC_STORAGE_ACCESS_KEY / YC_STORAGE_SECRET_KEY and signs short-lived URLs.
 * The browser only ever does a plain PUT/GET fetch against those URLs.
 *
 * Used when VITE_STORAGE_PROVIDER=yandex. Env required:
 *   VITE_STORAGE_PRESIGN_URL   - the deployed presign function's HTTP endpoint
 *   VITE_STORAGE_PUBLIC_BASE   - e.g. https://<bucket>.storage.yandexcloud.net
 *                                (only "operations/*" keys are public; used
 *                                to build direct URLs without a round trip)
 */
import { db } from '../localdb';

const PRESIGN_URL = import.meta.env.VITE_STORAGE_PRESIGN_URL as string | undefined;
const PUBLIC_BASE = (import.meta.env.VITE_STORAGE_PUBLIC_BASE as string | undefined)?.replace(/\/$/, '');

function isSensitiveKey(key: string): boolean {
  return key.startsWith('secure/');
}

async function authToken(): Promise<string> {
  const { data } = await db.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Не авторизован — войдите в систему заново.');
  return token;
}

async function callPresign(body: Record<string, unknown>): Promise<any> {
  if (!PRESIGN_URL) {
    throw new Error('VITE_STORAGE_PRESIGN_URL не задан — файловое хранилище Yandex не настроено.');
  }
  const token = await authToken();
  const res = await fetch(PRESIGN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Хранилище: ошибка ${res.status}. ${text}`.trim());
  }
  return res.json();
}

/** No-op for the real backend — nothing to preload from a local cache. */
export async function init() {
  /* intentionally empty */
}

export async function presignDownload(key: string): Promise<string> {
  const { url } = await callPresign({ action: 'download', key });
  return url as string;
}

export async function deleteObject(key: string): Promise<void> {
  await callPresign({ action: 'delete', key });
}

export async function upload(
  file: File,
  key: string
): Promise<{ key: string; publicUrl: string | null }> {
  const { uploadUrl, publicUrl: presignedPublicUrl } = await callPresign({
    action: 'upload',
    key,
    contentType: file.type || 'application/octet-stream',
  });

  const putRes = await fetch(uploadUrl as string, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Не удалось загрузить файл в хранилище (HTTP ${putRes.status}).`);
  }

  return {
    key,
    publicUrl: (presignedPublicUrl as string | null) ?? (isSensitiveKey(key) ? null : publicUrl(key)),
  };
}

/** Synchronous by design (matches the local-storage provider's interface).
 *  Only meaningful for non-sensitive ("operations/*") keys, which live in a
 *  public-read bucket path — sensitive ("secure/*") keys always need
 *  presignDownload() instead and this returns '' for them. */
export function publicUrl(key: string): string {
  if (isSensitiveKey(key)) return '';
  if (!PUBLIC_BASE) return '';
  return `${PUBLIC_BASE}/${key}`;
}

export async function openFile(key: string, isSensitive: boolean) {
  try {
    const url = isSensitive || isSensitiveKey(key) ? await presignDownload(key) : publicUrl(key) || await presignDownload(key);
    if (!url) throw new Error('empty url');
    window.open(url, '_blank');
  } catch {
    alert('Не удалось открыть файл — проверьте подключение к хранилищу.');
  }
}
