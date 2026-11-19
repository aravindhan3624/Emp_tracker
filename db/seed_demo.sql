-- FieldForce 360 — demo company (run AFTER schema.sql, in Supabase → SQL Editor).
--
-- BEFORE RUNNING: edit the four values in the "YOUR LOGINS" block below.
--   * admin_email  : the email the MD / admin will sign in with on the dashboard (gets an email code)
--   * emp1..3_phone: real mobile numbers (with +91) that will sign in on the employee app (SMS OTP),
--                    or test numbers you add under Authentication → Sign In / Providers → Phone.
-- Everything else is fictional demo data (Chennai branches, customers and loans).
-- Safe to re-run: it deletes and recreates the demo company.

do $$
declare
  -- ===== YOUR LOGINS =====
  admin_email text := 'md@example.com';
  emp1_phone  text := '+919000000001';
  emp2_phone  text := '+919000000002';
  emp3_phone  text := '+919000000003';
  -- =======================
  t uuid; tng uuid; ady uuid; ann uuid;
  e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid;
  vt_col uuid; vt_adr uuid; vt_doc uuid; vt_new uuid;
  r record; c uuid; l uuid;
begin
  perform set_config('ff.allow_purge', 'on', true);          -- lets the re-run remove old GPS points / receipts
  delete from public.tenants where name = 'Demo Finance Ltd (NBFC)';

  insert into public.tenants (name, industry, plan_id, seats, billing, status)
  values ('Demo Finance Ltd (NBFC)', 'NBFC', 'bfsi', 25, 'annual', 'trial') returning id into t;
  insert into public.tenant_settings (tenant_id, app_config) values (t, null);   -- null = app defaults until the admin saves

  insert into public.branches (tenant_id, code, name, lat, lng) values (t, 'TNG', 'T. Nagar Branch', 13.0418, 80.2341) returning id into tng;
  insert into public.branches (tenant_id, code, name, lat, lng) values (t, 'ADY', 'Adyar Branch', 13.0063, 80.2574) returning id into ady;
  insert into public.branches (tenant_id, code, name, lat, lng) values (t, 'ANN', 'Anna Nagar Branch', 13.0850, 80.2101) returning id into ann;

  insert into public.employees (tenant_id, emp_code, name, title, role, branch_id, email, color)
    values (t, 'MD001', 'Managing Director', 'Managing Director', 'owner', tng, admin_email, '#0b3b8c');
  insert into public.employees (tenant_id, emp_code, name, title, role, branch_id, phone, color)
    values (t, 'EMP001', 'Arun Kumar', 'Field Officer', 'field', tng, emp1_phone, '#2563eb') returning id into e1;
  insert into public.employees (tenant_id, emp_code, name, title, role, branch_id, phone, color)
    values (t, 'EMP002', 'Priya Sundaram', 'Collection Executive', 'field', ady, emp2_phone, '#db2777') returning id into e2;
  insert into public.employees (tenant_id, emp_code, name, title, role, branch_id, phone, color)
    values (t, 'EMP003', 'Karthik Raman', 'Field Officer', 'field', ann, emp3_phone, '#16a34a') returning id into e3;
  insert into public.employees (tenant_id, emp_code, name, title, role, branch_id, phone, color)
    values (t, 'EMP004', 'Divya Mohan', 'Verification Officer', 'field', tng, null, '#ea580c') returning id into e4;
  insert into public.employees (tenant_id, emp_code, name, title, role, branch_id, phone, color)
    values (t, 'EMP005', 'Suresh Babu', 'Collection Executive', 'field', ady, null, '#7c3aed') returning id into e5;

  insert into public.visit_types (tenant_id, code, label) values (t, 'COLLECTION', 'EMI Collection') returning id into vt_col;
  insert into public.visit_types (tenant_id, code, label) values (t, 'ADDRESS', 'Address Verification') returning id into vt_adr;
  insert into public.visit_types (tenant_id, code, label) values (t, 'DOCUMENT', 'Document Verification') returning id into vt_doc;
  insert into public.visit_types (tenant_id, code, label) values (t, 'NEWLOAN', 'New Loan Verification') returning id into vt_new;

  for r in select * from (values
    (1,'EMP001','Lakshmi Narayanan','LN-TNG-20431','COLLECTION','12, Usman Road, T. Nagar',13.0386,80.2335,12500,5),
    (2,'EMP001','Mohammed Rafi','APP-TNG-7781','ADDRESS','4/2, Pondy Bazaar, T. Nagar',13.0428,80.2400,0,0),
    (3,'EMP001','Kavitha Rajan','LN-TNG-19870','COLLECTION','27, Lake View Rd, West Mambalam',13.0352,80.2226,8750,12),
    (4,'EMP001','S. Venkatesh','APP-TNG-7790','NEWLOAN','9, Arcot Road, Kodambakkam',13.0497,80.2245,0,0),
    (5,'EMP001','Meena Gopal','LN-TNG-18112','COLLECTION','33, Jones Road, Saidapet',13.0222,80.2238,15000,30),
    (1,'EMP002','Anitha Joseph','LN-ADY-30211','COLLECTION','6th Ave, Besant Nagar',13.0003,80.2667,9000,3),
    (2,'EMP002','Ramesh Iyer','LN-ADY-30180','COLLECTION','ECR Link Rd, Thiruvanmiyur',12.9830,80.2594,11200,18),
    (3,'EMP002','Farida Begum','APP-ADY-5530','DOCUMENT','Kotturpuram Main Rd',13.0186,80.2420,0,0),
    (4,'EMP002','Joseph Antony','LN-ADY-29954','COLLECTION','2nd Ave, Indira Nagar',12.9940,80.2510,6500,7),
    (1,'EMP003','Bharath Kumar','LN-ANN-41022','COLLECTION','AC Block, Anna Nagar West',13.0878,80.2010,14000,9),
    (2,'EMP003','Sangeetha P','APP-ANN-6610','ADDRESS','Shenoy Nagar Main Rd',13.0790,80.2250,0,0),
    (3,'EMP003','Ganesh Prabhu','LN-ANN-40877','COLLECTION','Aminjikarai Market St',13.0710,80.2200,7800,21),
    (4,'EMP003','Revathi Shankar','LN-ANN-40501','COLLECTION','Phase 2, Mogappair',13.0837,80.1767,10500,4),
    (1,'EMP004','Harish Chandran','LN-TNG-20555','COLLECTION','11th Ave, Ashok Nagar',13.0370,80.2120,9900,6),
    (2,'EMP004','Nirmala Devi','APP-TNG-7802','DOCUMENT','Sector 9, KK Nagar',13.0390,80.1990,0,0),
    (3,'EMP004','Prakash Rao','LN-TNG-20190','COLLECTION','100 Ft Rd, Vadapalani',13.0500,80.2120,12000,14),
    (1,'EMP005','Usha Rani','LN-ADY-29700','COLLECTION','Luz Church Rd, Mylapore',13.0339,80.2697,8000,11),
    (2,'EMP005','Dinesh Kumar','LN-ADY-29811','COLLECTION','RA Puram 3rd Main Rd',13.0270,80.2550,5500,2)
  ) as v(sort, emp, cust, loan, vtype, addr, lat, lng, due, od)
  loop
    insert into public.customers (tenant_id, name, address, lat, lng) values (t, r.cust, r.addr, r.lat, r.lng) returning id into c;
    insert into public.loan_accounts (tenant_id, customer_id, loan_ref, emi_due, overdue_days) values (t, c, r.loan, r.due, r.od) returning id into l;
    insert into public.customer_visits (tenant_id, employee_id, customer_id, loan_account_id, visit_type_id, scheduled_date, sort)
    values (t,
      case r.emp when 'EMP001' then e1 when 'EMP002' then e2 when 'EMP003' then e3 when 'EMP004' then e4 else e5 end,
      c, l,
      case r.vtype when 'COLLECTION' then vt_col when 'ADDRESS' then vt_adr when 'DOCUMENT' then vt_doc else vt_new end,
      (now() at time zone 'Asia/Kolkata')::date, r.sort);
  end loop;

  raise notice 'Demo company created: %', t;
end $$;
