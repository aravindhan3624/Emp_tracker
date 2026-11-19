-- FieldForce 360 — multi-tenant, fully traceable schema for Supabase (PostgreSQL 15+)
-- Run ONCE on a fresh project: Supabase Dashboard → SQL Editor → paste → Run.
-- Then run db/seed_demo.sql to load a demo company.
--
-- Design principles
--  * Multi-tenant: every business row carries tenant_id; Row Level Security (RLS) guarantees one
--    customer company can never read or write another's data, even with the public anon key.
--  * Least privilege: field staff see/write only their own operational rows; managers see the
--    whole company; only admins change master data and settings.
--  * Traceability: every insert/update/delete on business tables is written to change_log with
--    old and new values, who did it (auth user + employee) and when. GPS points and money
--    receipts are append-only (cannot be edited or deleted) — corrections are new rows.
--  * Privacy: location points are rejected by the database unless the employee is on duty, and
--    are purged after the tenant's retention period.

create extension if not exists pgcrypto;

-- =====================================================================================
-- 1. Vendor level: pricing plans (public, read-only to customers)
-- =====================================================================================
create table public.pricing_settings (
  id boolean primary key default true check (id),          -- single row
  currency text not null default '₹',
  gst_pct numeric(5,2) not null default 18,
  annual_discount_pct numeric(5,2) not null default 15,
  trial_days int not null default 14
);
insert into public.pricing_settings default values;

create table public.plans (
  id text primary key,                                       -- 'starter', 'pro', 'bfsi'
  name text not null,
  price_per_user_month numeric(10,2) not null check (price_per_user_month >= 0),
  min_seats int not null default 1,
  tagline text,
  popular boolean not null default false,
  modules text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);
insert into public.plans (id, name, price_per_user_month, min_seats, tagline, popular, modules, sort) values
 ('starter','Starter',99,5,'Attendance & live tracking for small teams',false,
   '{attendance,selfie,liveTracking,reports,alerts}',1),
 ('pro','Professional',199,10,'Visits, custom forms and expenses',true,
   '{attendance,selfie,liveTracking,reports,alerts,visits,customForms,expenses,leaves,tasks}',2),
 ('bfsi','BFSI Enterprise',349,25,'Banks, NBFCs & MFIs: collections and compliance',false,
   '{attendance,selfie,liveTracking,reports,alerts,visits,customForms,expenses,leaves,tasks,collections,offline,routeOpt,faceMatch,api,whiteLabel}',3);

-- =====================================================================================
-- 2. Tenants (customer companies) and their configuration
-- =====================================================================================
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  plan_id text not null references public.plans(id) default 'starter',
  seats int not null default 5 check (seats > 0),
  billing text not null default 'monthly' check (billing in ('monthly','annual')),
  status text not null default 'trial' check (status in ('trial','active','suspended','cancelled')),
  trial_ends_at timestamptz default now() + interval '14 days',
  created_at timestamptz not null default now()
);

-- The whole app configuration (branding, modules, tracking rules, visit types and their forms,
-- collections, expenses) as one JSON document, edited from the Admin Console.
create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  app_config jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  unique (tenant_id, code)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,  -- linked on first OTP sign-in
  emp_code text not null,
  name text not null,
  title text not null default 'Field Officer',               -- designation shown in the app
  role text not null default 'field' check (role in ('owner','admin','manager','field')),
  branch_id uuid references public.branches(id),
  phone text,                                                -- E.164, e.g. +919840010001 (used for SMS OTP)
  email text,                                                -- used for email OTP (managers)
  color text not null default '#2563eb',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, emp_code)
);
create index employees_phone_digits on public.employees ((regexp_replace(phone, '\D', '', 'g')));
create index employees_email_lower on public.employees (lower(email));

create table public.visit_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,                                        -- matches visitTypes[].id in app_config
  label text not null,
  unique (tenant_id, code)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null, address text, phone text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  created_at timestamptz not null default now()
);

create table public.loan_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  loan_ref text not null,
  emi_due numeric(12,2) not null default 0 check (emi_due >= 0),
  overdue_days int not null default 0,
  unique (tenant_id, loan_ref)
);

-- =====================================================================================
-- 3. Daily operations
-- =====================================================================================
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,                                   -- employee's local date (sent by the app)
  check_in_at timestamptz not null default now(),
  check_in_lat double precision, check_in_lng double precision, check_in_accuracy real,
  selfie_path text,                                          -- Storage object in bucket "selfies"
  is_late boolean not null default false,
  check_out_at timestamptz, check_out_lat double precision, check_out_lng double precision,
  check_out_note text,
  device jsonb not null default '{}',                        -- app version, platform, GPS mode
  unique (employee_id, work_date),
  check (check_out_at is null or check_out_at >= check_in_at)
);

