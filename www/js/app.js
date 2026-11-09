// FieldForce 360 - Employee mobile app
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var me = null, pos = null, watchId = null, simTimer = null, simTarget = null;
  var tab = 'home', openVisitId = null;
  var homeMap = null, homeLayers = null, visitMap = null, visitLayers = null;

  function pref(k, d) { try { return localStorage.getItem('ff360.' + k) || d; } catch (e) { return d; } }
  function setPref(k, v) { try { localStorage.setItem('ff360.' + k, v); } catch (e) {} }
  var gpsMode = pref('gpsMode', 'sim'); // 'sim' (demo route) | 'device' (real GPS)

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function S() { return FF.state; }
  function att() { return S().attendance[me.id]; }
  function onDuty() { var a = att(); return !!(a && a.in && !a.out); }
  function track() { return S().track[me.id] || []; }

  // ---------- Login ----------
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('#empId').value.trim().toUpperCase(), pin = $('#pin').value.trim();
    var emp = FF.emp(id);
    if (!emp || emp.pin !== pin) { $('#loginErr').textContent = 'Invalid Employee ID or PIN'; return; }
    setPref('session', emp.id);
    FF.reload(); FF.log(emp.id, 'LOGIN', 'Mobile app'); FF.save();
    enter(emp);
  });

  function enter(emp) {
    me = emp;
    $('#login').classList.add('hidden'); $('#shell').classList.remove('hidden');
    $('#hdrAvatar').textContent = FF.initials(me.name);
    var last = track()[track().length - 1];
    if (last) pos = last;
    if (onDuty()) startTracking(true);
    go('home');
  }

  function logout() {
    if (onDuty()) { toast('End your duty before signing out'); return; }
    stopTracking(); setPref('session', ''); me = null; pos = null;
    $('#shell').classList.add('hidden'); $('#login').classList.remove('hidden');
    $('#pin').value = '';
  }

  // ---------- Navigation ----------
  document.querySelectorAll('nav.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { go(b.dataset.tab); });
  });
  function go(t) {
    tab = t; if (t !== 'visit') openVisitId = null;
    ['home', 'visits', 'visit', 'coll', 'profile'].forEach(function (s) { $('#scr-' + s).classList.toggle('hidden', s !== t); });
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === t || (t === 'visit' && b.dataset.tab === 'visits')); });
    window.scrollTo(0, 0);
    render(true);
  }

  // ---------- GPS ----------
  function getDeviceFix() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(function (p) {
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: Date.now() });
      }, function (err) {
        FF.reload(); S().status[me.id] = { gps: err.code === 1 ? 'denied' : 'off', last: Date.now() };
        FF.log(me.id, err.code === 1 ? 'GPS_PERMISSION_DENIED' : 'GPS_UNAVAILABLE', err.message); FF.save();
        resolve(null);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    });
  }
  function simFix() {
    var b = FF.branch(me.branch);
    return { lat: b.lat + (Math.random() - .5) * .0006, lng: b.lng + (Math.random() - .5) * .0006, acc: 8 + Math.round(Math.random() * 10), t: Date.now(), sim: true };
  }

  function record(p) {
    pos = p;
    FF.reload();
    var tr = S().track[me.id] = S().track[me.id] || [];
    var last = tr[tr.length - 1];
    if (!last || FF.dist(last, p) > 8 || p.t - last.t > 30000) tr.push(p);
    if (tr.length > 2000) tr.splice(0, tr.length - 2000);
    S().status[me.id] = { gps: 'ok', last: p.t, acc: p.acc, mode: gpsMode };
    FF.save();
    render(false);
  }

  function nextTarget() {
    var vs = FF.visitsFor(me.id);
    var active = vs.find(function (v) { return v.status === 'in_progress'; });
    if (active) return active;
    if (simTarget) { var t = vs.find(function (v) { return v.id === simTarget && v.status === 'pending'; }); if (t) return t; }
    return vs.find(function (v) { return v.status === 'pending'; }) || FF.branch(me.branch);
  }
  function simStep() {
    if (!pos) pos = simFix();
    var tgt = nextTarget(), d = FF.dist(pos, tgt), step = 95;
    var p;
    if (d <= 25) {
      p = { lat: tgt.lat + (Math.random() - .5) * .0002, lng: tgt.lng + (Math.random() - .5) * .0002 };
    } else {
      var f = Math.min(1, step / d);
      p = { lat: pos.lat + (tgt.lat - pos.lat) * f + (Math.random() - .5) * .00015, lng: pos.lng + (tgt.lng - pos.lng) * f + (Math.random() - .5) * .00015 };
    }
    p.acc = 6 + Math.round(Math.random() * 12); p.t = Date.now(); p.sim = true;
    record(p);
  }

  function startTracking(resume) {
    stopTracking();
    if (gpsMode === 'sim') {
      simTimer = setInterval(simStep, 2500);
    } else if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(function (p) {
        record({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: Date.now() });
      }, function (err) {
        FF.reload(); S().status[me.id] = { gps: err.code === 1 ? 'denied' : 'off', last: Date.now() }; FF.save();
        toast('GPS signal lost — please enable location');
      }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    }
    if (!resume) render(true);
  }
  function stopTracking() {
    if (simTimer) clearInterval(simTimer); simTimer = null;
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null;
  }

  async function startDuty() {
    var p = gpsMode === 'sim' ? simFix() : await getDeviceFix();
    if (!p) { toast('Location permission is required to start duty'); render(true); return; }
    FF.reload();
    S().attendance[me.id] = { in: { t: p.t, lat: p.lat, lng: p.lng, acc: p.acc } };
    S().track[me.id] = [p];
    var dB = FF.dist(p, FF.branch(me.branch));
    FF.log(me.id, 'CHECK_IN', FF.branch(me.branch).name + ' · ' + FF.fmtDist(dB) + ' from branch');
    FF.save(); pos = p;
    toast('Checked in at ' + FF.fmtTime(p.t) + ' — tracking started');
    startTracking();
  }
  function endDuty() {
    var vs = FF.visitsFor(me.id);
    if (vs.some(function (v) { return v.status === 'in_progress'; })) { toast('Complete your active visit first'); return; }
    if (!confirm('End duty now? Location tracking will stop.')) return;
    stopTracking();
    FF.reload();
    var p = pos || simFix();
    S().attendance[me.id].out = { t: Date.now(), lat: p.lat, lng: p.lng };
    FF.log(me.id, 'CHECK_OUT', 'Distance ' + FF.pathKm(track()).toFixed(1) + ' km');
    FF.save();
    toast('Checked out. Tracking stopped.');
    render(true);
  }

  // ---------- Visits ----------
  function startVisit(id) {
    if (!onDuty()) { toast('Start duty before beginning a visit'); return; }
    if (!pos) { toast('Waiting for GPS fix…'); return; }
    var v = FF.visitsFor(me.id).find(function (x) { return x.id === id; });
    var d = FF.dist(pos, v);
    var flagged = d > FF.GEOFENCE;
    if (flagged && !confirm('You are ' + FF.fmtDist(d) + ' from the customer location (geofence ' + FF.GEOFENCE + ' m).\n\nVisits started outside the geofence are flagged for manager review. Continue?')) return;
    FF.reload();
    S().visits[id] = { status: 'in_progress', startedAt: Date.now(), startLoc: { lat: pos.lat, lng: pos.lng }, startDist: Math.round(d), flagged: flagged };
    FF.log(me.id, 'VISIT_START', v.customer + ' · ' + FF.fmtDist(d) + (flagged ? ' · OUTSIDE GEOFENCE' : ' · verified'));
    FF.save(); render(true);
  }
  function completeVisit(id) {
    var v = FF.visitsFor(me.id).find(function (x) { return x.id === id; });
    var outcome = $('#f-outcome').value, remarks = $('#f-remarks').value.trim();
    var amount = v.type === 'COLLECTION' ? Number($('#f-amount').value || 0) : 0;
    var mode = v.type === 'COLLECTION' ? $('#f-mode').value : '';
    if (!outcome) { toast('Select a visit outcome'); return; }
    if (v.type === 'COLLECTION' && (outcome === 'PAID' || outcome === 'PARTIAL') && !(amount > 0)) { toast('Enter the amount collected'); return; }
    if (amount > v.due * 2) { toast('Amount looks too high — please check'); return; }
    if (!remarks) { toast('Remarks are required'); return; }
    var p = pos || v;
    var receipt = amount > 0 ? 'RCPT-' + S().date.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000) : '';
    FF.reload();
    Object.assign(S().visits[id], { status: 'completed', completedAt: Date.now(), endLoc: { lat: p.lat, lng: p.lng }, outcome: outcome, amount: amount, mode: mode, receipt: receipt, remarks: remarks });
    if (amount > 0) S().collections.push({ id: receipt, emp: me.id, visit: id, customer: v.customer, loan: v.loan, amount: amount, mode: mode, t: Date.now(), lat: p.lat, lng: p.lng });
    FF.log(me.id, 'VISIT_COMPLETE', v.customer + ' · ' + outcome + (amount ? ' · ' + FF.inr(amount) + ' · ' + receipt : ''));
    FF.save();
    toast(amount ? 'Collected ' + FF.inr(amount) + ' · Receipt ' + receipt : 'Visit completed');
    simTarget = null;
    go('visits');
  }

  // ---------- Maps ----------
  function tiles(map) {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  }
  var meIcon = function () { return L.divIcon({ className: '', html: '<div class="me-marker"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }); };
  function pinIcon(v, n) {
    var c = v.status === 'completed' ? (v.flagged ? '#d97706' : '#16a34a') : v.status === 'in_progress' ? '#2563eb' : '#64748b';
    return L.divIcon({ className: '', html: '<div class="pin" style="background:' + c + '"><span>' + n + '</span></div>', iconSize: [26, 26], iconAnchor: [13, 26] });
  }
  function drawHomeMap() {
    var el = $('#homeMap'); if (!el) return;
    if (!homeMap || homeMap.getContainer() !== el) {
      if (homeMap) homeMap.remove();
      homeMap = L.map(el, { zoomControl: false, attributionControl: true }); tiles(homeMap);
      homeLayers = L.layerGroup().addTo(homeMap); homeMap._fitted = false;
    }
    homeLayers.clearLayers();
    var vs = FF.visitsFor(me.id), bounds = [];
    vs.forEach(function (v, i) { L.marker([v.lat, v.lng], { icon: pinIcon(v, i + 1) }).bindTooltip(v.customer).addTo(homeLayers); bounds.push([v.lat, v.lng]); });
    var tr = track();
    if (tr.length > 1) L.polyline(tr.map(function (p) { return [p.lat, p.lng]; }), { color: '#2563eb', weight: 4, opacity: .75 }).addTo(homeLayers);
    if (pos && onDuty()) { L.marker([pos.lat, pos.lng], { icon: meIcon() }).addTo(homeLayers); bounds.push([pos.lat, pos.lng]); }
    if (!homeMap._fitted) { homeMap.fitBounds(bounds, { padding: [24, 24] }); homeMap._fitted = true; }
    setTimeout(function () { homeMap.invalidateSize(); }, 50);
  }
  function drawVisitMap(v) {
    var el = $('#visitMap'); if (!el) return;
    if (!visitMap || visitMap.getContainer() !== el) {
      if (visitMap) visitMap.remove();
      visitMap = L.map(el, { zoomControl: false }); tiles(visitMap);
      visitLayers = L.layerGroup().addTo(visitMap); visitMap._fitted = false;
    }
    visitLayers.clearLayers();
    L.circle([v.lat, v.lng], { radius: FF.GEOFENCE, color: '#16a34a', weight: 1.5, fillOpacity: .08 }).addTo(visitLayers);
    L.marker([v.lat, v.lng], { icon: pinIcon(v, '★') }).addTo(visitLayers);
    var b = [[v.lat, v.lng]];
    if (pos && onDuty()) { L.marker([pos.lat, pos.lng], { icon: meIcon() }).addTo(visitLayers); b.push([pos.lat, pos.lng]); }
    if (!visitMap._fitted) { visitMap.fitBounds(L.latLngBounds(b).pad(0.4), { maxZoom: 16 }); visitMap._fitted = true; }
    setTimeout(function () { visitMap.invalidateSize(); }, 50);
  }

  // ---------- Rendering ----------
  function header() {
    var titles = { home: 'Hello, ' + me.name.split(' ')[0], visits: "Today's visits", visit: 'Visit details', coll: 'Collections', profile: 'Profile' };
    $('#hdrTitle').textContent = titles[tab];
    $('#hdrSub').textContent = me.id + ' · ' + FF.branch(me.branch).name + ' · ' + new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    var on = onDuty();
    $('#trackDot').classList.toggle('on', on);
    var st = S().status[me.id];
    $('#trackText').textContent = on
      ? 'Tracking active · last fix ' + FF.fmtTime(pos && pos.t) + (pos ? ' · ±' + pos.acc + ' m' : '') + (gpsMode === 'sim' ? ' · demo route' : '')
      : (st && st.gps === 'denied' ? 'Location permission denied — enable it to start duty' : 'Off duty — location tracking is off');
  }

  function summary() {
    var vs = FF.visitsFor(me.id), done = vs.filter(function (v) { return v.status === 'completed'; });
    var coll = done.reduce(function (s, v) { return s + (v.amount || 0); }, 0);
    return { vs: vs, done: done.length, total: vs.length, coll: coll, target: FF.target(me.id), km: FF.pathKm(track()) };
  }

  function visitCard(v, i) {
    var dist = pos && onDuty() ? FF.fmtDist(FF.dist(pos, v)) : '';
    var st = v.status === 'completed' ? (v.flagged ? '<span class="tag warn">Done · flagged</span>' : '<span class="tag ok">Done · GPS verified</span>')
      : v.status === 'in_progress' ? '<span class="tag info">In progress</span>' : '<span class="tag">Pending</span>';
    var abbr = { COLLECTION: '₹', ADDRESS: 'AV', DOCUMENT: 'DV', NEWLOAN: 'NL' }[v.type];
    return '<div class="card visit" data-visit="' + v.id + '"><div class="ic ' + v.type + '">' + abbr + '</div><div class="body">' +
      '<div class="row-between"><span class="name">' + (i + 1) + '. ' + FF.esc(v.customer) + '</span><span class="muted">' + dist + '</span></div>' +
      '<div class="addr">' + FF.esc(v.address) + '</div><div class="meta"><span class="tag">' + FF.TYPE_LABEL[v.type] + '</span>' +
      (v.due ? '<span class="tag' + (v.overdueDays > 15 ? ' bad' : '') + '">' + FF.inr(v.due) + ' · ' + v.overdueDays + 'd overdue</span>' : '') + st + '</div></div></div>';
  }

  function renderHome() {
    var s = summary(), a = att(), on = onDuty();
    var pct = s.target ? Math.min(100, Math.round(s.coll / s.target * 100)) : 0;
    var next = s.vs.find(function (v) { return v.status === 'in_progress'; }) || s.vs.find(function (v) { return v.status === 'pending'; });
    var duty;
    if (on) duty = '<div class="row-between" style="margin-bottom:12px"><div><b style="color:var(--ok)">On duty</b><div class="muted">Checked in at ' + FF.fmtTime(a.in.t) + '</div></div><span class="tag ok">GPS ' + (gpsMode === 'sim' ? 'demo' : 'live') + '</span></div><button class="btn btn-bad" id="endDuty">End Duty</button>';
    else if (a && a.out) duty = '<div class="row-between"><div><b>Duty completed</b><div class="muted">' + FF.fmtTime(a.in.t) + ' – ' + FF.fmtTime(a.out.t) + ' · ' + s.km.toFixed(1) + ' km</div></div><span class="tag">Checked out</span></div>';
    else duty = '<div style="margin-bottom:12px"><b>You are off duty</b><div class="muted">Starting duty records your attendance with GPS and starts location tracking until you end duty.</div></div><button class="btn btn-primary" id="startDuty">Start Duty</button>';
    if (!$('#homeTop')) $('#scr-home').innerHTML = '<div id="homeTop"></div><div class="card"><h3>My route today</h3><div class="map" id="homeMap"></div></div>';
    $('#homeTop').innerHTML =
      '<div class="card">' + duty + '</div>' +
      '<div class="card"><h3>Today</h3><div class="stats"><div class="stat"><b>' + s.done + '/' + s.total + '</b><span>Visits</span></div><div class="stat"><b>' + s.km.toFixed(1) + '</b><span>km travelled</span></div><div class="stat"><b>' + pct + '%</b><span>Target</span></div></div>' +
      '<div style="margin-top:12px" class="row-between"><span class="muted">Collected</span><b>' + FF.inr(s.coll) + ' <span class="muted">/ ' + FF.inr(s.target) + '</span></b></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
      (next ? '<div class="muted" style="margin:4px 2px 8px;font-weight:600">' + (next.status === 'in_progress' ? 'Active visit' : 'Next visit') + '</div>' + visitCard(next, s.vs.indexOf(next)) : '<div class="card"><b>All visits completed 🎉</b></div>');
    bind();
    drawHomeMap();
  }

  function renderVisits() {
    var s = summary();
    $('#scr-visits').innerHTML = '<div class="muted" style="margin:0 2px 10px">' + s.done + ' of ' + s.total + ' completed · tap a visit for details</div>' + s.vs.map(visitCard).join('');
    bind();
  }

  function renderVisit(full) {
    var vs = FF.visitsFor(me.id), v = vs.find(function (x) { return x.id === openVisitId; });
    if (!v) return go('visits');
    var d = pos && onDuty() ? FF.dist(pos, v) : null;
    var geo = d == null ? '<div class="geo out">Start duty to verify your location</div>'
      : d <= FF.GEOFENCE ? '<div class="geo in">✓ Inside customer geofence · ' + FF.fmtDist(d) + ' away</div>'
        : '<div class="geo out">⚠ Outside geofence · ' + FF.fmtDist(d) + ' away (limit ' + FF.GEOFENCE + ' m)</div>';
    if (!full && $('#geoBox')) { $('#geoBox').innerHTML = geo; drawVisitMap(v); return; }
    var action = '';
    if (v.status === 'pending') {
      action = '<button class="btn btn-ghost" id="navTo">' + (simTarget === v.id ? 'Heading here (demo route)…' : 'Navigate here') + '</button><button class="btn btn-primary" id="startVisit">Start Visit</button>';
    } else if (v.status === 'in_progress') {
      var isColl = v.type === 'COLLECTION';
      var opts = isColl ? [['PAID', 'Paid in full'], ['PARTIAL', 'Partial payment'], ['PTP', 'Promise to pay'], ['NOT_AVAILABLE', 'Customer not available'], ['REFUSED', 'Refused to pay']]
        : [['VERIFIED', 'Verified — positive'], ['DISCREPANCY', 'Discrepancy found'], ['NOT_AVAILABLE', 'Customer not available'], ['ADDRESS_NOT_FOUND', 'Address not found']];
      action = '<h3 style="margin-top:4px">Complete visit</h3>' +
        '<div class="field"><label>Outcome</label><select id="f-outcome"><option value="">Select…</option>' + opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></div>' +
        (isColl ? '<div class="field"><label>Amount collected (₹)</label><input id="f-amount" type="number" inputmode="numeric" min="0" placeholder="Due ' + v.due + '"></div><div class="field"><label>Payment mode</label><select id="f-mode"><option>UPI</option><option>Cash</option><option>Cheque</option></select></div>' : '') +
        '<div class="field"><label>Remarks</label><textarea id="f-remarks" placeholder="Visit notes"></textarea></div>' +
        '<button class="btn btn-ok" id="completeVisit">Submit &amp; complete</button>';
    } else {
      action = '<dl class="kv"><dt>Outcome</dt><dd>' + v.outcome + '</dd>' + (v.amount ? '<dt>Collected</dt><dd>' + FF.inr(v.amount) + ' (' + v.mode + ')</dd><dt>Receipt</dt><dd>' + v.receipt + '</dd>' : '') +
        '<dt>Started</dt><dd>' + FF.fmtTime(v.startedAt) + ' · ' + FF.fmtDist(v.startDist) + ' from site</dd><dt>Completed</dt><dd>' + FF.fmtTime(v.completedAt) + '</dd><dt>Verification</dt><dd>' + (v.flagged ? '⚠ Flagged — outside geofence' : '✓ GPS verified') + '</dd></dl>' +
        '<p class="muted" style="margin:10px 0 0">' + FF.esc(v.remarks) + '</p>';
    }
    $('#scr-visit').innerHTML =
      '<button class="btn btn-ghost" id="backBtn" style="width:auto;padding:8px 14px;margin-bottom:10px">← All visits</button>' +
      '<div class="card"><div class="row-between"><h3 style="margin:0">' + FF.esc(v.customer) + '</h3><span class="tag">' + FF.TYPE_LABEL[v.type] + '</span></div>' +
      '<p class="muted" style="margin:6px 0 10px">' + FF.esc(v.address) + '</p>' +
      '<dl class="kv"><dt>Loan / App ref</dt><dd>' + v.loan + '</dd>' + (v.due ? '<dt>EMI due</dt><dd>' + FF.inr(v.due) + '</dd><dt>Overdue</dt><dd>' + v.overdueDays + ' days</dd>' : '') + '</dl></div>' +
      '<div class="card"><div id="geoBox">' + geo + '</div><div class="map" id="visitMap" style="height:200px"></div></div>' +
      '<div class="card">' + action + '</div>';
    bind();
    drawVisitMap(v);
  }

  function renderColl() {
    var s = summary(), list = S().collections.filter(function (c) { return c.emp === me.id; });
    var pct = s.target ? Math.min(100, Math.round(s.coll / s.target * 100)) : 0;
    var pend = s.vs.filter(function (v) { return v.type === 'COLLECTION' && v.status !== 'completed'; });
    $('#scr-coll').innerHTML =
      '<div class="card"><div class="row-between"><span class="muted">Collected today</span><span class="tag ' + (pct >= 100 ? 'ok' : 'info') + '">' + pct + '% of target</span></div><div style="font-size:26px;font-weight:700;margin:4px 0">' + FF.inr(s.coll) + '</div><div class="bar"><i style="width:' + pct + '%"></i></div><div class="muted">Target ' + FF.inr(s.target) + ' · ' + list.length + ' receipt(s)</div></div>' +
      '<div class="card"><h3>Receipts</h3>' + (list.length ? list.map(function (c) { return '<div class="coll-row"><div><b>' + FF.esc(c.customer) + '</b><div class="muted">' + c.id + ' · ' + c.mode + ' · ' + FF.fmtTime(c.t) + '</div></div><b>' + FF.inr(c.amount) + '</b></div>'; }).join('') : '<p class="muted">No collections yet today.</p>') + '</div>' +
      '<div class="card"><h3>Pending accounts</h3>' + (pend.length ? pend.map(function (v) { return '<div class="coll-row"><div><b>' + FF.esc(v.customer) + '</b><div class="muted">' + v.loan + ' · ' + v.overdueDays + 'd overdue</div></div><b>' + FF.inr(v.due) + '</b></div>'; }).join('') : '<p class="muted">None 🎉</p>') + '</div>';
  }

  function renderProfile() {
    var b = FF.branch(me.branch);
    $('#scr-profile').innerHTML =
      '<div class="card"><div class="row-between"><div><h3 style="margin:0">' + me.name + '</h3><div class="muted">' + me.role + '</div></div><div class="logo-mark" style="background:' + me.color + ';color:#fff">' + FF.initials(me.name) + '</div></div>' +
      '<dl class="kv" style="margin-top:12px"><dt>Employee ID</dt><dd>' + me.id + '</dd><dt>Branch</dt><dd>' + b.name + '</dd><dt>Organisation</dt><dd>' + SEED.org.name + '</dd></dl></div>' +
      '<div class="card"><h3>GPS source</h3><div class="seg"><button data-gps="sim" class="' + (gpsMode === 'sim' ? 'active' : '') + '">Demo route</button><button data-gps="device" class="' + (gpsMode === 'device' ? 'active' : '') + '">Device GPS</button></div>' +
      '<p class="muted" style="margin:8px 0 0">Demo route simulates movement towards your next visit. Device GPS uses the phone\'s real location.</p></div>' +
      '<div class="card"><h3>Privacy notice</h3><div class="notice">Your location is recorded only between <b>Start Duty</b> and <b>End Duty</b>, to verify attendance and customer visits. It is visible to your branch manager and retained for 90 days as per company policy. You will always see the tracking status at the top of the app.</div></div>' +
      '<div class="card"><button class="btn btn-ghost" id="resetDemo">Reset demo data</button><button class="btn btn-bad" id="logout">Sign out</button></div>';
    bind();
  }

  function render(full) {
    if (!me) return;
    FF.reload(); header();
    if (tab === 'home') renderHome();
    else if (tab === 'visits') renderVisits();
    else if (tab === 'visit') renderVisit(full);
    else if (tab === 'coll' && full) renderColl();
    else if (tab === 'profile' && full) renderProfile();
  }

  function bind() {
    var on = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = fn; };
    on('startDuty', startDuty); on('endDuty', endDuty); on('logout', logout);
    on('backBtn', function () { go('visits'); });
    on('startVisit', function () { startVisit(openVisitId); });
    on('completeVisit', function () { completeVisit(openVisitId); });
    on('navTo', function () { if (gpsMode !== 'sim') { window.open('https://www.openstreetmap.org/directions?route=;' + FF.visitsFor(me.id).find(function (x) { return x.id === openVisitId; }).lat + ',' + FF.visitsFor(me.id).find(function (x) { return x.id === openVisitId; }).lng); return; } simTarget = openVisitId; toast('Demo route: heading to customer'); render(true); });
    on('resetDemo', function () { if (onDuty() && !confirm('Reset all demo data (attendance, visits, collections)?')) return; stopTracking(); FF.reset(); pos = null; toast('Demo data reset'); go('home'); });
    document.querySelectorAll('[data-visit]').forEach(function (el) { el.onclick = function () { openVisitId = el.dataset.visit; go('visit'); }; });
    document.querySelectorAll('[data-gps]').forEach(function (el) {
      el.onclick = function () {
        gpsMode = el.dataset.gps; setPref('gpsMode', gpsMode);
        if (onDuty()) startTracking(true);
        toast(gpsMode === 'sim' ? 'Using demo route' : 'Using device GPS');
        render(true);
      };
    });
  }

  // Keep in sync if data changes in another tab (e.g. reset from dashboard)
  window.addEventListener('storage', function (e) {
    if (e.key !== FF.KEY || !me) return;
    FF.reload();
    if (!onDuty() && (simTimer || watchId != null)) { stopTracking(); pos = null; render(true); return; }
    render(false);
  });

  var saved = pref('session', '');
  if (saved && FF.emp(saved)) enter(FF.emp(saved));
})();
