# FieldForce 360 — connect the real cloud database (Phase 1)

Until this is done, the public demo keeps data **inside each browser only**. After these steps, every
phone sends its check-in, GPS trail, visits, receipts and expenses to one PostgreSQL database, and
the MD sees them live on the dashboard from any computer.

Time needed: about 20 minutes. Cost: ₹0 (Supabase Free plan).

## 1. Create the project (you)
1. Go to https://supabase.com, sign up (GitHub login is fine), click **New project**.
2. Name: `fieldforce360` · Region: **South Asia (Mumbai)** · set a database password and **keep it to yourself**.
3. Wait about 2 minutes until the project is ready.

## 2. Create the tables (you, copy-paste)
1. Left menu → **SQL Editor** → **New query**.
2. Paste the whole of [`db/schema.sql`](db/schema.sql) → **Run**. It should end with "Success. No rows returned".
3. Open [`db/seed_demo.sql`](db/seed_demo.sql). In the **YOUR LOGINS** block, change:
   - `admin_email`: the MD's email (used to sign in to the dashboard),
   - `emp1_phone`..`emp3_phone`: mobile numbers that will sign in to the employee app (format `+919840012345`).
4. Paste it into a new query → **Run**. You now have a demo company with 3 branches, 5 employees and 18 customer visits for today.

## 3. Sign-in settings (you)
**Authentication → URL Configuration**
- Site URL: `https://fieldforce360-demo.netlify.app`
- Redirect URLs (add all three): `https://fieldforce360-demo.netlify.app/**`, `https://fieldforce360.pages.dev/**`, `http://localhost:8360/**`

**Email OTP (managers):** works out of the box. Supabase's built-in mailer only sends a few emails per hour,
which is fine for testing. The email contains a sign-in link: click it on the same computer. To get a typed
6-digit code instead, go to **Authentication → Emails → Magic Link** and add `{{ .Token }}` to the template.

**SMS OTP (employees):** **Authentication → Sign In / Providers → Phone** → enable.
- Supabase needs an SMS provider. Twilio's free trial works (it only sends to numbers you verify in Twilio).
  For India production use MSG91 / Textlocal (DLT registration required). That comes later in the plan.
- **Free testing without real SMS:** under **Test Phone Numbers and OTPs** add lines like
  `919000000001=123456` and set an expiry date. That phone then signs in with code `123456` and no SMS is sent.
  Remove these before go-live, because anyone who knows them can sign in.

## 4. Send me two values (you → me)
**Project Settings → API** (or **Data API**):
- **Project URL** (like `https://abcdxyz.supabase.co`)
- **anon / publishable key** (a long `eyJ...` or `sb_publishable_...` value)

These two are safe to share and are meant to sit inside the web page. Row Level Security protects the data.
**Never share the `service_role` / secret key or the database password**, with me or anyone.

I then put them in [`www/js/backend-config.js`](www/js/backend-config.js), redeploy both URLs and rebuild the APK.

## How to test once it is live
1. Laptop: open `https://fieldforce360-demo.netlify.app/admin` → sign in with the MD email.
2. Phone: open `https://fieldforce360-demo.netlify.app/app` (or install the APK) → sign in with a registered mobile.
3. Phone: **Start Duty** → allow location → walk around. The laptop map moves within seconds.
4. To replay the demo the next day: dashboard → **Reset demo day**.

## What the database records (traceability)
| Table | What it holds | Who can see it |
|---|---|---|
| `tenants`, `tenant_settings` | Each customer company, its plan and full app configuration | Its own staff |
| `branches`, `employees`, `customers`, `loan_accounts`, `visit_types` | Master data | Company staff; only admins can change it |
| `attendance` | Check-in/out time, GPS, accuracy, **selfie** (private Storage), late flag, device info | The employee and their managers |
| `employee_locations` | Every GPS point, with device time **and** server time (shows offline uploads), accuracy, sim/real. **Append-only** | The employee and their managers |
| `employee_status` | Live GPS health (ok / off / permission denied) | The employee and their managers |
| `customer_visits` | Planned visit → start position and distance from customer → geofence flag → outcome, remarks, custom form answers | The employee and their managers |
| `collection_transactions` | Money receipts with unique receipt number, GPS and time. **Append-only** (cannot be edited or deleted) | The employee and their managers |
| `expense_claims` | Claims, with who approved or rejected them and when, stamped by the server | The employee and their managers |
| `audit_logs` | Business events (login, check-in, visit start, GPS off, approvals…) with the real signed-in user | Managers |
| `change_log` | **Every** insert/update/delete on business tables, with old and new values, who and when | Managers |

Database rules that apply whatever the app sends:
- GPS points are **rejected when the employee is off duty** (privacy).
- One company can never read another's data (Row Level Security on every table).
- Only pre-registered employees can use the app. Anyone else who gets an OTP sees no data.
- Location history is purged after the company's retention period (`purge_old_locations()`, default 90 days).