-- Append-only GPS breadcrumbs (only while on duty — enforced by trigger below).
create table public.employee_locations (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  recorded_at timestamptz not null,                          -- time on the device
  received_at timestamptz not null default now(),            -- time the server got it (detects offline uploads)
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real,
  source text not null default 'device' check (source in ('device','sim')),
  is_mock boolean not null default false
);
create index employee_locations_emp_time on public.employee_locations (employee_id, recorded_at desc);
create index employee_locations_tenant_time on public.employee_locations (tenant_id, recorded_at desc);

-- Latest device health per employee (GPS on/off/denied) for live alerts.
create table public.employee_status (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  gps text not null default 'ok' check (gps in ('ok','off','denied')),
  accuracy real,
  mode text,
  last_seen_at timestamptz not null default now()
);

create table public.customer_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  customer_id uuid not null references public.customers(id),
  loan_account_id uuid references public.loan_accounts(id),
  visit_type_id uuid not null references public.visit_types(id),
  scheduled_date date not null default current_date,
  sort int not null default 0,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  started_at timestamptz, start_lat double precision, start_lng double precision, start_distance_m int,
  flagged boolean not null default false,                    -- started outside the geofence
  completed_at timestamptz, end_lat double precision, end_lng double precision,
  outcome text, remarks text,
  form_data jsonb not null default '{}'                      -- answers to the visit type's custom form
);
create index customer_visits_emp_date on public.customer_visits (employee_id, scheduled_date);
create index customer_visits_tenant_date on public.customer_visits (tenant_id, scheduled_date);

-- Money received in the field. Append-only: a wrong receipt is reversed, never edited.
create table public.collection_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid references public.customer_visits(id),
  employee_id uuid not null references public.employees(id),
  loan_account_id uuid references public.loan_accounts(id),
  amount numeric(12,2) not null check (amount > 0),
  mode text not null,
  receipt_no text not null,
  collected_at timestamptz not null,
  received_at timestamptz not null default now(),
  lat double precision, lng double precision,
  unique (tenant_id, receipt_no)
);
create index collection_tx_tenant_time on public.collection_transactions (tenant_id, collected_at desc);

create table public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  ref text not null,                                         -- id shown in the app (EXP-123456)
  category text not null, amount numeric(10,2) not null check (amount > 0), note text,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  decided_by uuid references public.employees(id), decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, ref)
);

-- Business events shown in the app ("checked in", "visit completed", "GPS turned off", ...).
create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.employees(id),
  actor_auth_id uuid default auth.uid(),                     -- who actually performed it
  ref text,                                                  -- client id, makes retries idempotent
  action text not null, detail text,
  created_at timestamptz not null default now(),
  unique (tenant_id, ref)
);
create index audit_logs_tenant_time on public.audit_logs (tenant_id, created_at desc);

-- Low-level data history: every row change on business tables, with before/after values.
create table public.change_log (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  table_name text not null,
  row_id text not null,
  op text not null check (op in ('INSERT','UPDATE','DELETE')),
  old_data jsonb, new_data jsonb,
  changed_by_auth uuid,
  changed_by_employee uuid,
  changed_at timestamptz not null default now()
);
create index change_log_tenant_time on public.change_log (tenant_id, changed_at desc);
create index change_log_row on public.change_log (table_name, row_id);

-- =====================================================================================
-- 4. Helper functions (security definer avoids RLS recursion)
-- =====================================================================================
create or replace function public.my_tenant() returns uuid language sql stable security definer set search_path = public as
  $$ select tenant_id from employees where auth_user_id = auth.uid() and active $$;
create or replace function public.my_employee() returns uuid language sql stable security definer set search_path = public as
  $$ select id from employees where auth_user_id = auth.uid() and active $$;
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
  $$ select role from employees where auth_user_id = auth.uid() and active $$;
create or replace function public.is_manager() returns boolean language sql stable as
  $$ select coalesce(public.my_role() in ('owner','admin','manager'), false) $$;
create or replace function public.is_admin() returns boolean language sql stable as
  $$ select coalesce(public.my_role() in ('owner','admin'), false) $$;

