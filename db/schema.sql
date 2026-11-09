-- FieldForce 360 — multi-tenant schema for Supabase (PostgreSQL 15+)
-- Run once in Supabase Dashboard → SQL Editor. Every business table carries tenant_id and is
-- protected by Row Level Security so one customer company can never read another's data.

create extension if not exists pgcrypto;

-- ============ Vendor-level: pricing plans ============
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
  price_per_user_month numeric(10,2) not null,
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

-- ============ Tenants (customer companies) ============
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  app_name text not null default 'FieldForce 360',
  logo_text text not null default 'FF',
  brand_color text not null default '#0b3b8c',
  industry text,
  plan_id text not null references public.plans(id) default 'starter',
  seats int not null default 5 check (seats > 0),
  billing text not null default 'monthly' check (billing in ('monthly','annual')),
  status text not null default 'trial' check (status in ('trial','active','suspended','cancelled')),
  trial_ends_at timestamptz default now() + interval '14 days',
  created_at timestamptz not null default now()
);

-- All configurable rules live here as JSON so new settings need no migration.
create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  modules jsonb not null default '{"attendance":true,"liveTracking":true,"reports":true,"alerts":true}',
  tracking jsonb not null default '{"intervalSec":30,"geofenceM":150,"outsideGeofence":"flag","branchRadiusM":500,"workStart":"09:00","workEnd":"19:00","lateAfter":"09:30","autoStopAtWorkEnd":true,"staleAlertMin":3,"retentionDays":90}',
  terminology jsonb not null default '{"employee":"Field Officer","customer":"Customer","visit":"Visit"}',
  collections jsonb not null default '{"paymentModes":["UPI","Cash","Cheque"],"receiptPrefix":"RCPT","maxAmountPctOfDue":200}',
  expenses jsonb not null default '{"perKmRate":4,"categories":["Fuel","Food","Parking / toll","Phone","Other"],"maxClaim":2000}',
  updated_at timestamptz not null default now()
);

create table public.visit_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  label text not null,
  abbr text not null default '•',
  collects_payment boolean not null default false,
  outcomes text[] not null default '{Completed}',
  fields jsonb not null default '[]',      -- [{key,label,type:text|number|date|select,options[],required}]
  sort int not null default 0,
  unique (tenant_id, code)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  lat double precision, lng double precision
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  emp_code text not null,
  name text not null,
  role text not null default 'field' check (role in ('owner','admin','manager','field')),
  branch_id uuid references public.branches(id),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, emp_code)
);

-- ============ Operations ============
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null default current_date,
  check_in_at timestamptz not null default now(),
  check_in_lat double precision, check_in_lng double precision, check_in_accuracy real,
  selfie_path text,                          -- Supabase Storage object path
  is_late boolean not null default false,
  check_out_at timestamptz, check_out_lat double precision, check_out_lng double precision,
  check_out_note text,
  unique (employee_id, work_date)
);

create table public.employee_locations (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  lat double precision not null, lng double precision not null,
  accuracy real, is_mock boolean not null default false
);
create index employee_locations_emp_time on public.employee_locations (employee_id, recorded_at desc);
create index employee_locations_tenant_time on public.employee_locations (tenant_id, recorded_at desc);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null, address text, phone text,
  lat double precision, lng double precision
);

create table public.loan_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  loan_ref text not null,
  emi_due numeric(12,2) not null default 0,
  overdue_days int not null default 0,
  unique (tenant_id, loan_ref)
);

create table public.customer_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  customer_id uuid not null references public.customers(id),
  loan_account_id uuid references public.loan_accounts(id),
  visit_type_id uuid not null references public.visit_types(id),
  scheduled_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  started_at timestamptz, start_lat double precision, start_lng double precision, start_distance_m int,
  flagged boolean not null default false,
  completed_at timestamptz, end_lat double precision, end_lng double precision,
  outcome text, remarks text,
  form_data jsonb not null default '{}'
);
create index customer_visits_emp_date on public.customer_visits (employee_id, scheduled_date);

