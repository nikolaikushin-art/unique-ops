-- ============================================================================
-- Roles + RLS for the self-hosted stack (PostgREST + GoTrue on Yandex MDB)
--
-- IMPORTANT — read this before running:
-- Yandex Managed PostgreSQL is vanilla Postgres, not Supabase's own postgres
-- image. That means the auth.uid() / auth.role() helper functions Supabase's
-- docs assume are NOT there automatically. GoTrue will create and manage its
-- own `auth` schema (auth.users etc.) the first time it boots against
-- DATABASE_URL, but it does NOT create those SQL helper functions — this
-- file does, so RLS policies below can use them the same way Supabase's
-- hosted product does.
--
-- Run after 001_initial_schema.sql:
--   psql "$DATABASE_URL" -f 002_roles_and_rls.sql
--
-- Run this on the SAME database GoTrue is pointed at, and only AFTER GoTrue
-- has booted at least once (so the `auth` schema already exists) — otherwise
-- the auth.uid()/auth.role() functions below have nothing to attach to.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. PostgREST roles
--    PGRST_DB_ANON_ROLE=anon (set in docker-compose.yml). PostgREST switches
--    into `anon` for unauthenticated requests and into `authenticated` (via
--    the JWT's `role` claim) for logged-in ones.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant usage on sequences to anon, authenticated, service_role;

-- Table grants: broad here on purpose — RLS policies below do the real
-- narrowing. Adjust per-table if you want tighter GRANTs too.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant all on tables to service_role;

-- ----------------------------------------------------------------------------
-- 2. auth.uid() / auth.role() — recreated because this isn't Supabase's
--    postgres image. GoTrue's own `auth` schema must already exist.
-- ----------------------------------------------------------------------------
create schema if not exists auth;

create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;

create or replace function auth.role() returns text
  language sql stable
  as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
  $$;

-- App-specific: the caller's row in `profiles`, and their business role
-- (super_admin / studio_owner / reception / detailer / accountant).
create or replace function auth.profile_role() returns user_role
  language sql stable
  as $$
    select role from public.profiles where id = auth.uid()
  $$;

create or replace function public.is_staff() returns boolean
  language sql stable
  as $$
    select auth.profile_role() is not null
  $$;

create or replace function public.is_admin() returns boolean
  language sql stable
  as $$
    select auth.profile_role() in ('super_admin', 'studio_owner')
  $$;

-- ----------------------------------------------------------------------------
-- 3. Enable RLS everywhere, default-deny, then add policies.
--    Baseline used throughout: any authenticated staff profile (any row in
--    `profiles`) can read/write everything — this is an internal ops tool,
--    not a multi-tenant customer-facing app. Tighten per-table later if a
--    role needs to be locked out of something specific (e.g. only
--    super_admin/studio_owner touching `staff.salary`, payroll, etc.).
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in ('studio_settings')  -- handled separately below
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff());',
      t
    );
  end loop;
end $$;

-- studio_settings: readable by any authenticated staff, writable by admins only
alter table studio_settings enable row level security;
create policy studio_settings_read on studio_settings
  for select to authenticated using (public.is_staff());
create policy studio_settings_write on studio_settings
  for insert to authenticated with check (public.is_admin());
create policy studio_settings_update on studio_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- security_audit_log: every staff member can insert their own events,
-- but only admins can read the log back.
drop policy if exists staff_all on security_audit_log;
alter table security_audit_log enable row level security;
create policy audit_insert on security_audit_log
  for insert to authenticated with check (user_id = auth.uid());
create policy audit_read on security_audit_log
  for select to authenticated using (public.is_admin());

-- staff.salary / commission_pct: tighten with a column-level view if you
-- want non-admins to see staff records minus payroll fields — RLS is
-- row-level, not column-level, so that split is a `staff_directory` view,
-- e.g.:
--   create view staff_directory as
--     select id, profile_id, full_name, role, skills, is_active, phone, email
--     from staff;
--   grant select on staff_directory to authenticated;
-- Add this once the frontend has a concrete "who should NOT see salaries" rule.

commit;

-- ----------------------------------------------------------------------------
-- Sanity check after running both files:
--   curl http://<vm-ip>:8000/rest/v1/services?select=id,name \
--     -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
-- should return `[]` (empty array, not an error) against a freshly seeded
-- empty database.
-- ----------------------------------------------------------------------------
