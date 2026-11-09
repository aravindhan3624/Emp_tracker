// FieldForce 360 - tenant configuration, module catalog and pricing plans.
// Everything here is editable from settings.html (Admin Console).
// Prototype storage: localStorage. Production: Supabase tables tenants / tenant_settings / plans (see db/schema.sql).
(function () {
  var CFG_KEY = 'ff360.config.v1', PLANS_KEY = 'ff360.plans.v1';

  // status: 'live' = works in this build, 'planned' = on roadmap (shown as "Coming soon")
  var MODULES = [
    { id: 'attendance', name: 'GPS attendance', cat: 'Attendance', status: 'live', desc: 'Check-in / check-out with GPS location and time' },
    { id: 'selfie', name: 'Selfie attendance', cat: 'Attendance', status: 'live', desc: 'Front-camera selfie captured at check-in' },
    { id: 'liveTracking', name: 'Live GPS tracking', cat: 'Tracking', status: 'live', desc: 'Live map, route history, distance travelled (duty hours only)' },
    { id: 'visits', name: 'Customer visits & geofence', cat: 'Field operations', status: 'live', desc: 'Assigned visits, geofence verification, outcomes' },
    { id: 'customForms', name: 'Custom visit forms', cat: 'Field operations', status: 'live', desc: 'Configurable visit types, outcomes and form fields' },
    { id: 'collections', name: 'Loan collections', cat: 'BFSI', status: 'live', desc: 'EMI collection, receipts, targets, overdue accounts' },
    { id: 'expenses', name: 'Expense & travel claims', cat: 'HR', status: 'live', desc: 'Per-km travel allowance and expense claims with approval' },
    { id: 'reports', name: 'Reports & CSV export', cat: 'Analytics', status: 'live', desc: 'Attendance, visits, collections, audit log exports' },
    { id: 'alerts', name: 'Smart alerts', cat: 'Analytics', status: 'live', desc: 'Absent, late, GPS off, stale location, geofence breach' },
    { id: 'leaves', name: 'Leave management', cat: 'HR', status: 'planned', desc: 'Leave requests and manager approval' },
    { id: 'tasks', name: 'Task assignment', cat: 'Field operations', status: 'planned', desc: 'Ad-hoc tasks with due dates and proof photos' },
    { id: 'offline', name: 'Offline mode', cat: 'Tracking', status: 'planned', desc: 'Capture visits without network, auto-sync later' },
    { id: 'routeOpt', name: 'Route optimisation', cat: 'Field operations', status: 'planned', desc: 'Best visit order to cut travel time' },
    { id: 'faceMatch', name: 'AI face match', cat: 'Attendance', status: 'planned', desc: 'Match selfie with employee photo to stop proxy attendance' },
    { id: 'api', name: 'API & LMS integration', cat: 'Integration', status: 'planned', desc: 'REST API / webhooks for loan management & core banking' },
    { id: 'whiteLabel', name: 'White-label app', cat: 'Enterprise', status: 'planned', desc: 'Your brand name, logo and colours on the APK' }
  ];

  var DEFAULT_PLANS = {
    currency: '₹', gstPct: 18, annualDiscountPct: 15, trialDays: 14,
    plans: [
      { id: 'starter', name: 'Starter', price: 99, minSeats: 5, tagline: 'Attendance & live tracking for small teams',
        modules: ['attendance', 'selfie', 'liveTracking', 'reports', 'alerts'] },
      { id: 'pro', name: 'Professional', price: 199, minSeats: 10, tagline: 'Visits, custom forms and expenses', popular: true,
        modules: ['attendance', 'selfie', 'liveTracking', 'reports', 'alerts', 'visits', 'customForms', 'expenses', 'leaves', 'tasks'] },
      { id: 'bfsi', name: 'BFSI Enterprise', price: 349, minSeats: 25, tagline: 'Banks, NBFCs & MFIs: collections and compliance',
        modules: ['attendance', 'selfie', 'liveTracking', 'reports', 'alerts', 'visits', 'customForms', 'expenses', 'leaves', 'tasks', 'collections', 'offline', 'routeOpt', 'faceMatch', 'api', 'whiteLabel'] }
    ]
  };

  var DEFAULT_CONFIG = {
    company: { name: 'Demo Finance Ltd (NBFC)', appName: 'FieldForce 360', logoText: 'FF', brandColor: '#0b3b8c', industry: 'NBFC' },
    subscription: { plan: 'bfsi', seats: 25, billing: 'annual' },
    modules: { attendance: true, selfie: true, liveTracking: true, visits: true, customForms: true, collections: true, expenses: true, reports: true, alerts: true },
    tracking: { intervalSec: 30, geofenceM: 150, outsideGeofence: 'flag', branchRadiusM: 500, workStart: '09:00', workEnd: '19:00', lateAfter: '09:30', autoStopAtWorkEnd: true, staleAlertMin: 3, retentionDays: 90 },
    terminology: { employee: 'Field Officer', customer: 'Customer', visit: 'Visit' },
    visitTypes: [
      { id: 'COLLECTION', label: 'EMI Collection', abbr: '₹', collectsPayment: true,
        outcomes: ['Paid in full', 'Partial payment', 'Promise to pay', 'Customer not available', 'Refused to pay'],
        fields: [{ key: 'ptpDate', label: 'Promise-to-pay date', type: 'date', required: false }] },
      { id: 'ADDRESS', label: 'Address Verification', abbr: 'AV', collectsPayment: false,
        outcomes: ['Verified — positive', 'Discrepancy found', 'Customer not available', 'Address not found'],
        fields: [{ key: 'residence', label: 'Residence type', type: 'select', options: ['Owned', 'Rented', 'Family owned', 'Company provided'], required: true },
          { key: 'yearsAtAddress', label: 'Years at address', type: 'number', required: false }] },
      { id: 'DOCUMENT', label: 'Document Verification', abbr: 'DV', collectsPayment: false,
        outcomes: ['Documents verified', 'Documents pending', 'Mismatch found', 'Customer not available'],
        fields: [{ key: 'docs', label: 'Documents seen', type: 'text', required: true }] },
      { id: 'NEWLOAN', label: 'New Loan Verification', abbr: 'NL', collectsPayment: false,
        outcomes: ['Recommended', 'Not recommended', 'Customer not available'],
        fields: [{ key: 'business', label: 'Business / employment', type: 'text', required: true },
          { key: 'income', label: 'Monthly income (₹)', type: 'number', required: false }] }
    ],
    collections: { paymentModes: ['UPI', 'Cash', 'Cheque'], receiptPrefix: 'RCPT', maxAmountPctOfDue: 200 },
    expenses: { perKmRate: 4, categories: ['Fuel', 'Food', 'Parking / toll', 'Phone', 'Other'], maxClaim: 2000 }
  };

  function read(key, def) {
    try { var v = JSON.parse(localStorage.getItem(key)); if (v) return merge(JSON.parse(JSON.stringify(def)), v); } catch (e) {}
    return JSON.parse(JSON.stringify(def));
  }
  // shallow-per-section merge so new defaults appear after upgrades
  function merge(def, v) {
    Object.keys(v).forEach(function (k) {
      def[k] = (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && v[k] && typeof v[k] === 'object' && !Array.isArray(v[k])) ? Object.assign(def[k], v[k]) : v[k];
    });
    return def;
  }

  var CONFIG = {
    CFG_KEY: CFG_KEY, PLANS_KEY: PLANS_KEY, MODULES: MODULES, DEFAULT_CONFIG: DEFAULT_CONFIG, DEFAULT_PLANS: DEFAULT_PLANS,
    cfg: read(CFG_KEY, DEFAULT_CONFIG),
    pricing: read(PLANS_KEY, DEFAULT_PLANS),
    reload: function () { this.cfg = read(CFG_KEY, DEFAULT_CONFIG); this.pricing = read(PLANS_KEY, DEFAULT_PLANS); },
    saveCfg: function () { try { localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg)); } catch (e) {} },
    savePlans: function () { try { localStorage.setItem(PLANS_KEY, JSON.stringify(this.pricing)); } catch (e) {} },
    resetAll: function () { try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(PLANS_KEY); } catch (e) {} this.reload(); },
    plan: function (id) { var p = this.pricing.plans; return p.find(function (x) { return x.id === (id || CONFIG.cfg.subscription.plan); }) || p[0]; },
    inPlan: function (m) { return this.plan().modules.indexOf(m) >= 0; },
    // a module is on only if the plan includes it AND the tenant switched it on
    on: function (m) { return !!this.cfg.modules[m] && this.inPlan(m); },
    visitType: function (id) { return this.cfg.visitTypes.find(function (t) { return t.id === id; }) || { id: id, label: id, abbr: '?', outcomes: ['Completed'], fields: [] }; },
    quote: function (planId, seats, billing) {
      var p = this.plan(planId), pr = this.pricing, s = Math.max(seats, p.minSeats || 1);
      var unit = billing === 'annual' ? p.price * (1 - pr.annualDiscountPct / 100) : p.price;
      var months = billing === 'annual' ? 12 : 1, sub = unit * s * months, gst = sub * pr.gstPct / 100;
      return { plan: p, seats: s, unit: unit, months: months, subtotal: sub, gst: gst, total: sub + gst };
    },
    applyBrand: function (doc) {
      doc = doc || document;
      doc.documentElement.style.setProperty('--brand', this.cfg.company.brandColor);
      var m = doc.querySelector('meta[name=theme-color]'); if (m) m.content = this.cfg.company.brandColor;
    }
  };
  window.CONFIG = CONFIG;
})();