create table public.collection_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid references public.customer_visits(id),
  employee_id uuid not null references public.employees(id),
  loan_account_id uuid references public.loan_accounts(id),
  amount numeric(12,2) not null check (amount > 0),
  mode text not null,
  receipt_no text not null,
  collected_at timestamptz not null default now(),
  lat double precision, lng double precision,
  unique (tenant_id, receipt_no)
);

create table public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  category text not null, amount numeric(10,2) not null check (amount > 0), note text,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  decided_by uuid references public.employees(id), decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.employees(id),
  action text not null, detail text,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_time on public.audit_logs (tenant_id, created_at desc);

-- ============ Row Level Security ============
-- Helpers read the signed-in user's employee row (security definer avoids RLS recursion).
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

alter table public.plans enable row level security;
alter table public.pricing_settings enable row level security;
create policy plans_read on public.plans for select using (true);              -- public pricing page
create policy pricing_read on public.pricing_settings for select using (true);

alter table public.tenants enable row level security;
create policy tenant_read on public.tenants for select using (id = public.my_tenant());
create policy tenant_admin_update on public.tenants for update using (id = public.my_tenant() and public.is_admin());

alter table public.tenant_settings enable row level security;
create policy settings_read on public.tenant_settings for select using (tenant_id = public.my_tenant());
create policy settings_admin on public.tenant_settings for update using (tenant_id = public.my_tenant() and public.is_admin());

-- Reference data: everyone in the tenant reads, admins write.
do $$ declare t text; begin
  foreach t in array array['visit_types','branches','employees','customers','loan_accounts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_read on public.%1$I for select using (tenant_id = public.my_tenant())', t);
    execute format('create policy %1$s_admin on public.%1$I for all using (tenant_id = public.my_tenant() and public.is_admin()) with check (tenant_id = public.my_tenant())', t);
  end loop;
end $$;

-- Operational data: field staff see and write only their own rows; managers see the whole tenant.
do $$ declare t text; begin
  foreach t in array array['attendance','employee_locations','customer_visits','collection_transactions','expense_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_read on public.%1$I for select using (tenant_id = public.my_tenant() and (employee_id = public.my_employee() or public.is_manager()))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert with check (tenant_id = public.my_tenant() and employee_id = public.my_employee())', t);
    execute format('create policy %1$s_update on public.%1$I for update using (tenant_id = public.my_tenant() and (employee_id = public.my_employee() or public.is_manager()))', t);
  end loop;
end $$;

alter table public.audit_logs enable row level security;
create policy audit_read on public.audit_logs for select using (tenant_id = public.my_tenant() and public.is_manager());
create policy audit_insert on public.audit_logs for insert with check (tenant_id = public.my_tenant());

-- Location points may only be written while the employee is checked in (no off-duty tracking).
create or replace function public.reject_off_duty_location() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from attendance a where a.employee_id = new.employee_id
                 and a.check_in_at <= new.recorded_at and a.check_out_at is null) then
    raise exception 'Location rejected: employee is not on duty';
  end if;
  return new;
end $$;
create trigger employee_locations_on_duty before insert on public.employee_locations
  for each row execute function public.reject_off_duty_location();

-- ============ Data retention ============
-- Deletes location history older than each tenant's tracking.retentionDays.
-- Schedule daily with pg_cron:  select cron.schedule('purge-locations','15 2 * * *','select public.purge_old_locations()');
create or replace function public.purge_old_locations() returns void language sql security definer set search_path = public as $$
  delete from employee_locations l using tenant_settings s
  where l.tenant_id = s.tenant_id
    and l.recorded_at < now() - make_interval(days => coalesce((s.tracking->>'retentionDays')::int, 90));
$$;

-- Live map: stream new location points to the dashboard.
alter publication supabase_realtime add table public.employee_locations, public.attendance, public.customer_visits;
