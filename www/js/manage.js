// FieldForce 360 — Manage data (cloud mode): visit plan, employees, customers & loans, branches.
// Managers can plan visits; only owners/admins can change master data (enforced by the database).
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = FF.esc;
  var sb, tenantId, me, isAdmin = false;
  var D = { branches: [], employees: [], customers: [], types: [], visits: [] };
  var tab = 'visits', visitDate = todayStr(), empFilter = '', custSearch = '';
  var PALETTE = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#be123c', '#4f46e5', '#059669'];

  function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return todayStr(d); }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 3200); }
  function chk(r) { if (r.error) throw r.error; return r.data; }
  function errText(e) {
    var m = Cloud.errMsg(e);
    if (/employees_unique_phone/.test(m)) return 'Another employee already uses this mobile number.';
    if (/employees_unique_email/.test(m)) return 'Another employee already uses this email.';
    if (/employees_tenant_id_emp_code_key/.test(m)) return 'This employee code already exists.';
    if (/branches_tenant_id_code_key/.test(m)) return 'This branch code already exists.';
    if (/loan_accounts_tenant_id_loan_ref_key/.test(m)) return 'This loan / application number already exists.';
    if (/row-level security|permission denied/i.test(m)) return 'You do not have permission for this change (owner / admin only).';
    if (/violates foreign key/.test(m)) return 'This record is still used elsewhere (e.g. employees in a branch) and cannot be removed.';
    return m;
  }
  function normPhone(s) {
    var d = String(s || '').replace(/\D/g, ''); if (!d) return null;
    if (d.length === 10) d = '91' + d;
    return '+' + d;
  }
  function fmtPhone(p) { return p ? p.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2') : ''; }
  function initials(n) { return FF.initials(n || '?'); }
  function emp(id) { return D.employees.find(function (e) { return e.id === id; }); }
  function branch(id) { return D.branches.find(function (b) { return b.id === id; }); }
  function vtLabel(code) { return CONFIG.visitType(code).label; }
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }

  // ---------- boot ----------
  async function boot() {
    if (!window.Cloud || !Cloud.enabled) { $('#gate').innerHTML = 'Managing employees, customers and visits needs the cloud database. This page is not available in the offline demo.'; return; }
    var r = await Cloud.bootConfig();
    if (!r.ok) { $('#gate').innerHTML = esc(r.msg) + ' <a href="admin.html">Open the Manager dashboard</a>'; return; }
    if (!Cloud.isManager()) { $('#gate').textContent = 'Only managers and admins can open this page.'; return; }
    sb = Cloud.sb; me = Cloud.profile(); tenantId = Cloud.tenant.id; isAdmin = ['owner', 'admin'].indexOf(me.role) >= 0;
    CONFIG.applyBrand();
    $('#mark').textContent = CONFIG.cfg.company.logoText;
    $('#org').textContent = Cloud.tenant.name + ' · ' + me.name + (isAdmin ? ' (admin)' : ' (manager — visit planning only)');
    if (isAdmin) await syncVisitTypes();
    await loadAll();
    $('#gate').classList.add('hidden'); $('#main').classList.remove('hidden');
    document.querySelectorAll('#tabs [data-t]').forEach(function (b) {
      b.onclick = function () { tab = b.dataset.t; document.querySelectorAll('#tabs [data-t]').forEach(function (x) { x.classList.toggle('active', x === b); }); render(); };
    });
    render();
  }

  // Visit types live in the app configuration; the database keeps a matching row per type.
  async function syncVisitTypes() {
    var rows = CONFIG.cfg.visitTypes.map(function (t) { return { tenant_id: tenantId, code: t.id, label: t.label }; });
    if (rows.length) await sb.from('visit_types').upsert(rows, { onConflict: 'tenant_id,code' });
  }

  async function loadAll() {
    D.branches = chk(await sb.from('branches').select('*').order('name'));
    D.employees = chk(await sb.from('employees').select('*').order('emp_code'));
    D.types = chk(await sb.from('visit_types').select('id,code,label'));
    D.customers = chk(await sb.from('customers').select('*, loan_accounts(*)').order('name'));
    await loadVisits();
  }
  async function loadVisits() {
    D.visits = chk(await sb.from('customer_visits')
      .select('id,employee_id,customer_id,loan_account_id,status,sort,outcome,started_at,completed_at,flagged,visit_types(code),customers(name,address),loan_accounts(loan_ref,emi_due)')
      .eq('scheduled_date', visitDate).order('sort'));
  }

  function render() {
    var c = $('#content');
    if (tab === 'visits') c.innerHTML = visitsView();
    else if (tab === 'employees') c.innerHTML = employeesView();
    else if (tab === 'customers') c.innerHTML = customersView();
    else c.innerHTML = branchesView();
    bind();
  }

  // ---------- Visit plan ----------
  function visitsView() {
    var field = D.employees.filter(function (e) { return e.active && (e.role === 'field' || e.role === 'manager'); });
    var list = D.visits.filter(function (v) { return !empFilter || v.employee_id === empFilter; });
    var pend = D.visits.filter(function (v) { return v.status === 'pending'; }).length;
    var stTag = function (s) { return '<span class="tag ' + ({ completed: 'ok', in_progress: 'info', cancelled: 'bad' }[s] || '') + '">' + s.replace('_', ' ') + '</span>'; };
    var rows = list.map(function (v, i) {
      var e = emp(v.employee_id) || {}, l = v.loan_accounts || {}, cu = v.customers || {};
      var act = v.status === 'pending'
        ? '<select data-reassign="' + v.id + '" title="Reassign">' + field.map(function (x) { return opt(x.id, x.emp_code + ' · ' + x.name, x.id === v.employee_id); }).join('') + '</select> <button class="btn danger" data-cancel="' + v.id + '">Cancel</button>'
        : '<span class="muted small">' + esc(v.outcome || '') + '</span>';
      return '<tr class="' + (v.status === 'cancelled' ? 'off' : '') + '"><td>' + (i + 1) + '</td><td><span class="av" style="background:' + esc(e.color || '#64748b') + '">' + initials(e.name) + '</span>' + esc(e.name || '—') + '</td>' +
        '<td><b>' + esc(cu.name) + '</b><div class="muted small">' + esc(cu.address || '') + '</div></td><td>' + esc(vtLabel((v.visit_types || {}).code)) + '</td><td>' + esc(l.loan_ref || '—') + '</td>' +
        '<td>' + (Number(l.emi_due) ? FF.inr(l.emi_due) : '—') + '</td><td>' + stTag(v.status) + (v.flagged ? ' <span class="tag warn">⚠ geofence</span>' : '') + '</td><td>' + act + '</td></tr>';
    }).join('');
    return '<div class="bar"><label class="small muted">Date <input type="date" id="vDate" value="' + visitDate + '"></label>' +
      '<select id="vEmp"><option value="">All employees</option>' + field.map(function (e) { return opt(e.id, e.emp_code + ' · ' + e.name, e.id === empFilter); }).join('') + '</select>' +
      '<span class="sp"></span><span class="muted small">' + D.visits.length + ' visits · ' + pend + ' pending</span>' +
      '<button class="btn" id="carry"' + (pend ? '' : ' disabled') + ' title="Move this day\'s pending visits to the next day">Carry pending to ' + addDays(visitDate, 1).slice(5) + '</button>' +
      '<button class="btn primary" id="assign">+ Assign visits</button></div>' +
      '<div class="tbl"><table><thead><tr><th>#</th><th>Employee</th><th>Customer</th><th>Type</th><th>Loan / App</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8" class="muted">No visits planned for this day. Click “+ Assign visits”.</td></tr>') + '</tbody></table></div>';
  }

  function assignForm() {
    var field = D.employees.filter(function (e) { return e.active && e.branch_id && (e.role === 'field' || e.role === 'manager'); });
    var custRows = function (q) {
      q = (q || '').toLowerCase();
      return D.customers.filter(function (c) { return !q || (c.name + ' ' + (c.address || '') + ' ' + (c.loan_accounts || []).map(function (l) { return l.loan_ref; }).join(' ')).toLowerCase().indexOf(q) >= 0; })
        .map(function (c) {
          var loans = c.loan_accounts || [], noLoc = c.lat == null;
          return '<label><input type="checkbox" name="cust" value="' + c.id + '"' + (noLoc ? ' disabled' : '') + '><div><b>' + esc(c.name) + '</b> ' + (noLoc ? '<span class="tag bad">no location</span>' : '') +
            '<div class="muted small">' + esc(c.address || '') + (loans.length ? ' · ' + loans.map(function (l) { return esc(l.loan_ref) + (Number(l.emi_due) ? ' (' + FF.inr(l.emi_due) + ')' : ''); }).join(', ') : '') + '</div></div></label>';
        }).join('') || '<div class="muted" style="padding:10px">No customers found. Add them in “Customers & loans”.</div>';
    };
    openForm('Assign visits', '<div class="fg">' +
      '<label>Employee<select id="aEmp">' + field.map(function (e) { return opt(e.id, e.emp_code + ' · ' + e.name + ' (' + ((branch(e.branch_id) || {}).name || '') + ')', e.id === empFilter); }).join('') + '</select></label>' +
      '<label>Visit type<select id="aType">' + CONFIG.cfg.visitTypes.map(function (t) { return opt(t.id, t.label); }).join('') + '</select></label>' +
      '<label>Date<input type="date" id="aDate" value="' + visitDate + '"></label>' +
      '<label class="full">Customers <span class="hint">Tick one or more. Customers without a map location cannot be assigned (geofence needs it).</span><input id="aSearch" placeholder="Search name, address or loan number"></label>' +
      '<div class="full checklist" id="aList">' + custRows('') + '</div></div>',
      async function () {
        var ids = Array.prototype.map.call(document.querySelectorAll('#aList input:checked'), function (x) { return x.value; });
        if (!ids.length) throw new Error('Tick at least one customer');
        var code = $('#aType').value, type = D.types.find(function (t) { return t.code === code; });
        if (!type) throw new Error('Visit type “' + code + '” is missing in the database. Ask an admin to open this page once.');
        var empId = $('#aEmp').value, date = $('#aDate').value;
        if (!empId || !date) throw new Error('Choose employee and date');
        var existing = chk(await sb.from('customer_visits').select('id', { count: 'exact', head: false }).eq('employee_id', empId).eq('scheduled_date', date)).length;
        var rows = ids.map(function (cid, i) {
          var c = D.customers.find(function (x) { return x.id === cid; }), loan = (c.loan_accounts || [])[0];
          return { tenant_id: tenantId, employee_id: empId, customer_id: cid, loan_account_id: loan ? loan.id : null, visit_type_id: type.id, scheduled_date: date, sort: existing + i + 1 };
        });
        chk(await sb.from('customer_visits').insert(rows));
        visitDate = date; await loadVisits();
        toast(rows.length + ' visit' + (rows.length > 1 ? 's' : '') + ' assigned to ' + emp(empId).name);
      },
      function () { $('#aSearch').oninput = function () { $('#aList').innerHTML = custRows(this.value); }; });
  }

  // ---------- Employees ----------
  function employeesView() {
    var rows = D.employees.map(function (e) {
      var b = branch(e.branch_id);
      return '<tr class="' + (e.active ? '' : 'off') + '"><td><span class="av" style="background:' + esc(e.color) + '">' + initials(e.name) + '</span><b>' + esc(e.name) + '</b> <span class="muted">' + esc(e.emp_code) + '</span></td>' +
        '<td>' + esc(e.title) + '</td><td><span class="tag ' + (e.role === 'field' ? '' : 'info') + '">' + esc(e.role) + '</span></td><td>' + esc(b ? b.name : '—') + '</td>' +
        '<td>' + esc(fmtPhone(e.phone) || '—') + '</td><td>' + esc(e.email || '—') + '</td>' +
        '<td>' + (e.auth_user_id ? '<span class="tag ok">✓ signed in</span>' : '<span class="tag">not yet</span>') + '</td>' +
        '<td>' + (e.active ? '<span class="tag ok">Active</span>' : '<span class="tag bad">Inactive</span>') + '</td>' +
        '<td>' + (isAdmin ? '<button class="btn" data-edit-emp="' + e.id + '">Edit</button>' : '') + '</td></tr>';
    }).join('');
    return '<div class="bar"><span class="muted small">Employees sign in to the app with the <b>mobile number</b> (field staff) or <b>email</b> (managers) saved here. No passwords.</span><span class="sp"></span>' +
      (isAdmin ? '<button class="btn primary" id="addEmp">+ Add employee</button>' : '') + '</div>' +
      '<div class="tbl"><table><thead><tr><th>Employee</th><th>Designation</th><th>Access</th><th>Branch</th><th>Mobile (OTP)</th><th>Email (OTP)</th><th>App login</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function employeeForm(e) {
    var isNew = !e, self = e && e.id === me.employee_id;
    e = e || { emp_code: nextCode(), name: '', title: CONFIG.cfg.terminology.employee || 'Field Officer', role: 'field', branch_id: (D.branches[0] || {}).id, phone: '', email: '', color: PALETTE[D.employees.length % PALETTE.length], active: true };
    openForm(isNew ? 'Add employee' : 'Edit ' + e.name, '<div class="fg">' +
      '<label>Employee code<input id="eCode" value="' + esc(e.emp_code) + '" maxlength="20"></label>' +
      '<label>Full name<input id="eName" value="' + esc(e.name) + '" maxlength="80"></label>' +
      '<label>Designation<input id="eTitle" value="' + esc(e.title) + '" maxlength="60"></label>' +
      '<label>Access level<select id="eRole"' + (self ? ' disabled' : '') + '>' + [['field', 'Field staff — mobile app'], ['manager', 'Manager — dashboard + visit planning'], ['admin', 'Admin — everything incl. settings'], ['owner', 'Owner / MD']].map(function (r) { return opt(r[0], r[1], r[0] === e.role); }).join('') + '</select></label>' +
      '<label>Branch<select id="eBranch">' + D.branches.map(function (b) { return opt(b.id, b.name, b.id === e.branch_id); }).join('') + '</select></label>' +
      '<label>Map colour<input id="eColor" type="color" value="' + esc(e.color) + '"></label>' +
      '<label>Mobile number <span class="hint">For SMS OTP sign-in. 10 digits, India assumed.</span><input id="ePhone" type="tel" value="' + esc(fmtPhone(e.phone)) + '" placeholder="98400 12345"></label>' +
      '<label>Email <span class="hint">For email sign-in (managers).</span><input id="eEmail" type="email" value="' + esc(e.email || '') + '" placeholder="name@company.com"></label>' +
      '<label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="eActive"' + (e.active ? ' checked' : '') + (self ? ' disabled' : '') + '> Active — can sign in and is tracked on duty. Untick when someone leaves (history is kept).</label>' +
      (e.auth_user_id ? '<div class="full small muted">Already signed in to the app. Changing the mobile/email does not move their existing login; untick Active to block them.</div>' : '') +
      '</div>',
      async function () {
        var row = { emp_code: $('#eCode').value.trim().toUpperCase(), name: $('#eName').value.trim(), title: $('#eTitle').value.trim() || 'Field Officer',
          role: $('#eRole').value, branch_id: $('#eBranch').value || null, color: $('#eColor').value, phone: normPhone($('#ePhone').value),
          email: $('#eEmail').value.trim().toLowerCase() || null, active: $('#eActive').checked };
        if (!row.emp_code || !row.name) throw new Error('Employee code and name are required');
        if (row.phone && !/^\+\d{11,15}$/.test(row.phone)) throw new Error('Enter a valid mobile number');
        if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) throw new Error('Enter a valid email');
        if (!row.phone && !row.email) throw new Error('Add a mobile number or email so they can sign in');
        if (row.role === 'field' && !row.phone) throw new Error('Field staff need a mobile number for the app');
        if (self) { delete row.role; delete row.active; }
        if (isNew) chk(await sb.from('employees').insert(Object.assign({ tenant_id: tenantId }, row)));
        else chk(await sb.from('employees').update(row).eq('id', e.id));
        D.employees = chk(await sb.from('employees').select('*').order('emp_code'));
        toast(isNew ? row.name + ' added. They can now sign in with ' + (row.phone ? fmtPhone(row.phone) : row.email) : 'Saved');
      });
  }
  function nextCode() {
    var n = D.employees.map(function (e) { var m = /^EMP(\d+)$/.exec(e.emp_code); return m ? Number(m[1]) : 0; }).reduce(function (a, b) { return Math.max(a, b); }, 0);
    return 'EMP' + String(n + 1).padStart(3, '0');
  }

  // ---------- Customers & loans ----------
  function customersView() {
    var q = custSearch.toLowerCase();
    var list = D.customers.filter(function (c) { return !q || (c.name + ' ' + (c.address || '') + ' ' + (c.phone || '') + ' ' + (c.loan_accounts || []).map(function (l) { return l.loan_ref; }).join(' ')).toLowerCase().indexOf(q) >= 0; });
    var rows = list.slice(0, 500).map(function (c) {
      var loans = c.loan_accounts || [];
      return '<tr><td><b>' + esc(c.name) + '</b><div class="muted small">' + esc(c.address || '') + '</div></td><td>' + esc(c.phone || '—') + '</td>' +
        '<td>' + (c.lat != null ? '<span class="tag ok">✓ ' + c.lat.toFixed(4) + ', ' + c.lng.toFixed(4) + '</span>' : '<span class="tag bad">missing</span>') + '</td>' +
        '<td>' + (loans.map(function (l) { return esc(l.loan_ref) + (Number(l.emi_due) ? ' · ' + FF.inr(l.emi_due) : '') + (l.overdue_days ? ' · <span class="tag warn">' + l.overdue_days + ' DPD</span>' : ''); }).join('<br>') || '—') + '</td>' +
        '<td>' + (isAdmin ? '<button class="btn" data-edit-cust="' + c.id + '">Edit</button>' : '') + '</td></tr>';
    }).join('');
    return '<div class="bar"><input id="cSearch" placeholder="Search name, address, phone, loan" value="' + esc(custSearch) + '" style="min-width:240px"><span class="muted small">' + list.length + ' of ' + D.customers.length + '</span><span class="sp"></span>' +
      (isAdmin ? '<button class="btn" id="csvTpl">⬇ CSV template</button><label class="btn">⬆ Import CSV<input type="file" id="csvFile" accept=".csv,text/csv" class="hidden"></label><button class="btn primary" id="addCust">+ Add customer</button>' : '') + '</div>' +
      '<div class="tbl"><table><thead><tr><th>Customer</th><th>Phone</th><th>Map location</th><th>Loans / applications</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="muted">No customers</td></tr>') + '</tbody></table></div>';
  }
  function customerForm(c) {
    var isNew = !c;
    c = c || { name: '', address: '', phone: '', lat: null, lng: null, loan_accounts: [] };
    var loanRow = function (l) {
      l = l || {};
      return '<tr data-loan="' + (l.id || '') + '"><td><input class="lRef" placeholder="LN-123 / APP-456" value="' + esc(l.loan_ref || '') + '"' + (l.id ? ' readonly' : '') + '></td>' +
        '<td><input class="lDue" type="number" min="0" step="1" placeholder="EMI due ₹" value="' + esc(l.emi_due == null ? '' : Number(l.emi_due)) + '"></td>' +
        '<td><input class="lOd" type="number" min="0" step="1" placeholder="Days overdue" value="' + esc(l.overdue_days == null ? '' : l.overdue_days) + '"></td></tr>';
    };
    openForm(isNew ? 'Add customer' : 'Edit ' + c.name, '<div class="fg">' +
      '<label>Customer name<input id="cName" value="' + esc(c.name) + '" maxlength="120"></label>' +
      '<label>Phone<input id="cPhone" value="' + esc(c.phone || '') + '" maxlength="20"></label>' +
      '<label class="full">Address<input id="cAddr" value="' + esc(c.address || '') + '" maxlength="250"></label>' +
      pickerFields(c.lat, c.lng, 'Visit location (used for the geofence check)') +
      '<div class="full"><b style="font-size:12.5px">Loans / applications</b><table class="loans"><thead><tr><th>Loan / app no.</th><th>EMI due (₹)</th><th>Days overdue</th></tr></thead><tbody id="cLoans">' +
      (c.loan_accounts || []).map(loanRow).join('') + loanRow() + '</tbody></table><button class="btn" id="addLoan" type="button">+ another loan</button></div></div>',
      async function () {
        var row = { name: $('#cName').value.trim(), phone: $('#cPhone').value.trim() || null, address: $('#cAddr').value.trim() || null };
        var ll = readPicker(); row.lat = ll.lat; row.lng = ll.lng;
        if (!row.name) throw new Error('Customer name is required');
        if (row.lat == null) throw new Error('Set the location: click on the map or paste “lat, lng”');
        var id = c.id;
        if (isNew) id = chk(await sb.from('customers').insert(Object.assign({ tenant_id: tenantId }, row)).select('id').single()).id;
        else chk(await sb.from('customers').update(row).eq('id', id));
        var trs = document.querySelectorAll('#cLoans tr');
        for (var i = 0; i < trs.length; i++) {
          var tr = trs[i], ref = tr.querySelector('.lRef').value.trim(), due = Number(tr.querySelector('.lDue').value || 0), od = parseInt(tr.querySelector('.lOd').value || '0', 10) || 0;
          if (tr.dataset.loan) chk(await sb.from('loan_accounts').update({ emi_due: due, overdue_days: od }).eq('id', tr.dataset.loan));
          else if (ref) chk(await sb.from('loan_accounts').insert({ tenant_id: tenantId, customer_id: id, loan_ref: ref, emi_due: due, overdue_days: od }));
        }
        D.customers = chk(await sb.from('customers').select('*, loan_accounts(*)').order('name'));
        toast(isNew ? row.name + ' added' : 'Saved');
      },
      function () { initPicker(c.lat, c.lng); $('#addLoan').onclick = function () { $('#cLoans').insertAdjacentHTML('beforeend', loanRow()); }; });
  }

  // CSV import: name,address,phone,lat,lng,loan_ref,emi_due,overdue_days (one row per loan; same name+address = same customer)
  var CSV_HEAD = ['name', 'address', 'phone', 'lat', 'lng', 'loan_ref', 'emi_due', 'overdue_days'];
  function parseCsv(text) {
    var rows = [], row = [], f = '', q = false;
    text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.join('').trim()) rows.push(row); row = []; }
      else f += ch;
    }
    row.push(f); if (row.join('').trim()) rows.push(row);
    return rows;
  }
  async function importCsv(file) {
    var rows = parseCsv(await file.text());
    if (!rows.length) throw new Error('The file is empty');
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); }), idx = {};
    CSV_HEAD.forEach(function (h) { idx[h] = head.indexOf(h); });
    if (idx.name < 0) throw new Error('First row must be the header: ' + CSV_HEAD.join(','));
    var get = function (r, k) { return idx[k] >= 0 ? String(r[idx[k]] || '').trim() : ''; };
    var groups = {}, order = [], bad = 0;
    rows.slice(1).forEach(function (r) {
      var name = get(r, 'name'), lat = parseFloat(get(r, 'lat')), lng = parseFloat(get(r, 'lng'));
      if (!name) { bad++; return; }
      var key = (name + '|' + get(r, 'address')).toLowerCase();
      if (!groups[key]) { groups[key] = { c: { tenant_id: tenantId, name: name, address: get(r, 'address') || null, phone: get(r, 'phone') || null, lat: isFinite(lat) && Math.abs(lat) <= 90 ? lat : null, lng: isFinite(lng) && Math.abs(lng) <= 180 ? lng : null }, loans: [] }; order.push(key); }
      if (get(r, 'loan_ref')) groups[key].loans.push({ loan_ref: get(r, 'loan_ref'), emi_due: Number(get(r, 'emi_due')) || 0, overdue_days: parseInt(get(r, 'overdue_days'), 10) || 0 });
    });
    if (!order.length) throw new Error('No customer rows found');
    if (!confirm('Import ' + order.length + ' customers' + (bad ? ' (' + bad + ' rows without a name will be skipped)' : '') + '?')) return;
    var made = 0, loansMade = 0;
    for (var i = 0; i < order.length; i += 200) {
      var chunk = order.slice(i, i + 200);
      var ins = chk(await sb.from('customers').insert(chunk.map(function (k) { return groups[k].c; })).select('id'));
      var loans = [];
      ins.forEach(function (x, j) { groups[chunk[j]].loans.forEach(function (l) { loans.push(Object.assign({ tenant_id: tenantId, customer_id: x.id }, l)); }); });
      if (loans.length) chk(await sb.from('loan_accounts').upsert(loans, { onConflict: 'tenant_id,loan_ref', ignoreDuplicates: true }));
      made += ins.length; loansMade += loans.length;
    }
    D.customers = chk(await sb.from('customers').select('*, loan_accounts(*)').order('name'));
    render();
    toast('Imported ' + made + ' customers and ' + loansMade + ' loans');
  }

  // ---------- Branches ----------
  function branchesView() {
    var rows = D.branches.map(function (b) {
      var n = D.employees.filter(function (e) { return e.branch_id === b.id && e.active; }).length;
      return '<tr><td><b>' + esc(b.name) + '</b></td><td>' + esc(b.code) + '</td><td>' + (b.lat != null ? b.lat.toFixed(4) + ', ' + b.lng.toFixed(4) : '<span class="tag bad">missing</span>') + '</td><td>' + n + '</td>' +
        '<td>' + (isAdmin ? '<button class="btn" data-edit-branch="' + b.id + '">Edit</button>' : '') + '</td></tr>';
    }).join('');
    return '<div class="bar"><span class="muted small">Branch location is used to check where staff start duty (alert if they check in far away).</span><span class="sp"></span>' +
      (isAdmin ? '<button class="btn primary" id="addBranch">+ Add branch</button>' : '') + '</div>' +
      '<div class="tbl"><table><thead><tr><th>Branch</th><th>Code</th><th>Location</th><th>Active staff</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function branchForm(b) {
    var isNew = !b; b = b || { code: '', name: '', lat: null, lng: null };
    openForm(isNew ? 'Add branch' : 'Edit ' + b.name, '<div class="fg">' +
      '<label>Branch name<input id="bName" value="' + esc(b.name) + '" maxlength="80"></label>' +
      '<label>Short code<input id="bCode" value="' + esc(b.code) + '" maxlength="10" placeholder="e.g. TNG"></label>' +
      pickerFields(b.lat, b.lng, 'Branch location') + '</div>',
      async function () {
        var row = { name: $('#bName').value.trim(), code: $('#bCode').value.trim().toUpperCase() }, ll = readPicker();
        row.lat = ll.lat; row.lng = ll.lng;
        if (!row.name || !row.code) throw new Error('Name and code are required');
        if (row.lat == null) throw new Error('Set the branch location on the map');
        if (isNew) chk(await sb.from('branches').insert(Object.assign({ tenant_id: tenantId }, row)));
        else chk(await sb.from('branches').update(row).eq('id', b.id));
        D.branches = chk(await sb.from('branches').select('*').order('name'));
        toast('Saved');
      }, function () { initPicker(b.lat, b.lng); });
  }

  // ---------- Map location picker ----------
  var pickMap = null, pickMarker = null;
  function pickerFields(lat, lng, label) {
    return '<label class="full">' + label + ' <span class="hint">Click the map, drag the pin, or paste “lat, lng” (from Google Maps: right-click → copy coordinates).</span>' +
      '<div style="display:flex;gap:8px"><input id="pLL" style="flex:1" placeholder="13.0418, 80.2341" value="' + (lat != null ? lat + ', ' + lng : '') + '"><button class="btn" type="button" id="pGps">📍 My location</button></div>' +
      '<div class="picker" id="pMap"></div></label>';
  }
  function readPicker() {
    var m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec($('#pLL').value);
    if (!m) return { lat: null, lng: null };
    var lat = Number(m[1]), lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { lat: null, lng: null };
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  }
  function initPicker(lat, lng) {
    var center = lat != null ? [lat, lng] : (D.branches[0] && D.branches[0].lat != null ? [D.branches[0].lat, D.branches[0].lng] : [13.04, 80.23]);
    pickMap = L.map('pMap').setView(center, lat != null ? 16 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(pickMap);
    pickMarker = null;
    var set = function (la, ln, pan) {
      la = Math.round(la * 1e6) / 1e6; ln = Math.round(ln * 1e6) / 1e6;
      $('#pLL').value = la + ', ' + ln;
      if (!pickMarker) { pickMarker = L.marker([la, ln], { draggable: true }).addTo(pickMap); pickMarker.on('dragend', function () { var p = pickMarker.getLatLng(); set(p.lat, p.lng); }); }
      else pickMarker.setLatLng([la, ln]);
      if (pan) pickMap.setView([la, ln], Math.max(pickMap.getZoom(), 16));
    };
    if (lat != null) set(lat, lng);
    pickMap.on('click', function (e) { set(e.latlng.lat, e.latlng.lng); });
    $('#pLL').onchange = function () { var ll = readPicker(); if (ll.lat != null) set(ll.lat, ll.lng, true); };
    $('#pGps').onclick = function () {
      if (!navigator.geolocation) { toast('Location not available'); return; }
      navigator.geolocation.getCurrentPosition(function (p) { set(p.coords.latitude, p.coords.longitude, true); }, function () { toast('Could not get your location'); }, { enableHighAccuracy: true, timeout: 10000 });
    };
    setTimeout(function () { pickMap.invalidateSize(); }, 80);
  }

  // ---------- generic modal ----------
  function openForm(title, html, onSave, afterOpen) {
    var ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h2>' + esc(title) + '</h2><div class="body">' + html + '</div>' +
      '<div class="foot"><span class="err" id="fErr"></span><button class="btn" id="fCancel" type="button">Cancel</button><button class="btn primary" id="fSave" type="button">Save</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { if (pickMap) { pickMap.remove(); pickMap = null; } ov.remove(); };
    ov.querySelector('#fCancel').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#fSave').onclick = async function () {
      var btn = this; btn.disabled = true; $('#fErr').textContent = '';
      try { await onSave(); } catch (e) { $('#fErr').textContent = errText(e); btn.disabled = false; return; }
      close();
      try { render(); } catch (e) { console.error(e); toast('Saved, but the screen could not refresh. Reload the page.'); }
    };
    if (afterOpen) afterOpen();
    var first = ov.querySelector('input:not([readonly]):not([type=checkbox]), select'); if (first) first.focus();
  }

  // ---------- wiring ----------
  function bind() {
    var on = function (sel, ev, fn) { var el = $(sel); if (el) el[ev] = fn; };
    on('#vDate', 'onchange', async function () { visitDate = this.value || todayStr(); await loadVisits(); render(); });
    on('#vEmp', 'onchange', function () { empFilter = this.value; render(); });
    on('#assign', 'onclick', assignForm);
    on('#carry', 'onclick', async function () {
      var ids = D.visits.filter(function (v) { return v.status === 'pending'; }).map(function (v) { return v.id; });
      if (!ids.length || !confirm('Move ' + ids.length + ' pending visits to ' + addDays(visitDate, 1) + '?')) return;
      try { chk(await sb.from('customer_visits').update({ scheduled_date: addDays(visitDate, 1) }).in('id', ids)); await loadVisits(); render(); toast(ids.length + ' visits moved to the next day'); }
      catch (e) { toast(errText(e)); }
    });
    document.querySelectorAll('[data-reassign]').forEach(function (s) {
      s.onchange = async function () {
        try { chk(await sb.from('customer_visits').update({ employee_id: s.value }).eq('id', s.dataset.reassign)); await loadVisits(); render(); toast('Reassigned to ' + emp(s.value).name); }
        catch (e) { toast(errText(e)); }
      };
    });
    document.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('Cancel this visit? It stays in the history as cancelled.')) return;
        try { chk(await sb.from('customer_visits').update({ status: 'cancelled' }).eq('id', b.dataset.cancel)); await loadVisits(); render(); toast('Visit cancelled'); }
        catch (e) { toast(errText(e)); }
      };
    });
    on('#addEmp', 'onclick', function () { employeeForm(null); });
    document.querySelectorAll('[data-edit-emp]').forEach(function (b) { b.onclick = function () { employeeForm(emp(b.dataset.editEmp)); }; });
    on('#cSearch', 'oninput', function () { custSearch = this.value; var pos = this.selectionStart; render(); var s = $('#cSearch'); s.focus(); s.setSelectionRange(pos, pos); });
    on('#addCust', 'onclick', function () { customerForm(null); });
    document.querySelectorAll('[data-edit-cust]').forEach(function (b) { b.onclick = function () { customerForm(D.customers.find(function (c) { return c.id === b.dataset.editCust; })); }; });
    on('#csvTpl', 'onclick', function () {
      var csv = CSV_HEAD.join(',') + '\r\n"Lakshmi N","12, Usman Road, T. Nagar, Chennai",9840000000,13.0386,80.2335,LN-TNG-99001,12500,5\r\n';
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'customers_template.csv'; a.click();
    });
    on('#csvFile', 'onchange', async function () { var f = this.files[0]; this.value = ''; if (!f) return; try { await importCsv(f); } catch (e) { toast(errText(e)); } });
    on('#addBranch', 'onclick', function () { branchForm(null); });
    document.querySelectorAll('[data-edit-branch]').forEach(function (b) { b.onclick = function () { branchForm(branch(b.dataset.editBranch)); }; });
  }

  boot().catch(function (e) { $('#gate').textContent = 'Could not load: ' + errText(e); });
})();
