// FieldForce 360 - Admin Console. Every input is bound to CONFIG.cfg (data-c) or CONFIG.pricing (data-p) by path.
// Changes save instantly; the mobile app and dashboard pick them up live (storage event).
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var inr = function (n) { return CONFIG.pricing.currency + Math.round(n || 0).toLocaleString('en-IN'); };
  var cfg = function () { return CONFIG.cfg; }, pr = function () { return CONFIG.pricing; };

  function get(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function set(o, path, v) { var ks = path.split('.'), last = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[last] = v; }

  // ---- input builders ----
  function inp(src, path, label, type, extra) {
    var o = src === 'c' ? cfg() : pr(), v = get(o, path);
    return '<label class="f">' + label + '<input data-' + src + '="' + path + '" data-kind="' + (type === 'number' ? 'num' : 'text') + '" type="' + (type || 'text') + '" value="' + esc(v) + '"' + (extra || '') + '></label>';
  }
  function sel(src, path, label, opts) {
    var o = src === 'c' ? cfg() : pr(), v = get(o, path);
    return '<label class="f">' + label + '<select data-' + src + '="' + path + '" data-kind="text">' + opts.map(function (x) { var val = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x; return '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>';
  }
  function chk(src, path, label) {
    var o = src === 'c' ? cfg() : pr();
    return '<label class="chk"><input type="checkbox" data-' + src + '="' + path + '" data-kind="bool"' + (get(o, path) ? ' checked' : '') + '> ' + label + '</label>';
  }
  function list(src, path, label, sep) {
    var o = src === 'c' ? cfg() : pr(), v = get(o, path) || [];
    return sep === 'lines'
      ? '<label class="f">' + label + ' <span style="font-weight:400">(one per line)</span><textarea data-' + src + '="' + path + '" data-kind="lines">' + esc(v.join('\n')) + '</textarea></label>'
      : '<label class="f">' + label + ' <span style="font-weight:400">(comma separated)</span><input data-' + src + '="' + path + '" data-kind="list" value="' + esc(v.join(', ')) + '"></label>';
  }

  // ---- sections ----
  function company() {
    return '<section class="card" id="company"><h2>Company &amp; branding</h2><p class="hint">Shown on the employee app, dashboard and receipts. Terminology lets other industries rename things (e.g. "Visit" → "Delivery", "Customer" → "Outlet").</p><div class="grid">' +
      inp('c', 'company.name', 'Company name') + inp('c', 'company.appName', 'App name') + inp('c', 'company.logoText', 'Logo initials', 'text', ' maxlength="3"') +
      inp('c', 'company.brandColor', 'Brand colour', 'color') +
      sel('c', 'company.industry', 'Industry', ['Bank', 'NBFC', 'Microfinance (MFI)', 'Insurance', 'Pharma / medical reps', 'FMCG / distribution', 'Field service / AMC', 'Logistics & delivery', 'Real estate', 'Other']) +
      inp('c', 'terminology.employee', 'Employee is called') + inp('c', 'terminology.customer', 'Customer is called') + inp('c', 'terminology.visit', 'Visit is called') +
      '</div></section>';
  }

  function subscription() {
    var s = cfg().subscription;
    return '<section class="card" id="subscription"><h2>Plan &amp; billing</h2><p class="hint">The plan decides which modules can be switched on. Prices come from the Pricing plans section below.</p><div class="grid">' +
      sel('c', 'subscription.plan', 'Current plan', pr().plans.map(function (p) { return [p.id, p.name + ' — ' + inr(p.price) + '/user/month']; })) +
      inp('c', 'subscription.seats', 'Number of users (seats)', 'number', ' min="1"') +
      sel('c', 'subscription.billing', 'Billing cycle', [['monthly', 'Monthly'], ['annual', 'Annual (' + pr().annualDiscountPct + '% off)']]) +
      '</div><div class="quote" id="quote"></div></section>';
  }
  function quoteHtml() {
    var s = cfg().subscription, q = CONFIG.quote(s.plan, Number(s.seats) || 1, s.billing);
    return '<div><span>Price per user / month</span><b>' + inr(q.unit) + '</b></div><div><span>Billed users</span><b>' + q.seats + (q.seats > s.seats ? ' <small style="font-size:11px;color:var(--warn)">(plan minimum)</small>' : '') + '</b></div>' +
      '<div><span>Subtotal (' + (q.months === 12 ? 'per year' : 'per month') + ')</span><b>' + inr(q.subtotal) + '</b></div><div><span>GST ' + pr().gstPct + '%</span><b>' + inr(q.gst) + '</b></div><div style="background:#e7f6ec"><span>Total ' + (q.months === 12 ? 'per year' : 'per month') + '</span><b>' + inr(q.total) + '</b></div>';
  }

  function modules() {
    var plan = CONFIG.plan(), cats = {};
    CONFIG.MODULES.forEach(function (m) { (cats[m.cat] = cats[m.cat] || []).push(m); });
    var html = '<section class="card" id="modules"><h2>Modules</h2><p class="hint">Turn features on or off for this company. Greyed-out switches are not included in the <b>' + esc(plan.name) + '</b> plan.</p>';
    Object.keys(cats).forEach(function (c) {
      html += '<div style="font-weight:600;margin:12px 0 2px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em">' + c + '</div>';
      cats[c].forEach(function (m) {
        var inPlan = plan.modules.indexOf(m.id) >= 0, live = m.status === 'live';
        var needs = pr().plans.find(function (p) { return p.modules.indexOf(m.id) >= 0; });
        var badge = !live ? '<span class="tag">Coming soon</span>' : !inPlan ? '<span class="tag warn">' + (needs ? 'Needs ' + esc(needs.name) : 'Not in any plan') + '</span>' : cfg().modules[m.id] ? '<span class="tag ok">On</span>' : '<span class="tag">Off</span>';
        html += '<div class="mod"><div class="t"><b>' + m.name + '</b> ' + badge + '<div>' + m.desc + '</div></div><label class="switch"><input type="checkbox" data-c="modules.' + m.id + '" data-kind="bool"' + (cfg().modules[m.id] && inPlan && live ? ' checked' : '') + (inPlan && live ? '' : ' disabled') + '><span></span></label></div>';
      });
    });
    return html + '</section>';
  }

  function tracking() {
    return '<section class="card" id="tracking"><h2>Tracking &amp; attendance rules</h2><p class="hint">Location is only collected between Start Duty and End Duty. These rules apply to every employee.</p><div class="grid">' +
      inp('c', 'tracking.workStart', 'Working hours start', 'time') + inp('c', 'tracking.workEnd', 'Working hours end', 'time') + inp('c', 'tracking.lateAfter', 'Mark late after', 'time') +
      inp('c', 'tracking.intervalSec', 'GPS update interval (seconds)', 'number', ' min="10" max="600"') +
      inp('c', 'tracking.geofenceM', 'Customer geofence radius (m)', 'number', ' min="25" max="2000"') +
      sel('c', 'tracking.outsideGeofence', 'Visit started outside geofence', [['flag', 'Allow but flag for review'], ['block', 'Block the visit']]) +
      inp('c', 'tracking.branchRadiusM', 'Check-in distance alert from branch (m)', 'number', ' min="50"') +
      inp('c', 'tracking.staleAlertMin', 'Alert if no GPS update for (minutes)', 'number', ' min="1"') +
      inp('c', 'tracking.retentionDays', 'Keep location history for (days)', 'number', ' min="7"') +
      '</div><div style="margin-top:12px">' + chk('c', 'tracking.autoStopAtWorkEnd', 'Automatically end duty and stop tracking at the end of working hours') + '</div></section>';
  }

  function fieldRows(i) {
    return (cfg().visitTypes[i].fields || []).map(function (f, j) {
      var b = 'visitTypes.' + i + '.fields.' + j + '.';
      return '<tr><td><input data-c="' + b + 'label" data-kind="text" value="' + esc(f.label) + '"></td><td><select data-c="' + b + 'type" data-kind="text">' + ['text', 'number', 'date', 'select'].map(function (t) { return '<option' + (f.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></td>' +
        '<td><input data-c="' + b + 'options" data-kind="list" value="' + esc((f.options || []).join(', ')) + '" placeholder="for select: A, B, C"' + (f.type === 'select' ? '' : ' disabled') + '></td>' +
        '<td style="text-align:center"><input type="checkbox" data-c="' + b + 'required" data-kind="bool"' + (f.required ? ' checked' : '') + '></td><td><button class="btn danger" data-act="delField" data-i="' + i + '" data-j="' + j + '">✕</button></td></tr>';
    }).join('');
  }
  function visits() {
    var html = '<section class="card" id="visits"><h2>Visit types &amp; forms</h2><p class="hint">Each visit type has its own outcomes and form fields that the employee fills in at the customer location.</p>';
    cfg().visitTypes.forEach(function (t, i) {
      var b = 'visitTypes.' + i + '.';
      html += '<div class="vt"><h3><span>' + esc(t.label) + ' <span class="tag">' + esc(t.id) + '</span></span><button class="btn danger" data-act="delType" data-i="' + i + '">Delete type</button></h3><div class="grid">' +
        inp('c', b + 'label', 'Name') + inp('c', b + 'abbr', 'Icon text (1–2 chars)', 'text', ' maxlength="2"') +
        '<div style="align-self:end">' + chk('c', b + 'collectsPayment', 'Collects payment (needs Loan collections module)') + '</div></div>' +
        '<div style="margin-top:10px">' + list('c', b + 'outcomes', 'Outcomes', 'lines') + '</div>' +
        '<div style="margin-top:10px;font-size:12.5px;color:var(--muted);font-weight:500">Form fields</div><table><thead><tr><th>Label</th><th style="width:110px">Type</th><th>Options</th><th style="width:70px">Required</th><th style="width:40px"></th></tr></thead><tbody>' + fieldRows(i) + '</tbody></table>' +
        '<button class="btn" style="margin-top:8px" data-act="addField" data-i="' + i + '">+ Add field</button></div>';
    });
    return html + '<button class="btn primary" data-act="addType">+ Add visit type</button></section>';
  }

  function money() {
    return '<section class="card" id="money"><h2>Collections &amp; expenses</h2><p class="hint">Used when the Loan collections and Expense claims modules are on.</p><div class="grid">' +
      list('c', 'collections.paymentModes', 'Payment modes') + inp('c', 'collections.receiptPrefix', 'Receipt number prefix') +
      inp('c', 'collections.maxAmountPctOfDue', 'Max amount (% of due)', 'number', ' min="100"') +
      inp('c', 'expenses.perKmRate', 'Travel allowance (₹ per km)', 'number', ' min="0" step="0.5"') +
      list('c', 'expenses.categories', 'Expense categories') + inp('c', 'expenses.maxClaim', 'Max per claim (₹)', 'number', ' min="0"') +
      '</div></section>';
  }

  function plans() {
    var P = pr().plans;
    var html = '<section class="card" id="plans"><h2>Pricing plans (vendor settings)</h2><p class="hint">Your price list as the software vendor. It drives the public pricing page, the plan picker above and which modules each customer can use.</p><div class="grid">' +
      inp('p', 'currency', 'Currency symbol', 'text', ' maxlength="3"') + inp('p', 'gstPct', 'GST %', 'number', ' min="0"') + inp('p', 'annualDiscountPct', 'Annual discount %', 'number', ' min="0" max="90"') + inp('p', 'trialDays', 'Free trial (days)', 'number', ' min="0"') +
      '</div><table style="margin-top:14px"><thead><tr><th>Plan name</th><th style="width:130px">Price / user / month</th><th style="width:100px">Min users</th><th>Tagline</th><th style="width:80px">Highlight</th><th style="width:40px"></th></tr></thead><tbody>' +
      P.map(function (p, i) {
        var b = 'plans.' + i + '.';
        return '<tr><td><input data-p="' + b + 'name" data-kind="text" value="' + esc(p.name) + '"></td><td><input type="number" min="0" data-p="' + b + 'price" data-kind="num" value="' + p.price + '"></td><td><input type="number" min="1" data-p="' + b + 'minSeats" data-kind="num" value="' + p.minSeats + '"></td>' +
          '<td><input data-p="' + b + 'tagline" data-kind="text" value="' + esc(p.tagline) + '"></td><td style="text-align:center"><input type="checkbox" data-p="' + b + 'popular" data-kind="bool"' + (p.popular ? ' checked' : '') + '></td><td><button class="btn danger" data-act="delPlan" data-i="' + i + '"' + (P.length < 2 ? ' disabled' : '') + '>✕</button></td></tr>';
      }).join('') + '</tbody></table><button class="btn" style="margin-top:8px" data-act="addPlan">+ Add plan</button>' +
      '<div style="margin-top:18px;font-weight:600">Modules included in each plan</div><div style="overflow-x:auto"><table class="matrix"><thead><tr><th>Module</th>' + P.map(function (p) { return '<th>' + esc(p.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      CONFIG.MODULES.map(function (m) {
        return '<tr><td>' + m.name + (m.status !== 'live' ? ' <span class="tag">soon</span>' : '') + '</td>' + P.map(function (p, i) { return '<td><input type="checkbox" data-planmod="' + i + '|' + m.id + '"' + (p.modules.indexOf(m.id) >= 0 ? ' checked' : '') + '></td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  function data() {
    return '<section class="card" id="data"><h2>Backup &amp; reset</h2><p class="hint">Download all settings as a file (e.g. to copy them to another company), restore from a file, or go back to the defaults.</p><div class="row">' +
      '<button class="btn" data-act="export">⬇ Export settings (JSON)</button><label class="btn" style="cursor:pointer">⬆ Import settings<input type="file" id="importFile" accept="application/json" hidden></label><button class="btn danger" data-act="reset">Reset to defaults</button></div></section>';
  }

  // ---- render & events ----
  function render() {
    var y = window.scrollY;
    CONFIG.applyBrand();
    $('#mark').textContent = cfg().company.logoText;
    $('#org').textContent = cfg().company.name + ' · ' + CONFIG.plan().name + ' plan';
    $('#main').innerHTML = company() + subscription() + modules() + tracking() + visits() + money() + plans() + data();
    $('#quote').innerHTML = quoteHtml();
    window.scrollTo(0, y);
  }
  function saved() { var s = $('#saved'); s.classList.add('show'); clearTimeout(saved.t); saved.t = setTimeout(function () { s.classList.remove('show'); }, 1200); }
  function persist(src) { if (src === 'p') CONFIG.savePlans(); else CONFIG.saveCfg(); saved(); }

  function readValue(el) {
    var k = el.dataset.kind;
    if (k === 'bool') return el.checked;
    if (k === 'num') return el.value === '' ? 0 : Number(el.value);
    if (k === 'list') return el.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (k === 'lines') return el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    return el.value;
  }
  function onEdit(e, structural) {
    var el = e.target;
    if (el.dataset.planmod) {
      var parts = el.dataset.planmod.split('|'), mods = pr().plans[Number(parts[0])].modules, at = mods.indexOf(parts[1]);
      if (el.checked && at < 0) mods.push(parts[1]); if (!el.checked && at >= 0) mods.splice(at, 1);
      persist('p'); render(); return;
    }
    var src = el.dataset.c != null ? 'c' : el.dataset.p != null ? 'p' : null; if (!src) return;
    set(src === 'c' ? cfg() : pr(), el.dataset[src], readValue(el));
    persist(src);
    if (structural) render(); else if ($('#quote')) $('#quote').innerHTML = quoteHtml();
  }
  document.addEventListener('input', function (e) { if (e.target.matches('input:not([type=checkbox]), textarea')) onEdit(e, false); });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'importFile') return importFile(e.target);
    if (e.target.matches('select, input[type=checkbox], input[type=color]')) onEdit(e, true);
    else if (e.target.matches('[data-c$=".label"], [data-p$=".name"], [data-p="annualDiscountPct"], [data-p="currency"]')) render();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, i = Number(b.dataset.i), V = cfg().visitTypes;
    if (a === 'addField') { V[i].fields = V[i].fields || []; V[i].fields.push({ key: 'f' + Date.now().toString(36), label: 'New field', type: 'text', required: false }); }
    else if (a === 'delField') V[i].fields.splice(Number(b.dataset.j), 1);
    else if (a === 'addType') V.push({ id: 'TYPE' + (V.length + 1), label: 'New visit type', abbr: 'NV', collectsPayment: false, outcomes: ['Completed', 'Customer not available'], fields: [] });
    else if (a === 'delType') { if (V.length < 2 || !confirm('Delete visit type "' + V[i].label + '"? Existing visits of this type will show its code instead.')) return; V.splice(i, 1); }
    else if (a === 'addPlan') { pr().plans.push({ id: 'plan' + Date.now().toString(36), name: 'New plan', price: 149, minSeats: 5, tagline: '', modules: ['attendance', 'liveTracking'] }); CONFIG.savePlans(); saved(); render(); return; }
    else if (a === 'delPlan') { var P = pr().plans; if (P.length < 2 || !confirm('Delete plan "' + P[i].name + '"?')) return; var gone = P.splice(i, 1)[0]; if (cfg().subscription.plan === gone.id) { cfg().subscription.plan = P[0].id; CONFIG.saveCfg(); } CONFIG.savePlans(); saved(); render(); return; }
    else if (a === 'export') {
      var blob = new Blob([JSON.stringify({ config: cfg(), pricing: pr() }, null, 2)], { type: 'application/json' });
      var l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'fieldforce360-settings.json'; l.click(); return;
    }
    else if (a === 'reset') { if (!confirm('Reset all settings and pricing to defaults?')) return; CONFIG.resetAll(); CONFIG.saveCfg(); CONFIG.savePlans(); saved(); render(); return; }
    CONFIG.saveCfg(); saved(); render();
  });
  function importFile(el) {
    var f = el.files[0]; if (!f) return;
    f.text().then(function (t) {
      var j = JSON.parse(t);
      if (!j.config || !j.pricing) throw new Error('Not a FieldForce 360 settings file');
      localStorage.setItem(CONFIG.CFG_KEY, JSON.stringify(j.config)); localStorage.setItem(CONFIG.PLANS_KEY, JSON.stringify(j.pricing));
      CONFIG.reload(); saved(); render();
    }).catch(function (err) { alert('Import failed: ' + err.message); });
    el.value = '';
  }
  window.addEventListener('storage', function (e) { if (e.key === CONFIG.CFG_KEY || e.key === CONFIG.PLANS_KEY) { CONFIG.reload(); render(); } });
  render();
})();
