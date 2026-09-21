-- ============================================================================
-- Unique Operations — 003: things the app already expects from its backend
--
-- Found by auditing the app source (src/) against migrations 001/002. Each
-- block below replaces something that today happens inside the browser mock
-- (src/lib/localdb.ts) and would silently stop working — or fail outright —
-- against a real PostgREST backend.
--
-- Run after 001 and 002:
--   psql "$DATABASE_URL" -f 003_app_compat.sql
--
-- Safe to re-run.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. FIX for 002: let PostgREST's roles call the RLS helper functions.
--    002 puts auth.uid()/auth.profile_role() in schema `auth`, and the RLS
--    policies reach them through public.is_staff()/is_admin(). Without USAGE on
--    that schema every query by a logged-in user fails with
--    "permission denied for schema auth" (verified on PostgreSQL 16).
--    Only function lookup is opened up — GoTrue's tables (auth.users, ...) are
--    still not readable by these roles.
-- ----------------------------------------------------------------------------
grant usage on schema auth to anon, authenticated, service_role;

--    Second defect in the same helper chain: auth.profile_role() reads
--    `profiles`, but `profiles` is itself protected by a policy that calls
--    is_staff() -> auth.profile_role() again, i.e. infinite recursion
--    ("stack depth limit exceeded", verified on PostgreSQL 16). Running the
--    lookup as the table owner (SECURITY DEFINER) lets it bypass RLS — the
--    same pattern Supabase uses for its own helper functions. The search_path
--    is pinned so it can't be hijacked by a caller-created object.
create or replace function auth.profile_role() returns user_role
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select role from public.profiles where id = auth.uid()
  $$;

-- ----------------------------------------------------------------------------
-- 1. files.is_cover
--    The app sets/clears it in AssetManager.tsx ("make cover photo") and writes
--    it on upload (lib/r2Storage.ts). The column did not exist, so PostgREST
--    would reject both with "column files.is_cover does not exist".
-- ----------------------------------------------------------------------------
alter table files add column if not exists is_cover boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. Invoice / order numbers
--    invoices.invoice_number and orders.order_number are NOT NULL with no
--    default. Today the browser invents them (lib/ledger.ts nextInvoiceNumber:
--    download every invoice, take max+1) which double-issues numbers as soon as
--    two people work at once (the unique constraint would then make one of the
--    two saves fail). A sequence hands out each number exactly once.
--
--    The trigger only fills the number when the caller did not supply one, so
--    existing client code keeps working; remove the client-side numbering
--    (App.tsx, lib/orderFlow.ts) once this is live to get the full benefit.
--    Format is unchanged: INV-0001 / ORD-0001.
-- ----------------------------------------------------------------------------
create sequence if not exists invoice_number_seq;
create sequence if not exists order_number_seq;

create or replace function set_invoice_number() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := 'INV-' || lpad(nextval('invoice_number_seq')::text, 4, '0');
  end if;
  return new;
end $$;

create or replace function set_order_number() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'ORD-' || lpad(nextval('order_number_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_invoices_number on invoices;
create trigger trg_invoices_number before insert on invoices
  for each row execute function set_invoice_number();

drop trigger if exists trg_orders_number on orders;
create trigger trg_orders_number before insert on orders
  for each row execute function set_order_number();

-- If you later import existing invoices/orders, move the sequences past them:
--   select setval('invoice_number_seq',
--     coalesce((select max(substring(invoice_number from '\d+$')::int) from invoices), 0) + 1, false);

-- ----------------------------------------------------------------------------
-- 3. Material write-off when a job is completed
--    Port of writeOffMaterials() in src/lib/localdb.ts (its own comment calls
--    it "what a DB trigger would do"). When a booking moves into a done status
--    ('completed' / 'delivered', see DONE_STATUSES in src/lib/metrics.ts) and
--    has not been written off yet:
--      - completed_at is stamped if empty
--      - every recipe material of the main service + extra services is taken
--        off the warehouse (never below 0) and logged in inventory_usage
--      - a "low stock" alert is raised when stock <= min_stock_level
--      - bookings.materials_written_off / materials_cost are recorded
--    SECURITY DEFINER so a role that may only update bookings (e.g. detailer)
--    can still complete a job without direct write access to the warehouse.
-- ----------------------------------------------------------------------------
create or replace function booking_done_write_off() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  svc_ids   uuid[];
  rec       record;
  total     numeric := 0;
  new_stock numeric;
  item      record;
begin
  if new.status in ('completed','delivered')
     and old.status not in ('completed','delivered') then

    if new.completed_at is null then
      new.completed_at := now();
    end if;

    if not new.materials_written_off then
      select coalesce(array_agg(distinct s), '{}') into svc_ids
      from (
        select new.service_id as s
        union all
        select nullif(x ->> 'service_id', '')::uuid
        from jsonb_array_elements(coalesce(new.extra_items, '[]'::jsonb)) x
      ) q
      where s is not null;

      for rec in
        select r.item_id, r.quantity_per_service as qty
        from service_material_recipes r
        where r.service_id = any (svc_ids) and r.quantity_per_service > 0
      loop
        select * into item from inventory_items where id = rec.item_id for update;
        if not found then continue; end if;

        total := total + rec.qty * coalesce(item.unit_cost, 0);
        new_stock := greatest(0, coalesce(item.stock_level, 0) - rec.qty);

        update inventory_items set stock_level = new_stock where id = item.id;

        insert into inventory_usage (item_id, booking_id, order_id, quantity_used, used_at)
        values (item.id, new.id, new.order_id, rec.qty, now());

        if new_stock <= coalesce(item.min_stock_level, 0) then
          insert into internal_alerts (type, title, body, target_role)
          values (
            'inventory',
            'Низкий остаток',
            item.name || ' — осталось ' || trim_scale(new_stock)::text || ' '
              || coalesce(item.unit, '') || ', минимум '
              || trim_scale(coalesce(item.min_stock_level, 0))::text || '.',
            null
          );
        end if;
      end loop;

      new.materials_written_off := true;
      new.materials_cost := round(total);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_write_off on bookings;
create trigger trg_bookings_write_off before update on bookings
  for each row execute function booking_done_write_off();

-- ----------------------------------------------------------------------------
-- 4. Realtime
--    The mailbox page subscribes to postgres_changes on `communications`
--    (src/pages/MailboxPage.tsx). The realtime container only streams tables
--    that are in the `supabase_realtime` publication, and none existed.
--    NOTE: needs logical replication on the Managed PostgreSQL cluster — confirm
--    that in the Yandex console before relying on it (see MIGRATION-CHECKLIST.md).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communications'
  ) then
    alter publication supabase_realtime add table public.communications;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Let PostgREST's roles use the new sequences (harmless if roles are absent)
-- ----------------------------------------------------------------------------
do $$
declare r text;
begin
  foreach r in array array['authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on sequence invoice_number_seq, order_number_seq to %I', r);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Stop privilege escalation through `profiles`
--    002 lets every staff role write every table, including `profiles`, so a
--    reception user could set their own role to super_admin (verified). Only
--    admins may now create admin-level profiles or change anyone's role.
--    Calls with no logged-in user (service_role key, psql as owner, GoTrue
--    admin flows) are unaffected because auth.uid() is null there.
-- ----------------------------------------------------------------------------
create or replace function guard_profile_role() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.role in ('super_admin','studio_owner') then
      raise exception 'only an administrator can create an administrator profile';
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception 'only an administrator can change a role';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_role_guard on profiles;
create trigger trg_profiles_role_guard before insert or update on profiles
  for each row execute function guard_profile_role();

commit;