-- Called by the app right after OTP sign-in: links the signed-in phone/email to the employee
-- record HR created. Only pre-registered, active employees get access — anyone else who
-- signs in has an auth user with no employee row, so RLS returns nothing to them.
create or replace function public.link_my_employee() returns json language plpgsql security definer set search_path = public as $$
declare
  ph text := nullif(regexp_replace(coalesce(auth.jwt()->>'phone',''), '\D', '', 'g'), '');
  em text := nullif(lower(coalesce(auth.jwt()->>'email','')), '');
  e employees;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into e from employees where auth_user_id = auth.uid() and active;
  if not found then
    select * into e from employees
     where active and auth_user_id is null
       and ((ph is not null and regexp_replace(coalesce(phone,''), '\D', '', 'g') = ph)
         or (em is not null and lower(email) = em))
     order by created_at limit 1;
    if not found then return null; end if;
    update employees set auth_user_id = auth.uid() where id = e.id;
    insert into audit_logs (tenant_id, employee_id, action, detail)
      values (e.tenant_id, e.id, 'ACCOUNT_LINKED', coalesce('+' || ph, em));
  end if;
  return json_build_object('employee_id', e.id, 'tenant_id', e.tenant_id, 'emp_code', e.emp_code,
                           'name', e.name, 'role', e.role);
end $$;
revoke all on function public.link_my_employee() from public, anon;
grant execute on function public.link_my_employee() to authenticated;

-- =====================================================================================
-- 5. Row Level Security
-- =====================================================================================
alter table public.plans enable row level security;
alter table public.pricing_settings enable row level security;
create policy plans_read on public.plans for select using (true);              -- public pricing page
create policy pricing_read on public.pricing_settings for select using (true);

alter table public.tenants enable row level security;
create policy tenant_read on public.tenants for select using (id = public.my_tenant());
create policy tenant_admin_update on public.tenants for update using (id = public.my_tenant() and public.is_admin());

alter table public.tenant_settings enable row level security;
create policy settings_read on public.tenant_settings for select using (tenant_id = public.my_tenant());
create policy settings_admin_update on public.tenant_settings for update
  using (tenant_id = public.my_tenant() and public.is_admin()) with check (tenant_id = public.my_tenant());
create policy settings_admin_insert on public.tenant_settings for insert
  with check (tenant_id = public.my_tenant() and public.is_admin());

-- Master data: everyone in the company reads, admins write.
do $$ declare t text; begin
  foreach t in array array['visit_types','branches','employees','customers','loan_accounts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_read on public.%1$I for select using (tenant_id = public.my_tenant())', t);
    execute format('create policy %1$s_admin on public.%1$I for all using (tenant_id = public.my_tenant() and public.is_admin()) with check (tenant_id = public.my_tenant())', t);
  end loop;
end $$;

-- Operational data: field staff see and write only their own rows; managers see the whole company.
do $$ declare t text; begin
  foreach t in array array['attendance','employee_locations','employee_status','customer_visits','collection_transactions','expense_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_read on public.%1$I for select using (tenant_id = public.my_tenant() and (employee_id = public.my_employee() or public.is_manager()))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert with check (tenant_id = public.my_tenant() and employee_id = public.my_employee())', t);
  end loop;
  -- Updates: own rows, or a manager (e.g. approving an expense). GPS points and receipts get no update policy.
  foreach t in array array['attendance','employee_status','customer_visits','expense_claims'] loop
    execute format('create policy %1$s_update on public.%1$I for update using (tenant_id = public.my_tenant() and (employee_id = public.my_employee() or public.is_manager())) with check (tenant_id = public.my_tenant())', t);
  end loop;
end $$;
-- Managers assign visits to staff.
create policy customer_visits_manager_insert on public.customer_visits for insert
  with check (tenant_id = public.my_tenant() and public.is_manager());

alter table public.audit_logs enable row level security;
create policy audit_read on public.audit_logs for select
  using (tenant_id = public.my_tenant() and (public.is_manager() or employee_id = public.my_employee()));
create policy audit_insert on public.audit_logs for insert
  with check (tenant_id = public.my_tenant() and actor_auth_id = auth.uid());

alter table public.change_log enable row level security;
create policy change_log_read on public.change_log for select using (tenant_id = public.my_tenant() and public.is_manager());
-- No insert/update/delete policies: only the trigger below (security definer) writes here.

-- =====================================================================================
-- 6. Integrity & traceability triggers
-- =====================================================================================

-- Location points may only be written while the employee is on duty (no off-duty tracking).
-- Points recorded before check-out are accepted even if they arrive later (offline upload).
create or replace function public.reject_off_duty_location() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from attendance a
                  where a.employee_id = new.employee_id
                    and a.check_in_at <= new.recorded_at + interval '2 minutes'
                    and (a.check_out_at is null or new.recorded_at <= a.check_out_at + interval '2 minutes')) then
    raise exception 'Location rejected: employee is not on duty';
  end if;
  return new;
end $$;
create trigger employee_locations_on_duty before insert on public.employee_locations
  for each row execute function public.reject_off_duty_location();

