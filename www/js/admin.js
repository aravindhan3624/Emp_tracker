// FieldForce 360 - Manager dashboard
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = FF.esc;
  var tab = 'emp', branchFilter = '', selected = null, lastTable = null;

  // ---------- Simulated colleagues (stand-in for other employees' phones) ----------
  // Real employees (anyone who signs in on the mobile app) always take precedence.
  var BOT_CFG = { EMP002: { inAt: [9, 12], done: 1 }, EMP003: { inAt: [9, 4], done: 2, flag: 'V302' }, EMP004: { inAt: [9, 41], done: 1, gpsOff: true } };
  var bots = {}, botEvents = [];
  function todayAt(h, m) { var d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); }
  function jit(n) { return (Math.random() - .5) * n; }
  function outcomeFor(v, i) {
    var oc = CONFIG.visitType(v.type).outcomes;
    if (v.type !== 'COLLECTION') return { outcome: oc[0], amount: 0 };
    return [{ outcome: oc[0], amount: v.due, mode: 'UPI' }, { outcome: oc[1] || oc[0], amount: Math.round(v.due / 2), mode: 'Cash' }, { outcome: oc[2] || oc[0], amount: 0 }][i % 3];
  }
  function botComplete(bot, v, i, t) {
    var o = outcomeFor(v, i);
    Object.assign(v, o, { status: 'completed', completedAt: t, remarks: o.amount ? 'Payment received' : 'Customer met', receipt: o.amount ? 'RCPT-' + FF.state.date.replace(/-/g, '') + '-' + v.id.slice(1) + '7' : '' });
    if (o.amount) bot.collections.push({ id: v.receipt, emp: bot.id, visit: v.id, customer: v.customer, loan: v.loan, amount: o.amount, mode: o.mode, t: t });
    botEvents.unshift({ t: t, emp: bot.id, action: 'VISIT_COMPLETE', detail: v.customer + ' · ' + o.outcome + (o.amount ? ' · ' + FF.inr(o.amount) : '') });
  }
  function makeBot(id, cfg) {
    var emp = FF.emp(id), b = FF.branch(emp.branch), now = Date.now();
    var tIn = Math.min(todayAt(cfg.inAt[0], cfg.inAt[1]), now - 45 * 60000);
    var bot = { id: id, bot: true, att: { in: { t: tIn, lat: b.lat + .0002, lng: b.lng - .0002, late: cfg.inAt[0] * 60 + cfg.inAt[1] > 570 } }, track: [{ lat: b.lat, lng: b.lng, t: tIn }], collections: [], idx: cfg.done, dwell: 0, gpsOff: !!cfg.gpsOff,
      expenses: [{ id: 'EXP-' + id.slice(3) + '01', emp: id, cat: 'Fuel', amount: 180 + Number(id.slice(-1)) * 40, note: 'Two-wheeler fuel', t: tIn + 3600000, status: 'Pending' }],
      visits: SEED.visits.filter(function (v) { return v.emp === id; }).map(function (v) { return Object.assign({}, v, { status: 'pending' }); }) };
    botEvents.push({ t: tIn, emp: id, action: 'CHECK_IN', detail: b.name });
    var end = now - (cfg.gpsOff ? 7 : 1) * 60000, legT = (end - tIn) / Math.max(1, cfg.done), cur = { lat: b.lat, lng: b.lng }, t = tIn;
    for (var i = 0; i < cfg.done; i++) {
      var v = bot.visits[i];
      for (var k = 1; k <= 14; k++) bot.track.push({ lat: cur.lat + (v.lat - cur.lat) * k / 14 + jit(.0006), lng: cur.lng + (v.lng - cur.lng) * k / 14 + jit(.0006), t: t + legT * .7 * k / 14 });
      v.startedAt = t + legT * .72; v.startDist = cfg.flag === v.id ? 420 : 30 + Math.round(Math.random() * 60); v.flagged = cfg.flag === v.id;
      botEvents.push({ t: v.startedAt, emp: id, action: 'VISIT_START', detail: v.customer + ' · ' + FF.fmtDist(v.startDist) + (v.flagged ? ' · OUTSIDE GEOFENCE' : ' · verified') });
      botComplete(bot, v, i, t + legT * .95);
      t += legT; cur = v;
    }
    var last = bot.track[bot.track.length - 1]; last.t = end;
    bot.pos = last;
    bot.status = cfg.gpsOff ? { gps: 'off', last: end } : { gps: 'ok', last: end };
    if (cfg.gpsOff) botEvents.push({ t: end, emp: id, action: 'GPS_DISABLED', detail: 'Location services turned off on device' });
    return bot;
  }
  function initBots() { bots = {}; botEvents = []; Object.keys(BOT_CFG).forEach(function (id) { bots[id] = makeBot(id, BOT_CFG[id]); }); botEvents.sort(function (a, b) { return b.t - a.t; }); }
  function tickBots() {
    Object.keys(bots).forEach(function (id) {
      var bot = bots[id]; if (bot.gpsOff) return;
      var tgt = bot.visits[bot.idx] || FF.branch(FF.emp(id).branch);
      var d = FF.dist(bot.pos, tgt), now = Date.now(), p;
      if (d > 25) {
        var f = Math.min(1, 110 / d);
        p = { lat: bot.pos.lat + (tgt.lat - bot.pos.lat) * f + jit(.0002), lng: bot.pos.lng + (tgt.lng - bot.pos.lng) * f + jit(.0002), t: now };
        bot.track.push(p); bot.pos = p;
      } else if (bot.visits[bot.idx]) {
        var v = bot.visits[bot.idx];
        if (v.status === 'pending') { v.status = 'in_progress'; v.startedAt = now; v.startDist = Math.round(d); bot.dwell = 5; botEvents.unshift({ t: now, emp: id, action: 'VISIT_START', detail: v.customer + ' · ' + FF.fmtDist(d) + ' · verified' }); }
        else if (--bot.dwell <= 0) { botComplete(bot, v, bot.idx, now); bot.idx++; }
        bot.pos = Object.assign({}, bot.pos, { t: now });
      } else bot.pos = Object.assign({}, bot.pos, { t: now });
      bot.status = { gps: 'ok', last: now };
    });
  }

  // ---------- Unified view of all employees ----------
  function people() {
    FF.reload();
    var S = FF.state;
    return SEED.employees.filter(function (e) { return !branchFilter || e.branch === branchFilter; }).map(function (e) {
      var real = S.attendance[e.id];
      var src = real || !bots[e.id] ? {
        att: real, track: S.track[e.id] || [], status: S.status[e.id], visits: FF.visitsFor(e.id),
        collections: S.collections.filter(function (c) { return c.emp === e.id; }),
        expenses: (S.expenses || []).filter(function (x) { return x.emp === e.id; })
      } : bots[e.id];
      var tr = src.track || [], pos = src.pos || tr[tr.length - 1];
      var onDuty = !!(src.att && src.att.in && !src.att.out);
      var staleMs = (Number(CONFIG.cfg.tracking.staleAlertMin) || 3) * 60000;
      var stale = onDuty && CONFIG.on('liveTracking') && (!src.status || src.status.gps !== 'ok' || Date.now() - src.status.last > staleMs);
      var done = src.visits.filter(function (v) { return v.status === 'completed'; });
      return { e: e, b: FF.branch(e.branch), att: src.att, track: tr, pos: pos, status: src.status || {}, visits: CONFIG.on('visits') ? src.visits : [], collections: CONFIG.on('collections') ? src.collections : [], expenses: src.expenses || [], bot: !!src.bot,
        onDuty: onDuty, stale: stale, done: done.length, coll: src.collections.reduce(function (s, c) { return s + c.amount; }, 0), target: FF.target(e.id), km: FF.pathKm(tr) };
    });
  }
  function activity() {
    var ids = SEED.employees.filter(function (e) { return !branchFilter || e.branch === branchFilter; }).map(function (e) { return e.id; });
    var realIds = Object.keys(FF.state.attendance);
    return FF.state.audit.concat(botEvents.filter(function (ev) { return realIds.indexOf(ev.emp) < 0; }))
      .filter(function (a) { return ids.indexOf(a.emp) >= 0; }).sort(function (a, b) { return b.t - a.t; });
  }

  // ---------- Map ----------
  var map = L.map('map').setView([13.04, 80.23], 12); var fitted = false;
  window.addEventListener('load', function () { map.invalidateSize(); fitted = false; render(); });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  function vColor(v) { return v.status === 'completed' ? (v.flagged ? '#d97706' : '#16a34a') : v.status === 'in_progress' ? '#2563eb' : '#64748b'; }
  function drawMap(P) {
    layer.clearLayers();
    var all = [];
    SEED.branches.filter(function (b) { return !branchFilter || b.id === branchFilter; }).forEach(function (b) {
      L.marker([b.lat, b.lng], { icon: L.divIcon({ className: '', html: '<div class="bpin">🏦 ' + b.name.replace(' Branch', '') + '</div>', iconSize: null, iconAnchor: [30, 10] }), zIndexOffset: -100 }).addTo(layer);
      all.push([b.lat, b.lng]);
    });
    P.forEach(function (p) {
      var sel = selected === p.e.id, dim = selected && !sel;
      p.visits.forEach(function (v) {
        L.marker([v.lat, v.lng], { icon: L.divIcon({ className: '', html: '<div class="vpin" style="background:' + vColor(v) + ';outline:2px solid ' + p.e.color + '55"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), opacity: dim ? .35 : 1 })
          .bindTooltip('<b>' + esc(v.customer) + '</b><br>' + FF.typeLabel(v.type) + ' · ' + p.e.name + '<br>' + v.status.replace('_', ' ') + (v.amount ? ' · ' + FF.inr(v.amount) : '') + (v.flagged ? '<br>⚠ started ' + v.startDist + ' m from site' : '')).addTo(layer);
        all.push([v.lat, v.lng]);
      });
      if (p.track.length > 1) L.polyline(p.track.map(function (t) { return [t.lat, t.lng]; }), { color: p.e.color, weight: sel ? 5 : 3, opacity: dim ? .2 : sel ? .9 : .55 }).addTo(layer);
      if (p.onDuty && p.pos) {
        L.marker([p.pos.lat, p.pos.lng], { zIndexOffset: 1000, opacity: dim ? .5 : 1, icon: L.divIcon({ className: '', html: '<div class="emk' + (p.stale ? ' stale' : '') + '" style="background:' + p.e.color + '">' + FF.initials(p.e.name) + '</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
          .bindTooltip('<b>' + p.e.name + '</b> (' + p.e.id + ')<br>Last update ' + FF.ago(p.status.last) + (p.stale ? '<br>⚠ GPS ' + (p.status.gps || 'stale') : ''))
          .on('click', function () { select(p.e.id); }).addTo(layer);
      }
    });
    if (!fitted && all.length && map.getSize().x > 50) { map.invalidateSize(); map.fitBounds(all, { padding: [20, 20] }); fitted = true; }
  }
  function select(id) {
    selected = selected === id ? null : id;
    var P = people(), p = P.find(function (x) { return x.e.id === selected; });
    if (p) {
      var pts = p.track.map(function (t) { return [t.lat, t.lng]; }).concat(p.visits.map(function (v) { return [v.lat, v.lng]; }));
      if (pts.length) map.fitBounds(pts, { padding: [30, 30] });
      $('#mapHint').textContent = 'Showing ' + p.e.name + ' · click again to clear';
    } else { $('#mapHint').textContent = 'Click an employee to focus their route'; }
    render();
  }

  // ---------- KPIs & alerts ----------
  function drawKpis(P) {
    var present = P.filter(function (p) { return p.att; }).length, onDuty = P.filter(function (p) { return p.onDuty; }).length;
    var vt = P.reduce(function (s, p) { return s + p.visits.length; }, 0), vd = P.reduce(function (s, p) { return s + p.done; }, 0);
    var coll = P.reduce(function (s, p) { return s + p.coll; }, 0), tgt = P.reduce(function (s, p) { return s + p.target; }, 0);
    var flagged = P.reduce(function (s, p) { return s + p.visits.filter(function (v) { return v.flagged; }).length; }, 0);
    var km = P.reduce(function (s, p) { return s + p.km; }, 0);
    var late = P.filter(function (p) { return p.att && p.att.in.late; }).length;
    var pendExp = P.reduce(function (s, p) { return s + p.expenses.filter(function (x) { return x.status === 'Pending'; }).length; }, 0);
    var k = [['Total employees', P.length, SEED.branches.length + ' branches'], ['Present', present, (P.length - present) + ' absent · ' + late + ' late'], ['On duty now', onDuty, CONFIG.on('liveTracking') ? 'live tracking' : 'attendance only']];
    if (CONFIG.on('visits')) k.push(['Visits completed', vd + ' / ' + vt, Math.round(vd / Math.max(1, vt) * 100) + '% done']);
    if (CONFIG.on('collections')) k.push(['Collected today', FF.inr(coll), Math.round(coll / Math.max(1, tgt) * 100) + '% of ' + FF.inr(tgt)]);
    if (CONFIG.on('liveTracking')) k.push(['Distance travelled', km.toFixed(1) + ' km', 'all employees']);
    if (CONFIG.on('visits')) k.push(['Flagged visits', flagged, 'outside ' + FF.GEOFENCE + ' m geofence']);
    if (CONFIG.on('expenses')) k.push(['Expense claims', pendExp, 'awaiting approval']);
    $('#kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('');
  }
  function drawAlerts(P) {
    var a = [], tk = CONFIG.cfg.tracking, la =String(tk.lateAfter).split(':'), late = Date.now() > todayAt(Number(la[0]), Number(la[1]));
    if (!CONFIG.on('alerts')) { $('#alertCount').textContent = '–'; $('#alerts').innerHTML = '<p style="color:var(--muted)">Smart alerts are not included in the current plan.</p>'; return; }
    P.forEach(function (p) {
      var n = '<b>' + p.e.name + '</b> ';
      if (!p.att) a.push({ lv: late ? 'bad' : 'info', m: n + (late ? 'has not checked in (absent)' : 'not checked in yet') });
      else if (p.att.in.late) a.push({ lv: 'warn', m: n + 'checked in late at ' + FF.fmtTime(p.att.in.t) + ' (after ' + tk.lateAfter + ')' });
      if (p.onDuty && (p.status.gps === 'off' || p.status.gps === 'denied')) a.push({ lv: 'bad', m: n + 'GPS ' + (p.status.gps === 'denied' ? 'permission denied' : 'turned off') + ' since ' + FF.fmtTime(p.status.last) });
      else if (p.stale) a.push({ lv: 'warn', m: n + 'no location update for ' + FF.ago(p.status.last).replace(' ago', '') });
      if (p.att && p.att.in && FF.dist(p.att.in, p.b) > (Number(tk.branchRadiusM) || 500)) a.push({ lv: 'warn', m: n + 'checked in ' + FF.fmtDist(FF.dist(p.att.in, p.b)) + ' away from branch' });
      p.visits.filter(function (v) { return v.flagged; }).forEach(function (v) { a.push({ lv: 'warn', m: n + 'started visit to ' + esc(v.customer) + ' <b>' + FF.fmtDist(v.startDist) + '</b> outside geofence' }); });
    });
    var rank = { bad: 0, warn: 1, info: 2 }; a.sort(function (x, y) { return rank[x.lv] - rank[y.lv]; });
    $('#alertCount').textContent = a.filter(function (x) { return x.lv !== 'info'; }).length;
    $('#alertCount').className = 'tag ' + (a.some(function (x) { return x.lv === 'bad'; }) ? 'bad' : 'warn');
    var act = activity().slice(0, 12).map(function (ev) {
      return '<div class="alert"><div class="lv info"></div><div><b>' + FF.emp(ev.emp).name + '</b> · ' + ev.action.replace(/_/g, ' ').toLowerCase() + '<div style="color:var(--muted);font-size:12px">' + FF.fmtTime(ev.t) + ' · ' + esc(ev.detail) + '</div></div></div>';
    });
    $('#alerts').innerHTML = a.map(function (x) { return '<div class="alert"><div class="lv ' + x.lv + '"></div><div>' + x.m + '</div></div>'; }).join('') +
      '<div style="font-weight:600;margin:14px 0 4px;font-size:13px">Recent activity</div>' + (act.join('') || '<div style="color:var(--muted)">No activity yet</div>');
  }

  // ---------- Tables ----------
  function C(v, h) { return { v: v, h: h == null ? esc(v) : h }; }
  function tag(cls, t) { return '<span class="tag ' + cls + '">' + t + '</span>'; }
  function empCell(e) { return C(e.name + ' (' + e.id + ')', '<span class="av" style="background:' + e.color + '">' + FF.initials(e.name) + '</span>' + esc(e.name) + ' <span style="color:var(--muted)">' + e.id + '</span>'); }
  function tables(P) {
    if (tab === 'emp') return { head: ['Employee', 'Branch', 'Status', 'Check-in', 'Last update', 'GPS', 'Distance', 'Visits', 'Collection vs target'], rows: P.map(function (p) {
      var st = !p.att ? ['Absent', 'bad'] : p.att.out ? ['Checked out', ''] : ['On duty', 'ok'];
      var gps = !p.onDuty ? ['—', ''] : p.status.gps === 'ok' && !p.stale ? ['OK ±' + (p.pos && p.pos.acc || 10) + 'm', 'ok'] : [p.status.gps === 'ok' ? 'Stale' : p.status.gps === 'denied' ? 'Denied' : 'Off', 'bad'];
      var pct = Math.round(p.coll / Math.max(1, p.target) * 100);
      return { id: p.e.id, c: [empCell(p.e), C(p.b.name), C(st[0], tag(st[1], st[0])), C(FF.fmtTime(p.att && p.att.in.t)), C(p.onDuty ? FF.ago(p.status.last) : '—'), C(gps[0], gps[0] === '—' ? '—' : tag(gps[1], gps[0])),
        C(p.km.toFixed(1) + ' km'), C(p.done + '/' + p.visits.length), C(FF.inr(p.coll) + ' / ' + FF.inr(p.target), '<span class="mini"><i style="width:' + Math.min(100, pct) + '%"></i></span>' + FF.inr(p.coll) + ' <span style="color:var(--muted)">/ ' + FF.inr(p.target) + '</span>')] };
    }) };
    if (tab === 'att') return { head: ['Employee', 'Selfie', 'Branch', 'Date', 'Check-in', 'Check-in location', 'Check-out', 'Hours', 'Status'], rows: P.map(function (p) {
      var a = p.att, hrs = a ? ((a.out ? a.out.t : Date.now()) - a.in.t) / 3600000 : 0, sf = a && a.in.selfie;
      var stTxt = !a ? 'Absent' : (a.in.late ? 'Late' : 'Present') + (a.out ? '' : ' · on duty');
      return { id: p.e.id, c: [empCell(p.e), C(sf ? 'Yes' : '—', sf ? '<img src="' + sf + '" alt="selfie" style="width:30px;height:30px;border-radius:50%;object-fit:cover;vertical-align:middle">' : '—'), C(p.b.name), C(FF.state.date), C(FF.fmtTime(a && a.in.t)), C(a ? FF.fmtDist(FF.dist(a.in, p.b)) + ' from branch' : '—'), C(FF.fmtTime(a && a.out && a.out.t)), C(a ? hrs.toFixed(1) + ' h' : '—'),
        C(stTxt, tag(!a ? 'bad' : a.in.late ? 'warn' : 'ok', stTxt))] };
    }) };
    if (tab === 'exp') {
      var ex = [], rate = Number(CONFIG.cfg.expenses.perKmRate) || 0;
      P.forEach(function (p) {
        if (p.km > 0) ex.push({ id: p.e.id, t: 0, c: [C('TA-' + p.e.id), C('—'), empCell(p.e), C('Travel allowance (auto)'), C(p.km.toFixed(1) + ' km × ' + FF.inr(rate)), C(FF.inr(p.km * rate)), C('Auto', tag('info', 'Auto')), C('')] });
        p.expenses.forEach(function (x) {
          var cls = x.status === 'Approved' ? 'ok' : x.status === 'Rejected' ? 'bad' : 'warn';
          var act = x.status === 'Pending' ? '<button class="btn" data-exp="' + x.id + '" data-emp-id="' + p.e.id + '" data-act="Approved">Approve</button> <button class="btn" data-exp="' + x.id + '" data-emp-id="' + p.e.id + '" data-act="Rejected">Reject</button>' : '';
          ex.push({ id: p.e.id, t: x.t, c: [C(x.id), C(FF.fmtTime(x.t)), empCell(p.e), C(x.cat), C(x.note), C(FF.inr(x.amount)), C(x.status, tag(cls, x.status)), C('', act)] });
        });
      });
      ex.sort(function (a, b) { return b.t - a.t; });
      return { head: ['Claim', 'Time', 'Employee', 'Category', 'Description', 'Amount', 'Status', 'Action'], rows: ex };
    }
    if (tab === 'vis') {
      var rows = [];
      P.forEach(function (p) { p.visits.forEach(function (v) {
        var st = v.status === 'completed' ? 'ok' : v.status === 'in_progress' ? 'info' : '';
        rows.push({ id: p.e.id, t: v.completedAt || v.startedAt || 0, c: [empCell(p.e), C(v.customer), C(FF.typeLabel(v.type)), C(v.loan), C(v.status.replace('_', ' '), tag(st, v.status.replace('_', ' '))), C(FF.fmtTime(v.startedAt)),
          C(v.startDist != null ? FF.fmtDist(v.startDist) : '—'), C(v.status === 'pending' ? '—' : v.flagged ? 'Flagged' : 'GPS verified', v.status === 'pending' ? '—' : tag(v.flagged ? 'warn' : 'ok', v.flagged ? '⚠ Flagged' : '✓ Verified')), C(v.outcome || '—'), C(v.amount ? FF.inr(v.amount) : '—'),
          C(v.custom ? Object.keys(v.custom).map(function (k) { return k + ': ' + v.custom[k]; }).join('; ') : '')] });
      }); });
      rows.sort(function (a, b) { return b.t - a.t; });
      return { head: ['Employee', 'Customer', 'Type', 'Loan / App', 'Status', 'Started', 'Distance at start', 'Verification', 'Outcome', 'Amount', 'Form details'], rows: rows };
    }
    if (tab === 'col') {
      var list = [], total = 0;
      P.forEach(function (p) { p.collections.forEach(function (c) { total += c.amount; list.push({ id: p.e.id, t: c.t, c: [C(c.id), C(FF.fmtTime(c.t)), empCell(p.e), C(c.customer), C(c.loan), C(c.mode), C(FF.inr(c.amount), '<b>' + FF.inr(c.amount) + '</b>')] }); }); });
      list.sort(function (a, b) { return b.t - a.t; });
      list.push({ c: [C('TOTAL', '<b>Total</b>'), C(''), C(''), C(''), C(''), C(''), C(FF.inr(total), '<b>' + FF.inr(total) + '</b>')] });
      return { head: ['Receipt', 'Time', 'Employee', 'Customer', 'Loan', 'Mode', 'Amount'], rows: list };
    }
    return { head: ['Time', 'Employee', 'Action', 'Detail'], rows: activity().map(function (a) { return { id: a.emp, c: [C(FF.fmtTime(a.t)), empCell(FF.emp(a.emp)), C(a.action), C(a.detail)] }; }) };
  }
  function drawTable(P) {
    var T = lastTable = tables(P);
    $('#table').innerHTML = '<table><thead><tr>' + T.head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (T.rows.length ? T.rows.map(function (r) { return '<tr data-emp="' + (r.id || '') + '" class="' + (r.id && r.id === selected ? 'sel' : '') + '">' + r.c.map(function (c) { return '<td>' + c.h + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + T.head.length + '" style="color:var(--muted)">No records</td></tr>') + '</tbody></table>';
    document.querySelectorAll('#table tr[data-emp]').forEach(function (tr) { if (tr.dataset.emp) tr.onclick = function (ev) { if (ev.target.closest('[data-exp]')) return; select(tr.dataset.emp); }; });
    document.querySelectorAll('#table [data-exp]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.exp, emp = b.dataset.empId, st = b.dataset.act, x;
        FF.reload();
        x = (FF.state.expenses || []).find(function (e) { return e.id === id; });
        if (x) { x.status = st; FF.log(emp, 'EXPENSE_' + st.toUpperCase(), x.cat + ' · ' + FF.inr(x.amount)); FF.save(); }
        else if (bots[emp]) { x = bots[emp].expenses.find(function (e) { return e.id === id; }); if (x) x.status = st; }
        render();
      };
    });
  }
  $('#exportBtn').onclick = function () {
    if (!lastTable) return;
    var q = function (s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var csv = [lastTable.head.map(q).join(',')].concat(lastTable.rows.map(function (r) { return r.c.map(function (c) { return q(c.v); }).join(','); })).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = 'fieldforce360_' + tab + '_' + FF.state.date + '.csv'; a.click();
  };

  // ---------- Wiring ----------
  document.querySelectorAll('#tabs [data-t]').forEach(function (b) { b.onclick = function () { tab = b.dataset.t; document.querySelectorAll('#tabs [data-t]').forEach(function (x) { x.classList.toggle('active', x === b); }); render(); }; });
  SEED.branches.forEach(function (b) { var o = document.createElement('option'); o.value = b.id; o.textContent = b.name; $('#branchSel').appendChild(o); });
  $('#branchSel').onchange = function () { branchFilter = this.value; selected = null; fitted = false; render(); };
  $('#resetBtn').onclick = function () { if (!confirm("Reset today's demo data for all employees?")) return; FF.reset(); initBots(); selected = null; render(); };
  function applyConfig() {
    var co = CONFIG.cfg.company, plan = CONFIG.plan();
    CONFIG.applyBrand();
    document.title = co.appName + ' · Manager Dashboard';
    $('#appName').textContent = co.appName + ' · Manager Dashboard';
    document.querySelector('header .mark').textContent = co.logoText;
    $('#org').textContent = co.name + ' · Branch Manager view · ' + plan.name + ' plan';
    var show = { emp: true, att: true, vis: CONFIG.on('visits'), col: CONFIG.on('collections'), exp: CONFIG.on('expenses'), aud: CONFIG.on('reports') };
    document.querySelectorAll('#tabs [data-t]').forEach(function (b) { b.style.display = show[b.dataset.t] ? '' : 'none'; });
    $('#exportBtn').style.display = CONFIG.on('reports') ? '' : 'none';
    if (!show[tab]) { tab = 'emp'; document.querySelectorAll('#tabs [data-t]').forEach(function (x) { x.classList.toggle('active', x.dataset.t === 'emp'); }); }
  }
  applyConfig();

  function render() {
    var P = people();
    $('#clock').textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    drawKpis(P); drawMap(P); drawAlerts(P); drawTable(P);
  }
  initBots(); render();
  setInterval(function () { tickBots(); render(); }, 2500);
  window.addEventListener('storage', function (e) {
    if (e.key === CONFIG.CFG_KEY || e.key === CONFIG.PLANS_KEY) { CONFIG.reload(); applyConfig(); render(); }
    else if (e.key === FF.KEY) render();
  });
})();
