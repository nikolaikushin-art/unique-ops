// Yandex Cloud Function — presigns Object Storage PUT/GET URLs on behalf of
// logged-in staff, and performs deletes server-side. This is the ONLY place
// YC_STORAGE_ACCESS_KEY / YC_STORAGE_SECRET_KEY are ever loaded — the browser
// never sees them (see src/lib/storage/yandexFileStorage.ts).
//
// Deploy (from this folder):
//   npm install
//   zip -r function.zip .
//   yc serverless function version create \
//     --function-name uo-storage-presign \
//     --runtime nodejs20 \
//     --entrypoint index.handler \
//     --memory 128m --execution-timeout 10s \
//     --source-path function.zip \
//     --environment YC_STORAGE_BUCKET=$YC_STORAGE_BUCKET \
//     --environment YC_STORAGE_ACCESS_KEY=$YC_STORAGE_ACCESS_KEY \
//     --environment YC_STORAGE_SECRET_KEY=$YC_STORAGE_SECRET_KEY \
//     --environment JWT_SECRET=$JWT_SECRET
// Then put VITE_STORAGE_PRESIGN_URL=<the function's HTTP invoke URL> in the
// frontend's env, and make the function public
// (yc serverless function allow-unauthenticated-invoke) since auth here is
// handled by verifying the GoTrue JWT ourselves, not by IAM.

import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { jwtVerify } from 'jose';

const REGION = 'ru-central1';
const ENDPOINT = 'https://storage.yandexcloud.net';
const UPLOAD_TTL_SECONDS = 5 * 60;
const DOWNLOAD_TTL_SECONDS = 10 * 60;

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.YC_STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.YC_STORAGE_SECRET_KEY,
  },
});

const BUCKET = process.env.YC_STORAGE_BUCKET;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function requireCaller(event) {
  const auth = event.headers?.Authorization || event.headers?.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new Error('missing bearer token');
  // GoTrue signs its access tokens HS256 with GOTRUE_JWT_SECRET — same value
  // as JWT_SECRET here. This just proves "is a logged-in staff session",
  // it does not re-check row-level permissions (PostgREST/RLS already does
  // that for the actual database rows this file metadata is attached to).
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload;
}

function keyLooksSafe(key) {
  // buildR2Key() in the frontend always produces
  // "operations/<entity>/<id>/<category>/<file>" or "secure/...".
  // Reject anything else so this endpoint can't be used as an open proxy.
  return typeof key === 'string' && /^(operations|secure)\/[A-Za-z0-9/_.-]+$/.test(key) && !key.includes('..');
}

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return json(405, { error: 'method not allowed' });
  }
  if (!BUCKET) return json(500, { error: 'YC_STORAGE_BUCKET not configured' });

  try {
    await requireCaller(event);
  } catch {
    return json(401, { error: 'unauthorized' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'invalid json body' });
  }

  const { action, key, contentType } = body;
  if (!keyLooksSafe(key)) return json(400, { error: 'invalid key' });

  try {
    if (action === 'upload') {
      const cmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
        // "secure/*" objects are never bucket-public; "operations/*" objects
        // rely on a bucket policy that grants public GET on that prefix only
        // (set once via `yc storage bucket update`, not per-object here).
      });
      const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: UPLOAD_TTL_SECONDS });
      const isSecure = key.startsWith('secure/');
      return json(200, {
        uploadUrl,
        publicUrl: isSecure ? null : `https://${BUCKET}.storage.yandexcloud.net/${key}`,
      });
    }

    if (action === 'download') {
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
      const url = await getSignedUrl(s3, cmd, { expiresIn: DOWNLOAD_TTL_SECONDS });
      return json(200, { url });
    }

    if (action === 'delete') {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      return json(200, { ok: true });
    }

    return json(400, { error: 'unknown action' });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
}
