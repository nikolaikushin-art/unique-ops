# Yandex migration — what the app needs from its backend

Audited: the app source (`src/`) against migrations 001/002, with 001–003 executed
on PostgreSQL 16. Supersedes the "Still open" list in `STATUS.md`.

## Apply order
```
psql "$DATABASE_URL" -f migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f migrations/002_roles_and_rls.sql
psql "$DATABASE_URL" -f migrations/003_app_compat.sql     # required, fixes 002
```

## Done in 003 (tested)
- [x] 002 blocker: `authenticated` had no USAGE on schema `auth` -> every logged-in query failed
- [x] 002 blocker: `auth.profile_role()` recursed through `profiles` RLS -> now SECURITY DEFINER
- [x] Privilege escalation: any staff user could set their own role to super_admin -> guarded
- [x] `files.is_cover` column (used by AssetManager / r2Storage)
- [x] Invoice / order numbers from sequences (INV-0001 / ORD-0001), race-free
- [x] Material write-off + low-stock alert on job completion (port of `writeOffMaterials`)
- [x] `supabase_realtime` publication for `communications`

## Still to build
- [ ] RPCs (missing from SQL): `admin_create_user`, `admin_reset_verification_code`,
      `admin_delete_user`, `verify_account_code`, `create_order_from_booking`
      (the last duplicates pricing from `src/lib/metrics.ts` `bookingValue`)
- [ ] Functions (missing): `admin-users`, `send-invoice`, `send-notification`, `create-payment`.
      The local mock only *records* sends/payments; real Postbox email and a payment
      provider (YooKassa/Tinkoff) are new work.
- [ ] Real auth: local mock signs in any email without a password. `profiles.id` MUST equal the
      GoTrue user id (RLS uses `auth.uid()`). Set `GOTRUE_DISABLE_SIGNUP: "true"`.
- [ ] Install `@supabase/supabase-js`; replace the 48 `import { db } from '.../localdb'` sites via a
      single `src/lib/db.ts` switched by env var.
- [ ] Realtime: confirm logical replication (`wal_level=logical`) is available on the Managed
      PostgreSQL cluster; otherwise poll on `MailboxPage`.
- [ ] Deploy `functions/storage-presign`; it only checks that a valid login exists — add a role
      check for `secure/` keys (passports, contracts).

## App fixes needed before a real DB (not applied)
- `src/App.tsx:110`, `src/components/UsersPanel.tsx:42`: `.neq('role','customer')` — `customer` is
  not in enum `user_role` -> Postgres rejects it. Remove the filter.
- `src/lib/mailbox.ts:503`: `.in('status',['draft','sent','overdue'])` — `draft`/`sent` are not
  `invoice_status` values (also never matches `pending`). Probably `['pending','overdue']`.
- Verify against PostgREST: `AuditLogPanel.tsx:38` `profiles:user_id(...)` and
  `ReportsPage.tsx:92` `staff:assigned_technician_id(...)`; safer as `profiles!user_id(...)`.
- Remove client-side numbering: `nextInvoiceNumber()` (`lib/ledger.ts`), used in `App.tsx:581`
  and `lib/orderFlow.ts:61`.

## Known design limits
- 002 baseline = any staff role can read/write every table (incl. salaries, files metadata,
  `profiles.verification_code`). Only the UI enforces roles until policies are tightened.
- Demo seed `lead_activities.author_id` uses owner ids that are not profiles (demo data only).

## Not an issue
- No Supabase/Cloudflare endpoints in app code; external URLs are only `wa.me`, `t.me`, own domain.
- 33 tables used by the app all exist; TS interfaces match SQL columns for all 31 mapped tables.
