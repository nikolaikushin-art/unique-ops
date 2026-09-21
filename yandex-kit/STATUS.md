# Unique Operations → Yandex Cloud — status & residency audit

Audited: every file in this kit, plus the actual app source (`unique-operations-v18.zip`),
grepped for non-Russian service endpoints. Checked against the codebase directly,
not against the older MIGRATION-PLAN.md audit — see the note at the bottom on why.

## Residency check — result

**Clean.** No live code path in the actual app calls a non-Russian backend. Specifically:

| Checked for | Found in app code? |
|---|---|
| `supabase.co` / `supabase.com` (live calls) | No — app has no `@supabase/supabase-js` dependency at all today |
| `resend.com` | No |
| Cloudflare / `r2.cloudflarestorage.com` | No |
| `amazonaws.com` (real AWS, not Yandex's S3-compatible endpoint) | No |
| Google Fonts / Google Analytics / Firebase / Sentry / Stripe / Twilio / SendGrid / Mailgun / Auth0 | No — fonts are self-hosted (`/fonts/inter-var.woff2`), no analytics or error-tracking SaaS wired in |

Everything this kit adds points at Yandex: Managed PostgreSQL, Object Storage,
Postbox (SMTP), and a Yandex Cloud Function for storage presigning.

## Two things to flag, not silently decide for you

1. **Vercel (frontend) and GitHub (source control) are foreign companies.**
   You said to keep both — that's your call, but 152-FZ ("On Personal Data") is
   specifically about where *personal data* is collected/stored/processed, not
   where compiled JS/HTML or source code lives. Whether serving the frontend
   bundle from Vercel is compliant depends on facts I can't verify (does any
   Vercel-side function ever touch customer PII in transit, does your legal
   reading of 152-FZ draw the line at "any customer-facing infra" vs "data
   storage only"). I'm not a lawyer — worth a five-minute confirmation with
   whoever is signing off on compliance here, not something to assume either way.
2. **Container images.** `docker-compose.yml` pulls `kong`, `supabase/gotrue`,
   `postgrest/postgrest`, `supabase/realtime`, `supabase/storage-api`, and
   `supabase/postgres-meta` from Docker Hub (US-based registry) at deploy time.
   This isn't a data-residency issue (it's software distribution, not data),
   but it's an *operational* risk — Docker Hub could be slow, rate-limited, or
   blocked from a Russian IP. Recommended: mirror these six images into Yandex
   Container Registry once during setup, then point `docker-compose.yml` at
   `cr.yandex/<your-registry>/...` instead of pulling from Docker Hub on every
   deploy.

## Stale doc — not carried forward as-is

`MIGRATION-PLAN.md` (from an earlier session) describes auditing a live Supabase
project, 27 migrations, Cloudflare R2, and a `sendViaResend()` edge function.
None of that exists in the actual `unique-operations-v18.zip` — it's a fully
local/browser-storage app with no backend integration at all. That earlier plan
was written against different assumptions than what's actually in this repo.
I flagged this the first time it came up; **still worth locating the real
history if that Supabase project genuinely existed somewhere**, since if there
really is live customer data in a project `flqgrcmevbjavafppqmh` sitting in
Tokyo, that's the one part of this migration that would actually be
data-migration risk, not scaffolding. If it never existed, ignore it.

## What's still needed before production

Built and verified so far (this kit):
- [x] Full Postgres schema, 35 tables, RLS on every table (`migrations/`) — tested against a real Postgres 16 instance
- [x] Roles + RLS policies for PostgREST (`migrations/002_roles_and_rls.sql`)
- [x] File storage: Yandex Object Storage via presigned URLs, secret keys never reach the browser (`functions/storage-presign/`, `src-patches/`) — tested end-to-end offline
- [x] Bucket policy scoping public access to `operations/*` only (`bucket-policy.json`)
- [x] docker-compose stack + Kong routing + provisioning script (from your earlier session)

Still open:
- [ ] **Manual Yandex Console provisioning** — billing account, Managed PostgreSQL cluster, Object Storage bucket, service account + static key, Compute VM, Postbox domain verification (the 7-step wizard from your last session)
- [ ] **Real `@supabase/supabase-js` client** — `src/lib/localdb.ts` still mocks everything in the browser; nothing in the app talks to a real backend yet. This is the biggest remaining piece — auth, and every table this schema created, only becomes real once this is wired in.
- [ ] **Deploy `functions/storage-presign`** and apply `bucket-policy.json` to the real bucket
- [ ] **DNS + TLS** for the Kong endpoint that `VITE_SUPABASE_URL` will point to
- [ ] **Backups & monitoring** on the Managed PostgreSQL cluster (enabled by default on Yandex MDB, but confirm retention window meets your needs)
- [ ] **VM hardening** — SSH key-only, firewall/security group limiting inbound to 443/8000 from expected sources only
- [ ] **Secrets hygiene** — `.env.yandex` must never be committed; add it explicitly to `.gitignore` alongside the existing `.env`/`.env.local` entries (checked: current `.gitignore` doesn't mention `.env.yandex` by name)
- [ ] **Confirm the Vercel/GitHub exception** with whoever owns compliance sign-off (see flag above)
- [ ] Smoke test end-to-end (signup → booking → invoice → file upload) against the new stack before cutover
