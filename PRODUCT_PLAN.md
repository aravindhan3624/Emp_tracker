# FieldForce 360 — configurable SaaS product plan

A white-label field-workforce platform that each customer company (bank, NBFC, MFI, pharma, FMCG, field service, …) configures for itself, and that you sell per user per month.

## 1. Feature catalogue

Status: ✅ works in this build · ◷ planned (shown as "Coming soon").

| Area | Feature | Status | Starter ₹99 | Pro ₹199 | BFSI ₹349 |
|---|---|---|:-:|:-:|:-:|
| Attendance | GPS check-in / check-out, late marking, working hours | ✅ | ✓ | ✓ | ✓ |
| Attendance | Selfie attendance (front camera) | ✅ | ✓ | ✓ | ✓ |
| Attendance | AI face match against employee photo | ◷ | | | ✓ |
| Tracking | Live map, route history, km travelled, auto-stop at shift end | ✅ | ✓ | ✓ | ✓ |
| Tracking | Offline capture with auto-sync | ◷ | | | ✓ |
| Field ops | Assigned visits with geofence verification (flag or block) | ✅ | | ✓ | ✓ |
| Field ops | Custom visit types, outcomes and form fields | ✅ | | ✓ | ✓ |
| Field ops | Task assignment with proof photos | ◷ | | ✓ | ✓ |
| Field ops | Route optimisation | ◷ | | | ✓ |
| BFSI | EMI collection, receipts, targets, overdue accounts | ✅ | | | ✓ |
| HR | Expense claims + per-km travel allowance, manager approval | ✅ | | ✓ | ✓ |
| HR | Leave management | ◷ | | ✓ | ✓ |
| Analytics | Smart alerts (absent, late, GPS off, stale, geofence breach) | ✅ | ✓ | ✓ | ✓ |
| Analytics | Reports + CSV/Excel export, audit log | ✅ | ✓ | ✓ | ✓ |
| Integration | REST API / webhooks to loan management systems and core banking | ◷ | | | ✓ |
| Enterprise | White-label APK (your brand) | ◷ | | | ✓ |

Every price, plan, module-to-plan mapping, GST %, annual discount and trial length can be edited in **Admin Console → Pricing plans**. Market reference: Indian field-tracking apps charge about ₹30–₹250 per user per month.

## 2. What each customer can configure (Admin Console)

- **Branding:** company name, app name, logo initials, brand colour, industry.
- **Terminology:** rename Employee, Customer and Visit (e.g. "Delivery", "Outlet").
- **Plan and billing:** plan, number of users, monthly or annual billing, with a live quote including GST.
- **Modules:** switch each feature on or off. Only modules included in the plan can be switched on.
- **Tracking rules:** working hours, late-after time, GPS update interval, geofence radius, block or flag visits outside the geofence, distance from branch, stale-GPS alert, data retention days, auto-stop at shift end.
- **Visit types and forms:** add new types, with their own outcomes and fields (text, number, date, dropdown, required).
- **Collections and expenses:** payment modes, receipt prefix, amount cap, ₹ per km, expense categories, maximum claim.
- **Backup:** export or import all settings as JSON, or reset to defaults.

## 3. What I need from you

### Now: to connect a real database (free)
1. **Create a Supabase project.** Go to https://supabase.com, sign in with your GitHub account (aravindhan3624), click *New project*, and choose the **Mumbai (ap-south-1)** region.
2. **Run the schema.** Open *SQL Editor*, paste the contents of [`db/schema.sql`](db/schema.sql), and click *Run*. This creates all tables with company-by-company data isolation.
3. **Send me these two values** from *Project Settings → API*:
   - Project URL (`https://xxxx.supabase.co`)
   - `anon` public key

   ⚠️ **Do not** send the `service_role` key or the database password in chat.
4. **Decide:** keep the product name "FieldForce 360" or choose your own, and confirm or change the default prices.

### Later: to sell commercially
| Item | Why | Cost |
|---|---|---|
| Google Play Developer account | Publish the app on the Play Store | US$25 once |
| Domain name (e.g. fieldforce360.in) | Dashboard and pricing website | ~₹800/yr |
| Hosting for the dashboard (Vercel / Netlify / Supabase) | Free tier is fine to start | ₹0 → paid |
| Supabase Pro | Backups, more storage, no pausing (needed before real customers) | ~US$25/month |
| Razorpay account (business KYC) | Collect subscription payments | Per-transaction fee |
| Privacy policy + DPDP legal review | Required for employee location data | Lawyer fee |
| App signing key (I generate it; you keep it safe) | Release APK / Play Store | ₹0 |
| 1–2 Android test phones | Real GPS, camera and battery testing | — |

## 4. Next build steps (after you send the Supabase details)
1. Replace the local demo storage with Supabase. Add real login: employees sign in with mobile number and OTP, managers with email.
2. Add selfie upload to Supabase Storage and stream the live map in real time.
3. Add a company sign-up flow with trial → plan → Razorpay payment.
4. Add Android background location (foreground service) so tracking continues while the app is minimised.
5. Build a signed release APK and publish on the Play Store.

## Files
- `www/js/config.js`: module catalogue, default settings and plans
- `www/settings.html`: Admin Console
- `www/pricing.html`: public pricing page and cost calculator
- `db/schema.sql`: production database schema (PostgreSQL / Supabase) with Row Level Security
