// FieldForce 360 — cloud sync (Supabase). Loaded after store.js.
// When js/backend-config.js has a URL + anon key, this replaces the browser-only demo store:
//   * sign-in with SMS OTP (employees) or email OTP (managers),
//   * pulls today's data from PostgreSQL into the same FF.state / SEED shapes the UI already uses,
//   * pushes every local change (check-in, GPS points, visits, receipts, expenses, audit events)
//     as a diff, with retry — so the app keeps working through short network drops,
//   * managers get live updates through Supabase Realtime.
(function () {
  var cfg = window.FF_BACKEND || {};
  var Cloud = window.Cloud = { enabled: !!(cfg.url && cfg.anonKey && window.supabase) };
  if (!Cloud.enabled) return;

  // Employee app and manager pages keep separate sign-ins, so both can be open side by side (demo page).
  var SCOPE = /admin|settings/i.test(location.pathname) ? 'manager' : 'app';
  var sb = Cloud.sb = supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ff360.auth.' + SCOPE }
  });
  var APP_VERSION = '1.1.0';
  var profile = null, myCode = null, isManager = false, isAdmin = false, tenant = null, uid = null;
  var empByCode = {}, empById = {}, branchById = {}, visitMeta = {};
  var snap = blankSnap(), ver = 0, pushing = null, again = false, pushTimer = null, retryTimer = null;
  Cloud.status = { online: true, pending: 0, lastSync: null, error: null };

  // ---------- small helpers ----------
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function midnightIso() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
  function iso(t) { return t ? new Date(t).toISOString() : null; }
  function ms(s) { return s ? Date.parse(s) : null; }
  function blankState() { return { date: today(), attendance: {}, track: {}, visits: {}, collections: [], expenses: [], audit: [], status: {} }; }
  function blankSnap() { return { att: {}, selfie: {}, track: {}, trackT: {}, status: {}, visits: {}, coll: {}, exp: {}, audit: {} }; }
  function stable(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
    return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(o[k]); }).join(',') + '}';
  }
  function chk(r) { if (r.error) throw r.error; return r.data; }
  function emit() { window.dispatchEvent(new Event('ff-cloud')); }
  function cacheKey() { return 'ff360.cloud.' + SCOPE + '.' + uid; }
  function cacheSave() { try { localStorage.setItem(cacheKey(), JSON.stringify({ state: FF.state, snap: snap })); } catch (e) {} }
  function cacheLoad() {
    try { var c = JSON.parse(localStorage.getItem(cacheKey())); if (c && c.state && c.state.date === today()) return c; } catch (e) {}
    return null;
  }
  async function pageAll(build) {
    var out = [], from = 0, size = 1000;
    for (;;) { var rows = chk(await build().range(from, from + size - 1)); out = out.concat(rows); if (rows.length < size) return out; from += size; }
  }

  // ---------- take over the local store ----------
  FF.state = blankState();
  FF.reload = function () { return this.state; };
  FF.save = function () { ver++; cacheSave(); Cloud.push(); };
  FF.reset = function () { return Cloud.resetDay(); };
  var rawSaveCfg = CONFIG.saveCfg.bind(CONFIG), cfgTimer = null;
  CONFIG.saveCfg = function () {
    rawSaveCfg();
    if (!isAdmin || !tenant) return;
    clearTimeout(cfgTimer);
    cfgTimer = setTimeout(function () {
      var c = CONFIG.cfg, sub = c.subscription || {};
      sb.from('tenant_settings').update({ app_config: c }).eq('tenant_id', tenant).then(function (r) { if (r.error) console.warn('settings sync', r.error); });
      sb.from('tenants').update({ name: c.company.name, industry: c.company.industry, plan_id: sub.plan, seats: Number(sub.seats) || 1, billing: sub.billing })
        .eq('id', tenant).then(function (r) { if (r.error) console.warn('tenant sync', r.error); });
    }, 800);
  };

  // ---------- auth ----------
  function normPhone(s) {
    var d = String(s).replace(/\D/g, '');
    if (d.length === 10) d = '91' + d;
    return '+' + d;
  }
  Cloud.errMsg = function (e) {
    var m = (e && e.message) || String(e);
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Cannot reach the server. Check your internet connection and try again.';
    if (/token has expired|invalid/i.test(m) && /otp|token/i.test(m)) return 'The code is wrong or has expired. Request a new one.';
    return m;
  };
  Cloud.isEmail = function (s) { return /@/.test(s); };
  Cloud.sendOtp = async function (id) {
    id = String(id || '').trim();
    if (!id) throw new Error('Enter your mobile number or email');
    var r = Cloud.isEmail(id)
      ? await sb.auth.signInWithOtp({ email: id.toLowerCase(), options: { emailRedirectTo: location.href.split('#')[0].split('?')[0] } })
      : await sb.auth.signInWithOtp({ phone: normPhone(id) });
    chk(r);
  };
  Cloud.verifyOtp = async function (id, code) {
    id = String(id || '').trim(); code = String(code || '').trim();
    var r = Cloud.isEmail(id)
      ? await sb.auth.verifyOtp({ email: id.toLowerCase(), token: code, type: 'email' })
      : await sb.auth.verifyOtp({ phone: normPhone(id), token: code, type: 'sms' });
    chk(r);
  };
  Cloud.hasSession = async function () { var r = await sb.auth.getSession(); return !!(r.data && r.data.session); };
  Cloud.signOut = async function () {
    try { await Cloud.flush(); } catch (e) {}
    if (Cloud.channel) sb.removeChannel(Cloud.channel);
    await sb.auth.signOut();
    profile = null; myCode = null; FF.state = blankState(); snap = blankSnap();
  };
  Cloud.profile = function () { return profile; };
  Cloud.isManager = function () { return isManager; };

  // Links the OTP-verified login to the employee record and loads everything for today.
  Cloud.boot = async function (opts) {
    opts = opts || {};
    var u = (await sb.auth.getUser()).data.user;
    if (!u) throw new Error('Not signed in');
    uid = u.id;
    profile = chk(await sb.rpc('link_my_employee'));
    if (!profile) { await sb.auth.signOut(); throw new Error('This number / email is not registered. Ask your admin to add you as an employee.'); }
    myCode = profile.emp_code; tenant = profile.tenant_id;
    isManager = ['owner', 'admin', 'manager'].indexOf(profile.role) >= 0;
    isAdmin = ['owner', 'admin'].indexOf(profile.role) >= 0;
    if (opts.requireManager && !isManager) { await sb.auth.signOut(); throw new Error('This account is not a manager. Use the employee app instead.'); }

    await loadMaster();
    var c = cacheLoad();
    if (c) { FF.state = c.state; snap = c.snap; }
    try { await Cloud.flush(); await Cloud.pull(); } catch (e) { console.warn('Working offline from cache', e); Cloud.status.error = e.message; }
    if (isManager) subscribe();
    if (Cloud._timers) return profile;
    Cloud._timers = true;
    setInterval(function () { if (!pushing) Cloud.pull({ skipTrack: isManager }).catch(function () {}); }, isManager ? 30000 : 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !pushing) Cloud.pull({ skipTrack: isManager }).catch(function () {}); });
    return profile;
  };

  // Admin Console: load the company's saved configuration; edits are then saved to the database.
  Cloud.bootConfig = async function () {
    var u = (await sb.auth.getUser()).data.user;
    if (!u) return { ok: false, msg: 'Sign in on the Manager dashboard first, then reopen the Admin console.' };
    uid = u.id;
    profile = chk(await sb.rpc('link_my_employee'));
    if (!profile) return { ok: false, msg: 'This login is not linked to an employee.' };
    myCode = profile.emp_code; tenant = profile.tenant_id;
    isManager = ['owner', 'admin', 'manager'].indexOf(profile.role) >= 0;
    isAdmin = ['owner', 'admin'].indexOf(profile.role) >= 0;
    var before = localStorage.getItem(CONFIG.CFG_KEY);
    await loadMaster();
    var changed = before !== localStorage.getItem(CONFIG.CFG_KEY);
    return { ok: true, admin: isAdmin, changed: changed, msg: isAdmin ? 'Changes are saved to the cloud for every user of ' + Cloud.tenant.name + '.' : 'View only — only an owner/admin can change settings.' };
  };

  // ---------- master data: config, branches, employees ----------
  async function loadMaster() {
    var t = chk(await sb.from('tenants').select('id,name,industry,plan_id,seats,billing,status').eq('id', tenant).single());
    var s = chk(await sb.from('tenant_settings').select('app_config').eq('tenant_id', tenant).maybeSingle());
    var conf = (s && s.app_config) ? s.app_config : JSON.parse(JSON.stringify(CONFIG.DEFAULT_CONFIG));
    try { localStorage.setItem(CONFIG.CFG_KEY, JSON.stringify(conf)); } catch (e) {}
    CONFIG.reload();
    CONFIG.cfg.company.name = t.name;
    CONFIG.cfg.subscription = { plan: t.plan_id, seats: t.seats, billing: t.billing };
    rawSaveCfg();
    Cloud.tenant = t;

    var br = chk(await sb.from('branches').select('id,code,name,lat,lng').order('name'));
    branchById = {};
    SEED.branches = br.map(function (b) { var x = { id: b.id, code: b.code, name: b.name, lat: b.lat, lng: b.lng }; branchById[b.id] = x; return x; });
    var em = chk(await sb.from('employees').select('id,emp_code,name,title,role,branch_id,phone,color,active').eq('active', true).order('emp_code'));
    empByCode = {}; empById = {};
    em.forEach(function (e) { var x = { id: e.emp_code, uuid: e.id, name: e.name, role: e.title, sysRole: e.role, branch: e.branch_id, color: e.color, phone: e.phone || '' }; empByCode[x.id] = x; empById[e.id] = x; });
    SEED.employees = em.filter(function (e) { return e.role === 'field' || e.emp_code === myCode; }).map(function (e) { return empById[e.id]; })
      .filter(function (e) { return e.branch && branchById[e.branch]; });
    if (!SEED.branches.length) SEED.branches = [{ id: '-', name: 'No branch', lat: 13.04, lng: 80.23 }];
  }

  // ---------- row builders (local shape → DB row); also used to fingerprint pulled data ----------
  function selfiePath(code) { return tenant + '/' + FF.state.date + '/' + empByCode[code].uuid + '.jpg'; }
  function attRow(code, a) {
    return { tenant_id: tenant, employee_id: empByCode[code].uuid, work_date: FF.state.date,
      check_in_at: iso(a.in.t), check_in_lat: a.in.lat, check_in_lng: a.in.lng, check_in_accuracy: a.in.acc == null ? null : a.in.acc,
      is_late: !!a.in.late, selfie_path: a.in.selfie ? selfiePath(code) : null,
      check_out_at: a.out ? iso(a.out.t) : null, check_out_lat: a.out ? a.out.lat : null, check_out_lng: a.out ? a.out.lng : null };
  }
  function visitRow(v) {
    return { status: v.status, started_at: iso(v.startedAt), start_lat: v.startLoc ? v.startLoc.lat : null, start_lng: v.startLoc ? v.startLoc.lng : null,
      start_distance_m: v.startDist == null ? null : Math.round(v.startDist), flagged: !!v.flagged, completed_at: iso(v.completedAt),
      end_lat: v.endLoc ? v.endLoc.lat : null, end_lng: v.endLoc ? v.endLoc.lng : null, outcome: v.outcome || null, remarks: v.remarks || null, form_data: v.custom || {} };
  }
  function auditKey(a) { return a.ref || (a.t + '|' + a.emp + '|' + a.action); }

  // ---------- pull: database → FF.state ----------
  Cloud.pull = async function (opts) {
    opts = opts || {};
    var startVer = ver, date = today(), since = midnightIso();
    var vis = chk(await sb.from('customer_visits')
      .select('id,employee_id,status,sort,started_at,start_lat,start_lng,start_distance_m,flagged,completed_at,end_lat,end_lng,outcome,remarks,form_data,loan_account_id,customers(name,address,lat,lng),loan_accounts(loan_ref,emi_due,overdue_days),visit_types(code)')
      .eq('scheduled_date', date).order('sort'));
    var att = chk(await sb.from('attendance').select('*').eq('work_date', date));
    var stat = chk(await sb.from('employee_status').select('*'));
    var col = chk(await sb.from('collection_transactions').select('id,visit_id,employee_id,loan_account_id,amount,mode,receipt_no,collected_at,lat,lng').gte('collected_at', since));
    var exp = chk(await sb.from('expense_claims').select('id,employee_id,ref,category,amount,note,status,created_at').or('created_at.gte."' + since + '",status.eq.Pending').order('created_at'));
    var aud = chk(await sb.from('audit_logs').select('employee_id,ref,action,detail,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(300));
    var locs = opts.skipTrack ? null : await pageAll(function () {
      return sb.from('employee_locations').select('employee_id,recorded_at,lat,lng,accuracy').gte('recorded_at', since).order('recorded_at');
    });
    var paths = att.filter(function (a) { return a.selfie_path; }).map(function (a) { return a.selfie_path; }), urls = {};
    if (paths.length) {
      var su = await sb.storage.from('selfies').createSignedUrls(paths, 3600);
      (su.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    if (ver !== startVer) return false;           // the user changed something meanwhile; keep local state, retry later

    var S = blankState(), N = blankSnap(), prev = FF.state;
    S.date = date;
    var code = function (id) { return empById[id] ? empById[id].id : null; };
    visitMeta = {};
    SEED.visits = vis.filter(function (v) { return code(v.employee_id); }).map(function (v) {
      var c = v.customers || {}, l = v.loan_accounts || {};
      visitMeta[v.id] = { loanId: v.loan_account_id };
      return { id: v.id, emp: code(v.employee_id), customer: c.name, loan: l.loan_ref || '', type: (v.visit_types || {}).code, address: c.address || '',
        lat: c.lat, lng: c.lng, due: Number(l.emi_due) || 0, overdueDays: l.overdue_days || 0 };
    });
    col.forEach(function (c) {
      var sv = SEED.visits.find(function (v) { return v.id === c.visit_id; }) || {};
      S.collections.push({ id: c.receipt_no, emp: code(c.employee_id), visit: c.visit_id, customer: sv.customer || '', loan: sv.loan || '', amount: Number(c.amount), mode: c.mode, t: ms(c.collected_at), lat: c.lat, lng: c.lng });
      N.coll[c.receipt_no] = 1;
    });
    vis.forEach(function (v) {
      if (v.status === 'pending' || !code(v.employee_id)) return;
      var c = S.collections.find(function (x) { return x.visit === v.id; });
      var st = { status: v.status, startedAt: ms(v.started_at), startLoc: v.start_lat == null ? null : { lat: v.start_lat, lng: v.start_lng }, startDist: v.start_distance_m,
        flagged: v.flagged, completedAt: ms(v.completed_at), endLoc: v.end_lat == null ? null : { lat: v.end_lat, lng: v.end_lng }, outcome: v.outcome, remarks: v.remarks, custom: v.form_data || {} };
      N.visits[v.id] = stable(visitRow(st));
      if (c) Object.assign(st, { amount: c.amount, mode: c.mode, receipt: c.id });
      S.visits[v.id] = st;
    });
    att.forEach(function (a) {
      var k = code(a.employee_id); if (!k) return;
      var old = prev.attendance[k], keepSelfie = old && old.in && /^data:/.test(old.in.selfie || '') ? old.in.selfie : null;
      S.attendance[k] = { in: { t: ms(a.check_in_at), lat: a.check_in_lat, lng: a.check_in_lng, acc: a.check_in_accuracy, late: a.is_late,
        selfie: a.selfie_path ? (keepSelfie || urls[a.selfie_path] || 'missing') : null } };
      if (a.check_out_at) S.attendance[k].out = { t: ms(a.check_out_at), lat: a.check_out_lat, lng: a.check_out_lng };
      N.att[k] = stable(attRow(k, S.attendance[k]));
      if (a.selfie_path) N.selfie[k] = 1;
    });
    stat.forEach(function (s) { var k = code(s.employee_id); if (!k) return; S.status[k] = { gps: s.gps, last: ms(s.last_seen_at), acc: s.accuracy, mode: s.mode }; N.status[k] = { gps: s.gps, last: S.status[k].last }; });
    exp.forEach(function (x) { var k = code(x.employee_id); if (!k) return; S.expenses.push({ id: x.ref, emp: k, cat: x.category, amount: Number(x.amount), note: x.note, t: ms(x.created_at), status: x.status }); N.exp[x.ref] = x.status; });
    aud.forEach(function (a) { var e = { t: ms(a.created_at), emp: code(a.employee_id), action: a.action, detail: a.detail || '', ref: a.ref }; if (!e.emp) return; S.audit.push(e); N.audit[auditKey(e)] = 1; });
    if (locs) {
      locs.forEach(function (p) { var k = code(p.employee_id); if (!k) return; (S.track[k] = S.track[k] || []).push({ lat: p.lat, lng: p.lng, acc: p.accuracy, t: ms(p.recorded_at) }); });
    } else { S.track = prev.track; }
    Object.keys(S.track).forEach(function (k) { var tr = S.track[k]; N.track[k] = tr.length; N.trackT[k] = tr.length ? tr[tr.length - 1].t : 0; });
    // My own GPS trail: keep the denser local copy if it is longer.
    if (myCode && prev.date === date && (prev.track[myCode] || []).length > (S.track[myCode] || []).length) { S.track[myCode] = prev.track[myCode]; N.track[myCode] = S.track[myCode].length; N.trackT[myCode] = snap.trackT[myCode] || 0; }

    FF.state = S; snap = N; cacheSave();
    Cloud.status.lastSync = Date.now(); Cloud.status.error = null;
    emit();
    return true;
  };

  // ---------- push: FF.state → database (only what changed) ----------
  Cloud.push = function () {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { Cloud.flush().catch(function () {}); }, 1500);
  };
  Cloud.flush = function () {
    if (!profile) return Promise.resolve();
    if (pushing) { again = true; return pushing; }
    pushing = doPush().then(function () {
      Cloud.status.online = true; Cloud.status.error = null; Cloud.status.lastSync = Date.now(); clearTimeout(retryTimer);
    }, function (e) {
      Cloud.status.online = false; Cloud.status.error = e.message || String(e);
      console.warn('Sync failed, will retry', e);
      clearTimeout(retryTimer); retryTimer = setTimeout(Cloud.push, 15000);
      throw e;
    }).finally(function () {
      pushing = null; cacheSave(); emit();
      if (again) { again = false; Cloud.push(); }
    });
    return pushing;
  };

  async function doPush() {
    var S = FF.state; if (S.date !== today()) return;
    var me = myCode && empByCode[myCode];

    if (me) {
      // Attendance (and selfie photo) first — the database only accepts GPS points while on duty.
      var a = S.attendance[myCode];
      if (a && a.in) {
        if (a.in.selfie && /^data:/.test(a.in.selfie) && !snap.selfie[myCode]) {
          var blob = await (await fetch(a.in.selfie)).blob();
          chk(await sb.storage.from('selfies').upload(selfiePath(myCode), blob, { upsert: true, contentType: 'image/jpeg' }));
          snap.selfie[myCode] = 1;
        }
        var row = attRow(myCode, a), k = stable(row);
        if (snap.att[myCode] !== k) {
          row.device = { app: APP_VERSION, gps: (S.status[myCode] || {}).mode || '', ua: navigator.userAgent.slice(0, 160) };
          chk(await sb.from('attendance').upsert(row, { onConflict: 'employee_id,work_date' }));
          snap.att[myCode] = k;
        }
      }
      // Device / GPS health
      var st = S.status[myCode], ps = snap.status[myCode];
      if (st && (!ps || ps.gps !== st.gps || st.last - ps.last >= 20000)) {
        chk(await sb.from('employee_status').upsert({ employee_id: me.uuid, tenant_id: tenant, gps: st.gps, accuracy: st.acc == null ? null : st.acc, mode: st.mode || null, last_seen_at: iso(st.last) }));
        snap.status[myCode] = { gps: st.gps, last: st.last };
      }
      // GPS points (thinned to one every 10 s or 40 m)
      var tr = S.track[myCode] || [], from = snap.track[myCode] || 0;
      if (from > tr.length) from = 0;
      if (tr.length > from) {
        var lastT = snap.trackT[myCode] || 0, lastP = null, rows = [];
        tr.slice(from).forEach(function (p) {
          if (rows.length && p.t - lastT < 10000 && FF.dist(lastP, p) < 40) return;
          rows.push({ tenant_id: tenant, employee_id: me.uuid, recorded_at: iso(p.t), lat: p.lat, lng: p.lng, accuracy: p.acc == null ? null : p.acc, source: p.sim ? 'sim' : 'device' });
          lastT = p.t; lastP = p;
        });
        if (rows.length) {
          var r = await sb.from('employee_locations').insert(rows);
          if (r.error && !/not on duty/i.test(r.error.message)) throw r.error;   // off-duty points are dropped by design
        }
        snap.track[myCode] = tr.length; snap.trackT[myCode] = lastT;
      }
      // Visits
      for (var id in S.visits) {
        var sv = SEED.visits.find(function (v) { return v.id === id; });
        if (!sv || sv.emp !== myCode) continue;
        var vr = visitRow(S.visits[id]), vk = stable(vr);
        if (snap.visits[id] !== vk) { chk(await sb.from('customer_visits').update(vr).eq('id', id)); snap.visits[id] = vk; }
      }
      // Collections (append-only receipts)
      var newCol = S.collections.filter(function (c) { return c.emp === myCode && !snap.coll[c.id]; });
      if (newCol.length) {
        chk(await sb.from('collection_transactions').upsert(newCol.map(function (c) {
          return { tenant_id: tenant, employee_id: me.uuid, visit_id: c.visit || null, loan_account_id: (visitMeta[c.visit] || {}).loanId || null,
            amount: c.amount, mode: c.mode, receipt_no: c.id, collected_at: iso(c.t), lat: c.lat == null ? null : c.lat, lng: c.lng == null ? null : c.lng };
        }), { onConflict: 'tenant_id,receipt_no', ignoreDuplicates: true }));
        newCol.forEach(function (c) { snap.coll[c.id] = 1; });
      }
    }
    // Expenses: staff submit their own; managers approve / reject anyone's.
    var newExp = (S.expenses || []).filter(function (x) { return me && x.emp === myCode && !snap.exp[x.id]; });
    if (newExp.length) {
      chk(await sb.from('expense_claims').upsert(newExp.map(function (x) {
        return { tenant_id: tenant, employee_id: me.uuid, ref: x.id, category: x.cat, amount: x.amount, note: x.note, status: 'Pending', created_at: iso(x.t) };
      }), { onConflict: 'tenant_id,ref', ignoreDuplicates: true }));
      newExp.forEach(function (x) { snap.exp[x.id] = 'Pending'; });
    }
    if (isManager) {
      for (var i = 0; i < (S.expenses || []).length; i++) {
        var x = S.expenses[i];
        if (snap.exp[x.id] && snap.exp[x.id] !== x.status) { chk(await sb.from('expense_claims').update({ status: x.status }).eq('tenant_id', tenant).eq('ref', x.id)); snap.exp[x.id] = x.status; }
      }
    }
    // Business audit trail
    var newAud = S.audit.filter(function (a) { return !snap.audit[auditKey(a)] && empByCode[a.emp]; });
    if (newAud.length) {
      chk(await sb.from('audit_logs').upsert(newAud.map(function (a) {
        return { tenant_id: tenant, employee_id: empByCode[a.emp].uuid, ref: auditKey(a), action: a.action, detail: a.detail || '', created_at: iso(a.t) };
      }), { onConflict: 'tenant_id,ref', ignoreDuplicates: true }));
      newAud.forEach(function (a) { snap.audit[auditKey(a)] = 1; });
    }
  }

  // ---------- realtime for managers ----------
  var pullTimer = null;
  function schedulePull() { clearTimeout(pullTimer); pullTimer = setTimeout(function () { Cloud.pull({ skipTrack: true }).catch(function () {}); }, 1200); }
  function subscribe() {
    var ch = Cloud.channel = sb.channel('ff360-' + tenant);
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'employee_locations', filter: 'tenant_id=eq.' + tenant }, function (m) {
      var p = m.new, e = empById[p.employee_id]; if (!e) return;
      var tr = FF.state.track[e.id] = FF.state.track[e.id] || [];
      tr.push({ lat: p.lat, lng: p.lng, acc: p.accuracy, t: ms(p.recorded_at) });
      snap.track[e.id] = tr.length;
      var s = FF.state.status[e.id] = FF.state.status[e.id] || { gps: 'ok' };
      s.last = Math.max(s.last || 0, ms(p.recorded_at)); s.acc = p.accuracy;
      emit();
    });
    ['attendance', 'employee_status', 'customer_visits', 'collection_transactions', 'expense_claims', 'audit_logs'].forEach(function (t) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: 'tenant_id=eq.' + tenant }, schedulePull);
    });
    ch.subscribe(function (s) { Cloud.status.realtime = s; emit(); });
  }

  // ---------- demo helper ----------
  Cloud.resetDay = async function () {
    if (!isAdmin) throw new Error('Only an admin can reset demo data');
    chk(await sb.rpc('demo_reset_day', { p_date: today() }));
    snap = blankSnap(); FF.state = blankState();
    await Cloud.pull();
  };
})();
