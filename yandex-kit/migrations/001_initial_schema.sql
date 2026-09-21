-- ============================================================================
-- Unique Operations — initial schema for Yandex Managed PostgreSQL
--
-- This is a FRESH build, not a migration of existing data: the current
-- codebase (unique-operations-v18.zip) runs entirely on a local
-- browser-storage mock (src/lib/localdb.ts) and has never had a real Postgres
-- backend. This schema mirrors that local data model exactly — same table
-- names, same fields — so PostgREST can serve the same
-- `db.from('table').select()...` shape the frontend already calls, with
-- localdb.ts eventually swapped for a real @supabase/supabase-js client.
--
-- Run against an EMPTY Yandex Managed PostgreSQL database:
--   psql "$DATABASE_URL" -f 001_initial_schema.sql
--   psql "$DATABASE_URL" -f 002_roles_and_rls.sql
-- ============================================================================

begin;

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type user_role as enum ('super_admin','studio_owner','reception','detailer','accountant');
create type booking_status as enum (
  'new_enquiry','confirmed','vehicle_received','inspection','awaiting_approval',
  'in_progress','quality_check','completed','delivered','cancelled'
);
create type booking_priority as enum ('low','normal','high','urgent');
create type payment_status as enum ('unpaid','partial','paid');
create type invoice_status as enum ('pending','overdue','paid');
create type payment_provider as enum ('yookassa','tinkoff','demo','manual');
create type payment_method as enum ('cash','card','transfer','online','deposit');
create type payment_record_status as enum ('pending','waiting_for_capture','succeeded','canceled','failed');
create type customer_status as enum ('active','vip','sleeping');
create type lead_source as enum ('website','instagram','whatsapp','phone','referral');
create type lead_status as enum ('new','contacted','qualified','converted','lost','junk');
create type lead_activity_type as enum ('note','status_change','call','converted');
create type quote_status as enum ('draft','sent','accepted','rejected','expired');
create type schedule_type as enum ('work','off','holiday','sick','overtime');
create type task_status as enum ('pending','in_progress','completed','cancelled');
create type file_entity_type as enum ('customer','vehicle','booking','order','invoice','staff','product','service','lead');
create type comm_channel as enum ('email','whatsapp','sms','phone','telegram');
create type comm_direction as enum ('inbound','outbound');
create type email_status as enum ('sent','failed');
create type email_message_type as enum (
  'invoice','notification','manual','document','reminder_payment','reminder_visit','thanks',
  'enquiry','booking_request','quote','estimate','service_confirmation','payment','membership',
  'warranty','supplier','internal'
);
create type inspection_workflow_stage as enum (
  'vehicle_arrival','customer_handover','initial_inspection','damage_assessment',
  'service_recommendation','customer_approval','work_authorisation','inspection_completion',
  'handover_documentation'
);
create type inspection_approval_status as enum ('pending','approved','rejected');
create type expense_category as enum (
  'purchases','materials','salaries','premises','professional_fees','marketing','travel',
  'software','bank_charges','other'
);
create type inventory_item_type as enum ('product','material');

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- profiles  (mirrors GoTrue's auth.users 1:1 once real auth is wired up;
-- id should equal the auth.users.id once GoTrue is in front of this)
-- ----------------------------------------------------------------------------
create table profiles (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,
  full_name           text,
  role                user_role not null default 'reception',
  phone               text,
  avatar_url          text,
  is_active           boolean not null default true,
  verification_code   text,
  invited_at          timestamptz,
  verified_at         timestamptz,
  must_change_password boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------------
create table customers (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references profiles(id) on delete set null,
  full_name       text not null,
  phone           text,
  email           text,
  address         text,
  notes           text,
  status          customer_status not null default 'active',
  lifetime_value  numeric(12,2) not null default 0,
  visit_count     integer not null default 0,
  last_visit_at   timestamptz,
  source          text,
  preferred_channel text check (preferred_channel in ('whatsapp','telegram','phone','email')),
  birthday        date,
  tags            text[] not null default '{}',
  referred_by     uuid references customers(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_customers_status on customers(status);
create index idx_customers_phone on customers(phone);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- staff
-- ----------------------------------------------------------------------------
create table staff (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid references profiles(id) on delete set null,
  full_name             text not null,
  role                  text not null,
  skills                text[] not null default '{}',
  workload_pct          numeric(5,2) not null default 0,
  experience_years      numeric(5,2),
  is_active             boolean not null default true,
  employee_id           text,
  date_of_birth         date,
  phone                 text,
  email                 text,
  address               text,
  emergency_contact     text,
  nationality           text,
  employment_status     text not null default 'active',
  department            text,
  start_date            date,
  employment_type       text,
  salary                numeric(12,2),
  reporting_manager_id  uuid references staff(id) on delete set null,
  working_location      text,
  profile_photo_r2_key  text,
  internal_notes        text,
  availability_status   text not null default 'available',
  commission_pct        numeric(5,2),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_staff_active on staff(is_active);
create trigger trg_staff_updated before update on staff
  for each row execute function set_updated_at();

create table staff_skills (
  id                  uuid primary key default gen_random_uuid(),
  staff_id            uuid not null references staff(id) on delete cascade,
  skill_key           text not null,
  level               integer not null default 1,
  certified           boolean not null default false,
  experience_years    numeric(5,2) not null default 0,
  training_completed  boolean not null default false,
  performance_score   numeric(5,2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (staff_id, skill_key)
);
create trigger trg_staff_skills_updated before update on staff_skills
  for each row execute function set_updated_at();

create table staff_schedules (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  date        date not null,
  start_time  time,
  end_time    time,
  type        schedule_type not null default 'work',
  notes       text,
  created_at  timestamptz not null default now()
);
create index idx_staff_schedules_staff_date on staff_schedules(staff_id, date);

create table staff_tasks (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references staff(id) on delete cascade,
  title        text not null,
  description  text,
  status       task_status not null default 'pending',
  deadline     timestamptz,
  assigned_by  uuid references profiles(id) on delete set null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_staff_tasks_updated before update on staff_tasks
  for each row execute function set_updated_at();

create table staff_training (
  id                  uuid primary key default gen_random_uuid(),
  staff_id            uuid not null references staff(id) on delete cascade,
  course_name         text not null,
  completed_at        timestamptz,
  expires_at          timestamptz,
  certificate_r2_key  text,
  notes               text,
  created_at          timestamptz not null default now()
);

create table staff_attendance (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references staff(id) on delete cascade,
  check_in        timestamptz not null,
  check_out       timestamptz,
  hours_worked    numeric(6,2),
  break_minutes   integer,
  overtime_hours  numeric(6,2),
  notes           text,
  created_at      timestamptz not null default now()
);
create index idx_staff_attendance_staff on staff_attendance(staff_id);

-- ----------------------------------------------------------------------------
-- vehicles
-- ----------------------------------------------------------------------------
create table vehicles (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references customers(id) on delete cascade,
  brand                text not null,
  model                text not null,
  year                 integer,
  color                text,
  registration_number  text,
  vin                  text,
  maintenance_notes    text,
  pipeline_stage       text not null default 'new',
  intake_at            timestamptz,
  eta_at               timestamptz,
  mileage              integer,
  paint_code           text,
  coating_history      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_vehicles_customer on vehicles(customer_id);
create trigger trg_vehicles_updated before update on vehicles
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- services / packages / quotes
-- ----------------------------------------------------------------------------
create table services (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  description                 text,
  category                    text not null,
  subcategory                 text,
  difficulty_level            text,
  duration_minutes            integer not null default 60,
  price                       numeric(12,2) not null default 0,
  base_price                  numeric(12,2),
  min_price                   numeric(12,2),
  max_price                   numeric(12,2),
  labour_hours                numeric(6,2),
  vehicle_types               text[] not null default '{}',
  vehicle_pricing             jsonb not null default '{}',
  customer_instructions       text,
  equipment_required          jsonb not null default '[]',
  is_package                  boolean not null default false,
  required_technician_role    text,
  required_equipment          text,
  materials                   jsonb not null default '[]',
  required_skills             text[] not null default '{}',
  warranty_months             integer,
  maintenance_interval_months integer,
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create trigger trg_services_updated before update on services
  for each row execute function set_updated_at();

create table service_packages (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  service_ids   uuid[] not null default '{}',
  discount_pct  numeric(5,2) not null default 0,
  is_seasonal   boolean not null default false,
  valid_until   date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_service_packages_updated before update on service_packages
  for each row execute function set_updated_at();

create table service_quotes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  vehicle_id  uuid references vehicles(id) on delete set null,
  items       jsonb not null default '[]',   -- ServiceQuoteItem[]
  subtotal    numeric(12,2) not null default 0,
  discount    numeric(12,2) not null default 0,
  total       numeric(12,2) not null default 0,
  status      quote_status not null default 'draft',
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_service_quotes_updated before update on service_quotes
  for each row execute function set_updated_at();

create table service_material_recipes (
  id                    uuid primary key default gen_random_uuid(),
  service_id            uuid not null references services(id) on delete cascade,
  item_id               uuid not null,   -- fk to inventory_items, added after that table exists
  quantity_per_service  numeric(12,3) not null,
  unit                  text not null,
  notes                 text
);

-- ----------------------------------------------------------------------------
-- bookings / orders / job checklists
-- ----------------------------------------------------------------------------
create table bookings (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references customers(id) on delete cascade,
  vehicle_id              uuid references vehicles(id) on delete set null,
  service_id              uuid references services(id) on delete set null,
  scheduled_at            timestamptz not null,
  bay                     text,
  assigned_technician_id  uuid references staff(id) on delete set null,
  status                  booking_status not null default 'new_enquiry',
  payment_status          payment_status not null default 'unpaid',
  priority                booking_priority not null default 'normal',
  estimated_value         numeric(12,2),
  internal_notes          text,
  eta_at                  timestamptz,
  completed_at            timestamptz,
  order_id                uuid,   -- fk added after orders exists
  invoice_id              uuid,   -- fk added after invoices exists
  extra_items             jsonb not null default '[]',  -- BookingItem[]
  discount                numeric(12,2),
  deposit                 numeric(12,2),
  pickup_at               timestamptz,
  items_left              text,
  materials_written_off   boolean not null default false,
  materials_cost          numeric(12,2),
  before_photos           text[] not null default '{}',
  after_photos            text[] not null default '{}',
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index idx_bookings_customer on bookings(customer_id);
create index idx_bookings_status on bookings(status);
create index idx_bookings_scheduled_at on bookings(scheduled_at);
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();

create table orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique,
  customer_id     uuid not null references customers(id) on delete cascade,
  booking_id      uuid references bookings(id) on delete set null,
  services        jsonb not null default '[]',
  materials_used  jsonb not null default '[]',
  labour_cost     numeric(12,2) not null default 0,
  materials_cost  numeric(12,2) not null default 0,
  total_amount    numeric(12,2) not null default 0,
  payment_status  payment_status not null default 'unpaid',
  invoice_status  invoice_status not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

alter table bookings add constraint fk_bookings_order foreign key (order_id) references orders(id) on delete set null;

create table job_checklists (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  item          text not null,
  is_completed  boolean not null default false,
  completed_at  timestamptz,
  completed_by  uuid references staff(id) on delete set null,
  sort_order    integer not null default 0
);
create index idx_job_checklists_booking on job_checklists(booking_id);

-- ----------------------------------------------------------------------------
-- invoices / payments
-- ----------------------------------------------------------------------------
create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  invoice_number      text not null unique,
  order_id            uuid references orders(id) on delete set null,
  customer_id         uuid not null references customers(id) on delete cascade,
  description         text,
  amount              numeric(12,2) not null default 0,
  status              invoice_status not null default 'pending',
  due_date            date,
  pdf_url             text,
  sent_at             timestamptz,
  last_sent_to        text,
  payment_url         text,
  yookassa_payment_id text,
  paid_at             timestamptz,
  booking_id          uuid references bookings(id) on delete set null,
  payments            jsonb not null default '[]',  -- InvoicePayment[] ledger
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_invoices_customer on invoices(customer_id);
create index idx_invoices_status on invoices(status);
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();

alter table bookings add constraint fk_bookings_invoice foreign key (invoice_id) references invoices(id) on delete set null;

create table payments (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references invoices(id) on delete cascade,
  customer_id       uuid not null references customers(id) on delete cascade,
  amount            numeric(12,2) not null,
  currency          text not null default 'RUB',
  provider          payment_provider not null default 'manual',
  external_id       text,
  status            payment_record_status not null default 'pending',
  confirmation_url  text,
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_payments_invoice on payments(invoice_id);
create trigger trg_payments_updated before update on payments
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- leads
-- ----------------------------------------------------------------------------
create table leads (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null,
  last_name             text,
  phone                 text,
  email                 text,
  car_brand             text,
  car_model             text,
  source                lead_source not null default 'website',
  status                lead_status not null default 'new',
  converted_customer_id uuid references customers(id) on delete set null,
  notes                 text,
  owner_id              uuid references staff(id) on delete set null,
  tags                  text[] not null default '{}',
  next_action_at        timestamptz,
  next_action_note      text,
  lost_reason           text,
  est_value             numeric(12,2),
  service_interest      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_leads_status on leads(status);
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

create table lead_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  type        lead_activity_type not null,
  body        text not null,
  author_id   uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_lead_activities_lead on lead_activities(lead_id);

-- ----------------------------------------------------------------------------
-- files  (metadata only — bytes live in Yandex Object Storage)
-- ----------------------------------------------------------------------------
create table files (
  id                uuid primary key default gen_random_uuid(),
  entity_type       file_entity_type not null,
  entity_id         uuid not null,
  bucket_path       text not null,
  r2_key            text,   -- kept as-named for continuity; holds the Object Storage key
  file_name         text not null,
  file_type         text,
  file_size         bigint,
  category          text not null,
  storage_provider  text not null default 'yandex_object_storage',
  is_sensitive      boolean not null default false,
  booking_id        uuid references bookings(id) on delete set null,
  title             text,
  description       text,
  sent_at           timestamptz,
  sent_to_email     text,
  uploaded_by       uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index idx_files_entity on files(entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- inventory
-- ----------------------------------------------------------------------------
create table suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_email  text,
  contact_phone  text,
  notes          text,
  created_at     timestamptz not null default now()
);

create table inventory_items (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  type                  inventory_item_type not null default 'product',
  supplier              text,
  description           text,
  stock_level           numeric(12,3) not null default 0,
  min_stock_level       numeric(12,3) not null default 0,
  unit                  text not null default 'pcs',
  image_r2_key          text,
  catalog_r2_key        text,
  safety_r2_key         text,
  category              text,
  subcategory           text,
  brand                 text,
  sku                   text,
  barcode               text,
  application_purpose   text,
  compatible_services   text[],
  usage_instructions    text,
  safety_info           text,
  unit_cost             numeric(12,2) not null default 0,
  selling_price         numeric(12,2) not null default 0,
  storage_location      text,
  batch_number          text,
  expiry_date           date,
  film_thickness        text,
  roll_length           numeric(10,2),
  roll_width            numeric(10,2),
  equipment_id          text,
  purchase_date         date,
  warranty_until        date,
  maintenance_due       date,
  assigned_staff_id     uuid references staff(id) on delete set null,
  condition             text,
  hazard_class          text,
  storage_requirements  text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_inventory_items_active on inventory_items(is_active);
create trigger trg_inventory_items_updated before update on inventory_items
  for each row execute function set_updated_at();

alter table service_material_recipes
  add constraint fk_smr_item foreign key (item_id) references inventory_items(id) on delete cascade;

create table inventory_receipts (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references inventory_items(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete set null,
  quantity      numeric(12,3) not null,
  batch_number  text,
  expiry_date   date,
  invoice_ref   text,
  received_by   uuid references staff(id) on delete set null,
  received_at   timestamptz not null default now()
);

create table inventory_issues (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references inventory_items(id) on delete cascade,
  quantity    numeric(12,3) not null,
  booking_id  uuid references bookings(id) on delete set null,
  vehicle_id  uuid references vehicles(id) on delete set null,
  staff_id    uuid references staff(id) on delete set null,
  issued_at   timestamptz not null default now(),
  notes       text
);

create table inventory_returns (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references inventory_items(id) on delete cascade,
  quantity      numeric(12,3) not null,
  reason        text,
  condition     text,
  returned_by   uuid references staff(id) on delete set null,
  returned_at   timestamptz not null default now()
);

create table inventory_waste (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references inventory_items(id) on delete cascade,
  quantity      numeric(12,3) not null,
  reason        text,
  recorded_by   uuid references staff(id) on delete set null,
  recorded_at   timestamptz not null default now()
);

create table inventory_usage (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references inventory_items(id) on delete cascade,
  order_id       uuid references orders(id) on delete set null,
  booking_id     uuid references bookings(id) on delete set null,
  quantity_used  numeric(12,3) not null,
  used_at        timestamptz not null default now()
);

create table purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid references suppliers(id) on delete set null,
  status        text not null default 'draft',
  total         numeric(12,2) not null default 0,
  approved_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- communications (mailbox)
-- ----------------------------------------------------------------------------
create table communications (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id) on delete cascade,
  channel             comm_channel not null default 'email',
  direction           comm_direction not null,
  content             text not null,
  sent_at             timestamptz not null default now(),
  created_by          uuid references profiles(id) on delete set null,
  subject             text,
  recipient_email     text,
  sender_email        text,
  body_text           text,
  body_html           text,
  email_status        email_status,
  message_type        email_message_type,
  entity_id           uuid,
  error_message       text,
  read_at             timestamptz,
  read_by_profile_id  uuid references profiles(id) on delete set null,
  is_important        boolean not null default false,
  is_draft            boolean not null default false,
  is_archived         boolean not null default false,
  is_deleted          boolean not null default false,
  is_spam             boolean not null default false,
  attachment_keys     text[]
);
create index idx_communications_customer on communications(customer_id);
create index idx_communications_sent_at on communications(sent_at desc);

-- ----------------------------------------------------------------------------
-- inspections
-- ----------------------------------------------------------------------------
create table inspections (
  id                    uuid primary key default gen_random_uuid(),
  vehicle_id            uuid not null references vehicles(id) on delete cascade,
  booking_id            uuid references bookings(id) on delete set null,
  workflow_stage        inspection_workflow_stage not null default 'vehicle_arrival',
  approval_status       inspection_approval_status not null default 'pending',
  approved_at           timestamptz,
  approved_services     jsonb not null default '[]',
  damage_map            jsonb not null default '[]',
  exterior_checks       jsonb not null default '{}',
  interior_checks       jsonb not null default '{}',
  technical_checks      jsonb not null default '{}',
  recommended_services  jsonb not null default '[]',
  recommended_quote     jsonb not null default '[]',
  template_id           text,
  customer_comments     text,
  inspector_id          uuid references staff(id) on delete set null,
  exterior_condition    text,
  scratches             text,
  paint_condition       text,
  interior_condition    text,
  existing_damage       text,
  customer_requests     text,
  technician_notes      text,
  photos                text[] not null default '{}',
  inspected_by          uuid references staff(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_inspections_vehicle on inspections(vehicle_id);
create trigger trg_inspections_updated before update on inspections
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- alerts / audit / settings / expenses
-- ----------------------------------------------------------------------------
create table internal_alerts (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  title        text not null,
  body         text not null,
  is_read      boolean not null default false,
  target_role  user_role,
  created_at   timestamptz not null default now()
);

create table security_audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index idx_security_audit_log_user on security_audit_log(user_id);

create table studio_settings (
  key         text primary key,
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null
);

create table expenses (
  id          uuid primary key default gen_random_uuid(),
  category    expense_category not null default 'other',
  description text,
  amount      numeric(12,2) not null,
  expense_date date not null default current_date,
  supplier_id uuid references suppliers(id) on delete set null,
  recorded_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_expenses_date on expenses(expense_date);
create trigger trg_expenses_updated before update on expenses
  for each row execute function set_updated_at();

commit;