-- GPS history and money receipts are immutable (only the retention job / demo reset may delete).
create or replace function public.forbid_change() returns trigger language plpgsql as $$
begin
  if current_setting('ff.allow_purge', true) = 'on' then return old; end if;
  raise exception '% rows are append-only and cannot be %d', tg_table_name, lower(tg_op);
end $$;
create trigger employee_locations_immutable before update or delete on public.employee_locations
  for each row execute function public.forbid_change();
create trigger collection_tx_immutable before update or delete on public.collection_transactions
  for each row execute function public.forbid_change();

-- Expense decisions record who decided and when (cannot be spoofed by the client).
create or replace function public.stamp_expense_decision() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not public.is_manager() then raise exception 'Only a manager can approve or reject claims'; end if;
    new.decided_by := public.my_employee(); new.decided_at := now();
  end if;
  return new;
end $$;
create trigger expense_claims_decision before update on public.expense_claims
  for each row execute function public.stamp_expense_decision();

-- Generic row history → change_log.
create or replace function public.log_change() returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
begin
  if tg_op = 'UPDATE' and o = n then return new; end if;
  insert into change_log (tenant_id, table_name, row_id, op, old_data, new_data, changed_by_auth, changed_by_employee)
  values (case when tg_table_name = 'tenants' then (r->>'id')::uuid else (r->>'tenant_id')::uuid end,
          tg_table_name, coalesce(r->>'id', r->>'employee_id', r->>'tenant_id'), tg_op, o, n,
          auth.uid(), public.my_employee());
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['tenants','tenant_settings','branches','employees','visit_types','customers','loan_accounts',
                           'attendance','customer_visits','collection_transactions','expense_claims'] loop
    execute format('create trigger %1$s_history after insert or update or delete on public.%1$I for each row execute function public.log_change()', t);
  end loop;
end $$;

create or replace function public.touch_settings() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger tenant_settings_touch before insert or update on public.tenant_settings
  for each row execute function public.touch_settings();

-- =====================================================================================
-- 7. Data retention & demo helpers
-- =====================================================================================
-- Deletes location history older than each tenant's tracking.retentionDays (default 90).
-- Schedule daily with pg_cron:  select cron.schedule('purge-locations','15 2 * * *','select public.purge_old_locations()');
create or replace function public.purge_old_locations() returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('ff.allow_purge', 'on', true);
  delete from employee_locations l using tenant_settings s
   where l.tenant_id = s.tenant_id
     and l.recorded_at < now() - make_interval(days => coalesce((s.app_config->'tracking'->>'retentionDays')::int, 90));
end $$;
revoke all on function public.purge_old_locations() from public, anon, authenticated;

-- Demo only: clears one day's activity for the caller's company and re-schedules every demo
-- visit for that day, so the demo can be replayed. Admins only.
create or replace function public.demo_reset_day(p_date date) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := public.my_tenant();
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  perform set_config('ff.allow_purge', 'on', true);
  delete from employee_locations where tenant_id = t and recorded_at >= p_date - 1;
  delete from collection_transactions where tenant_id = t;
  delete from expense_claims where tenant_id = t and created_at >= p_date - 1;
  delete from attendance where tenant_id = t and work_date = p_date;
  delete from employee_status where tenant_id = t;
  update customer_visits set scheduled_date = p_date, status = 'pending', started_at = null, start_lat = null, start_lng = null,
         start_distance_m = null, flagged = false, completed_at = null, end_lat = null, end_lng = null,
         outcome = null, remarks = null, form_data = '{}'
   where tenant_id = t;
  insert into audit_logs (tenant_id, employee_id, action, detail) values (t, public.my_employee(), 'DEMO_RESET', p_date::text);
end $$;
revoke all on function public.demo_reset_day(date) from public, anon;
grant execute on function public.demo_reset_day(date) to authenticated;

-- =====================================================================================
-- 8. Selfie storage (private bucket; path = <tenant_id>/<date>/<employee_id>.jpg)
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfies', 'selfies', false, 204800, array['image/jpeg','image/png'])
on conflict (id) do nothing;

create policy selfies_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'selfies' and (storage.foldername(name))[1] = public.my_tenant()::text);
create policy selfies_overwrite on storage.objects for update to authenticated
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = public.my_tenant()::text);
create policy selfies_read on storage.objects for select to authenticated
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = public.my_tenant()::text
         and (public.is_manager() or name like '%/' || public.my_employee()::text || '.jpg'));

-- =====================================================================================
-- 9. Realtime: stream changes to the manager dashboard (RLS still applies)
-- =====================================================================================
alter publication supabase_realtime add table
  public.employee_locations, public.employee_status, public.attendance, public.customer_visits,
  public.collection_transactions, public.expense_claims, public.audit_logs;
