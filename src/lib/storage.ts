/**
 * @deprecated Legacy helpers — files are stored locally.
 * Use `r2Storage.ts` (presigned R2 upload/download) and `AssetManager` instead.
 * This module remains for backward compatibility only.
 */
import { presignR2Download, publicR2Url } from './r2Storage';

/** @deprecated Use presignR2Download / publicR2Url from r2Storage.ts */
export async function getSignedUrl(
  _bucket: string,
  path: string,
  _expiresIn = 3600,
  isSensitive = false
): Promise<string | null> {
  if (!path) return null;
  try {
    return isSensitive ? await presignR2Download(path) : publicR2Url(path);
  } catch {
    return null;
  }
}

/** @deprecated Use presignR2Download / publicR2Url from r2Storage.ts */
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  isSensitive = false
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    paths.map(async (path) => {
      const url = await getSignedUrl(bucket, path, 3600, isSensitive);
      if (url) out[path] = url;
    })
  );
  return out;
}
