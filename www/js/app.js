// FieldForce 360 - Employee mobile app (all behaviour driven by CONFIG, see js/config.js)
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var me = null, pos = null, watchId = null, simTimer = null, simTarget = null;
  var tab = 'home', openVisitId = null;
  var homeMap = null, homeLayers = null, visitMap = null, visitLayers = null;
  var C = function () { return CONFIG.cfg; };

  function pref(k, d) { try { return localStorage.getItem('ff360.' + k) || d; } catch (e) { return d; } }
  function setPref(k, v) { try { localStorage.setItem('ff360.' + k, v); } catch (e) {} }
  var gpsMode = pref('gpsMode', 'sim'); // 'sim' (demo route) | 'device' (real GPS)

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  function S() { return FF.state; }
  function att() { return S().attendance[me.id]; }
  function onDuty() { var a = att(); return !!(a && a.in && !a.out); }
  function track() { return S().track[me.id] || []; }
  function minutesOf(hhmm) { var p = String(hhmm || '00:00').split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function term(k) { return C().terminology[k] || k; }
  function plural(w) { return /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : /(s|x|ch|sh)$/i.test(w) ? w + 'es' : w + 's'; }

  // ---------- Branding & modules ----------
  function applyConfig() {
    CONFIG.applyBrand();
    var co = C().company;
    document.title = co.appName;
    document.querySelectorAll('.logo-mark').forEach(function (el) { if (!el.dataset.keep) el.textContent = co.logoText; });
    $('#loginTitle').textContent = co.appName;
    $('#loginOrg').textContent = co.name;
    var tabs = { home: true, visits: CONFIG.on('visits'), coll: CONFIG.on('collections'), exp: CONFIG.on('expenses'), profile: true }, n = 0;
    document.querySelectorAll('nav.tabs button').forEach(function (b) { var on = tabs[b.dataset.tab]; b.classList.toggle('hidden', !on); if (on) n++; });
    $('nav.tabs').style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';
    $('#tabVisitsLbl').textContent = plural(term('visit'));
    if (me && !tabs[tab === 'visit' ? 'visits' : tab]) go('home');
  }

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
    ['home', 'visits', 'visit', 'coll', 'exp', 'profile'].forEach(function (s) { $('#scr-' + s).classList.toggle('hidden', s !== t); });
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === t || (t === 'visit' && b.dataset.tab === 'visits')); });
    window.scrollTo(0, 0);
    render(true);
  }

  // ---------- Selfie (module: selfie) ----------
  function takeSelfie() {
    return new Promise(function (resolve) {
      var ov = $('#selfieOverlay'), video = $('#selfieVideo'), stream = null;
      ov.classList.remove('hidden'); $('#selfieMsg').textContent = 'Starting camera…';
      function done(url) {
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        ov.classList.add('hidden'); resolve(url);
      }
      function shrink(src) {
        var c = document.createElement('canvas'); c.width = 160; c.height = 160;
        var g = c.getContext('2d'), w = src.videoWidth || src.width, h = src.videoHeight || src.height, s = Math.min(w, h);
        g.drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 160, 160);
        return c.toDataURL('image/jpeg', 0.7);
      }
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(function (s) {
          stream = s; video.srcObject = s; video.play(); $('#selfieMsg').textContent = 'Look at the camera and tap Capture';
        }).catch(function () { $('#selfieMsg').textContent = 'Camera unavailable — upload a photo instead'; });
      } else $('#selfieMsg').textContent = 'Camera unavailable — upload a photo instead';
      $('#selfieCapture').onclick = function () { if (!stream) { toast('Camera not ready'); return; } done(shrink(video)); };
      $('#selfieFile').onchange = function () {
        var f = this.files[0]; if (!f) return;
        var img = new Image(); img.onload = function () { done(shrink(img)); }; img.src = URL.createObjectURL(f); this.value = '';
      };
      $('#selfieDemo').onclick = function () {
        var c = document.createElement('canvas'); c.width = c.height = 160; var g = c.getContext('2d');
        g.fillStyle = me.color; g.fillRect(0, 0, 160, 160); g.fillStyle = '#fff'; g.font = 'bold 60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(FF.initials(me.name), 80, 84); done(c.toDataURL('image/jpeg', 0.7));
      };
      $('#selfieCancel').onclick = function () { done(null); };
    });
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
    if (!onDuty()) return;
    var tr = S().track[me.id] = S().track[me.id] || [];
    var last = tr[tr.length - 1], every = (Number(C().tracking.intervalSec) || 30) * 1000;
    if (!last || p.sim || FF.dist(last, p) > 25 || p.t - last.t >= every) tr.push(p);
    if (tr.length > 3000) tr.splice(0, tr.length - 3000);
    S().status[me.id] = { gps: 'ok', last: p.t, acc: p.acc, mode: gpsMode };
    FF.save();
    // Auto end duty when working hours end (only if duty started before end time)
    var tk = C().tracking, a = att(), inMin = new Date(a.in.t).getHours() * 60 + new Date(a.in.t).getMinutes();
    if (tk.autoStopAtWorkEnd && inMin < minutesOf(tk.workEnd) && nowMin() >= minutesOf(tk.workEnd) &&
        !FF.visitsFor(me.id).some(function (v) { return v.status === 'in_progress'; })) {
      checkout('Auto check-out at end of working hours'); toast('Working hours over — duty ended, tracking stopped'); return;
    }
    render(false);
  }

  function nextTarget() {
    var vs = FF.visitsFor(me.id);
    var active = vs.find(function (v) { return v.status === 'in_progress'; });
    if (active) return active;
    if (simTarget) { var t = vs.find(function (v) { return v.id === simTarget && v.status === 'pending'; }); if (t) return t; }
    return (CONFIG.on('visits') && vs.find(function (v) { return v.status === 'pending'; })) || FF.branch(me.branch);
  }
  function simStep() {
    if (!pos) pos = simFix();
    var tgt = nextTarget(), d = FF.dist(pos, tgt), step = 95, p;
    if (d <= 25) p = { lat: tgt.lat + (Math.random() - .5) * .0002, lng: tgt.lng + (Math.random() - .5) * .0002 };
    else {
      var f = Math.min(1, step / d);
      p = { lat: pos.lat + (tgt.lat - pos.lat) * f + (Math.random() - .5) * .00015, lng: pos.lng + (tgt.lng - pos.lng) * f + (Math.random() - .5) * .00015 };
    }
    p.acc = 6 + Math.round(Math.random() * 12); p.t = Date.now(); p.sim = true;
    record(p);
  }

  function startTracking(resume) {
    stopTracking();
    if (!CONFIG.on('liveTracking')) { if (!resume) render(true); return; }
    if (gpsMode === 'sim') simTimer = setInterval(simStep, 2500);
    else if (navigator.geolocation) {
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
    var tk = C().tracking, n = nowMin();
    if (n < minutesOf(tk.workStart) - 60 || n >= minutesOf(tk.workEnd)) {
      if (!confirm('Working hours are ' + tk.workStart + '–' + tk.workEnd + '. Start duty outside working hours?')) return;
    }
    var selfie = null;
    if (CONFIG.on('selfie')) { selfie = await takeSelfie(); if (!selfie) { toast('Selfie is required to start duty'); return; } }
    var p = gpsMode === 'sim' ? simFix() : await getDeviceFix();
    if (!p) { toast('Location permission is required to start duty'); render(true); return; }
    FF.reload();
    var late = n > minutesOf(tk.lateAfter);
    S().attendance[me.id] = { in: { t: p.t, lat: p.lat, lng: p.lng, acc: p.acc, selfie: selfie, late: late } };
    S().track[me.id] = [p];
    var dB = FF.dist(p, FF.branch(me.branch));
    FF.log(me.id, 'CHECK_IN', FF.branch(me.branch).name + ' · ' + FF.fmtDist(dB) + ' from branch' + (selfie ? ' · selfie' : '') + (late ? ' · LATE' : ''));
    FF.save(); pos = p;
    toast('Checked in at ' + FF.fmtTime(p.t) + (CONFIG.on('liveTracking') ? ' — tracking started' : ''));
    startTracking();
  }
  function checkout(note) {
    stopTracking();
    FF.reload();
    var p = pos || simFix();
    S().attendance[me.id].out = { t: Date.now(), lat: p.lat, lng: p.lng };
    FF.log(me.id, 'CHECK_OUT', (note ? note + ' · ' : '') + 'Distance ' + FF.pathKm(track()).toFixed(1) + ' km');
    FF.save(); render(true);
  }
  function endDuty() {
    if (FF.visitsFor(me.id).some(function (v) { return v.status === 'in_progress'; })) { toast('Complete your active visit first'); return; }
    if (!confirm('End duty now? Location tracking will stop.')) return;
    checkout(); toast('Checked out. Tracking stopped.');
  }

  // ---------- Visits ----------
  function startVisit(id) {
    if (!onDuty()) { toast('Start duty before beginning a visit'); return; }
    if (!pos) { toast('Waiting for GPS fix…'); return; }
    var v = FF.visitsFor(me.id).find(function (x) { return x.id === id; });
    var d = FF.dist(pos, v), flagged = d > FF.GEOFENCE;
    if (flagged && C().tracking.outsideGeofence === 'block') { toast('You must be within ' + FF.GEOFENCE + ' m of the ' + term('customer').toLowerCase() + ' (now ' + FF.fmtDist(d) + ')'); return; }
    if (flagged && !confirm('You are ' + FF.fmtDist(d) + ' from the ' + term('customer').toLowerCase() + ' location (geofence ' + FF.GEOFENCE + ' m).\n\nVisits started outside the geofence are flagged for manager review. Continue?')) return;
    FF.reload();
    S().visits[id] = { status: 'in_progress', startedAt: Date.now(), startLoc: { lat: pos.lat, lng: pos.lng }, startDist: Math.round(d), flagged: flagged };
    FF.log(me.id, 'VISIT_START', v.customer + ' · ' + FF.fmtDist(d) + (flagged ? ' · OUTSIDE GEOFENCE' : ' · verified'));
    FF.save(); render(true);
  }
  function completeVisit(id) {
    var v = FF.visitsFor(me.id).find(function (x) { return x.id === id; }), vt = CONFIG.visitType(v.type);
    var pays = vt.collectsPayment && CONFIG.on('collections');
    var outcome = $('#f-outcome').value, remarks = $('#f-remarks').value.trim();
    var amount = pays ? Number($('#f-amount').value || 0) : 0, mode = pays ? $('#f-mode').value : '';
    if (!outcome) { toast('Select an outcome'); return; }
    if (pays && /paid|partial/i.test(outcome) && !(amount > 0)) { toast('Enter the amount collected'); return; }
    var maxPct = Number(C().collections.maxAmountPctOfDue) || 200;
    if (pays && v.due && amount > v.due * maxPct / 100) { toast('Amount exceeds ' + maxPct + '% of due — please check'); return; }
    var custom = {};
    if (CONFIG.on('customForms')) {
      for (var i = 0; i < (vt.fields || []).length; i++) {
        var f = vt.fields[i], el = document.getElementById('cf-' + f.key), val = el ? el.value.trim() : '';
        if (f.required && !val) { toast(f.label + ' is required'); return; }
        if (val) custom[f.label] = val;
      }
    }
    if (!remarks) { toast('Remarks are required'); return; }
    var p = pos || v;
    var receipt = amount > 0 ? (C().collections.receiptPrefix || 'RCPT') + '-' + S().date.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000) : '';
    FF.reload();
    Object.assign(S().visits[id], { status: 'completed', completedAt: Date.now(), endLoc: { lat: p.lat, lng: p.lng }, outcome: outcome, amount: amount, mode: mode, receipt: receipt, remarks: remarks, custom: custom });
    if (amount > 0) S().collections.push({ id: receipt, emp: me.id, visit: id, customer: v.customer, loan: v.loan, amount: amount, mode: mode, t: Date.now(), lat: p.lat, lng: p.lng });
    FF.log(me.id, 'VISIT_COMPLETE', v.customer + ' · ' + outcome + (amount ? ' · ' + FF.inr(amount) + ' · ' + receipt : ''));
    FF.save();
    toast(amount ? 'Collected ' + FF.inr(amount) + ' · Receipt ' + receipt : term('visit') + ' completed');
    simTarget = null;
    go('visits');
  }

  // ---------- Expenses ----------
  function submitExpense() {
    var cat = $('#e-cat').value, amt = Number($('#e-amt').value || 0), note = $('#e-note').value.trim(), max = Number(C().expenses.maxClaim) || 0;
    if (!(amt > 0)) { toast('Enter an amount'); return; }
    if (max && amt > max) { toast('Maximum per claim is ' + FF.inr(max)); return; }
    if (!note) { toast('Add a short description'); return; }
    FF.reload();
    S().expenses.push({ id: 'EXP-' + Date.now().toString().slice(-6), emp: me.id, cat: cat, amount: amt, note: note, t: Date.now(), status: 'Pending' });
    FF.log(me.id, 'EXPENSE_CLAIM', cat + ' · ' + FF.inr(amt) + ' · ' + note); FF.save();
    toast('Claim submitted for approval'); render(true);
  }

  // ---------- Maps ----------
  function tiles(map) { L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map); }
  var meIcon = function () { return L.divIcon({ className: '', html: '<div class="me-marker"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }); };
  function pinIcon(v, n) {
    var c = v.status === 'completed' ? (v.flagged ? '#d97706' : '#16a34a') : v.status === 'in_progress' ? '#2563eb' : '#64748b';
    return L.divIcon({ className: '', html: '<div class="pin" style="background:' + c + '"><span>' + n + '</span></div>', iconSize: [26, 26], iconAnchor: [13, 26] });
  }
  function drawHomeMap() {
    var el = $('#homeMap'); if (!el) return;
    if (!homeMap || homeMap.getContainer() !== el) {
      if (homeMap) homeMap.remove();
      homeMap = L.map(el, { zoomControl: false }); tiles(homeMap);
      homeLayers = L.layerGroup().addTo(homeMap); homeMap._fitted = false;
    }
    homeLayers.clearLayers();
    var vs = CONFIG.on('visits') ? FF.visitsFor(me.id) : [], b = FF.branch(me.branch), bounds = [[b.lat, b.lng]];
    vs.forEach(function (v, i) { L.marker([v.lat, v.lng], { icon: pinIcon(v, i + 1) }).bindTooltip(v.customer).addTo(homeLayers); bounds.push([v.lat, v.lng]); });
    var tr = track();
    if (tr.length > 1) L.polyline(tr.map(function (p) { return [p.lat, p.lng]; }), { color: '#2563eb', weight: 4, opacity: .75 }).addTo(homeLayers);
    if (pos && onDuty()) { L.marker([pos.lat, pos.lng], { icon: meIcon() }).addTo(homeLayers); bounds.push([pos.lat, pos.lng]); }
    if (!homeMap._fitted) { homeMap.fitBounds(L.latLngBounds(bounds).pad(0.15), { maxZoom: 15 }); homeMap._fitted = true; }
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
    var titles = { home: 'Hello, ' + me.name.split(' ')[0], visits: "Today's " + plural(term('visit')).toLowerCase(), visit: term('visit') + ' details', coll: 'Collections', exp: 'Expenses', profile: 'Profile' };
    $('#hdrTitle').textContent = titles[tab];
    $('#hdrSub').textContent = me.id + ' · ' + FF.branch(me.branch).name + ' · ' + new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    var on = onDuty(), live = on && CONFIG.on('liveTracking');
    $('#trackDot').classList.toggle('on', live);
    var st = S().status[me.id];
    $('#trackText').textContent = live
      ? 'Tracking active · last fix ' + FF.fmtTime(pos && pos.t) + (pos ? ' · ±' + pos.acc + ' m' : '') + (gpsMode === 'sim' ? ' · demo route' : '')
      : on ? 'On duty · attendance only (live tracking not enabled)'
        : (st && st.gps === 'denied' ? 'Location permission denied — enable it to start duty' : 'Off duty — location tracking is off');
  }

  function summary() {
    var vs = CONFIG.on('visits') ? FF.visitsFor(me.id) : [], done = vs.filter(function (v) { return v.status === 'completed'; });
    var coll = done.reduce(function (s, v) { return s + (v.amount || 0); }, 0);
    return { vs: vs, done: done.length, total: vs.length, coll: coll, target: FF.target(me.id), km: FF.pathKm(track()) };
  }

  function visitCard(v, i) {
    var vt = CONFIG.visitType(v.type), dist = pos && onDuty() ? FF.fmtDist(FF.dist(pos, v)) : '';
    var st = v.status === 'completed' ? (v.flagged ? '<span class="tag warn">Done · flagged</span>' : '<span class="tag ok">Done · GPS verified</span>')
      : v.status === 'in_progress' ? '<span class="tag info">In progress</span>' : '<span class="tag">Pending</span>';
    var known = ['COLLECTION', 'ADDRESS', 'DOCUMENT', 'NEWLOAN'].indexOf(v.type) >= 0 ? v.type : 'ADDRESS';
    return '<div class="card visit" data-visit="' + v.id + '"><div class="ic ' + known + '">' + FF.esc(vt.abbr) + '</div><div class="body">' +
      '<div class="row-between"><span class="name">' + (i + 1) + '. ' + FF.esc(v.customer) + '</span><span class="muted">' + dist + '</span></div>' +
      '<div class="addr">' + FF.esc(v.address) + '</div><div class="meta"><span class="tag">' + FF.esc(vt.label) + '</span>' +
      (v.due && CONFIG.on('collections') ? '<span class="tag' + (v.overdueDays > 15 ? ' bad' : '') + '">' + FF.inr(v.due) + ' · ' + v.overdueDays + 'd overdue</span>' : '') + st + '</div></div></div>';
  }

  function renderHome() {
    var s = summary(), a = att(), on = onDuty(), coll = CONFIG.on('collections'), vis = CONFIG.on('visits');
    var pct = s.target ? Math.min(100, Math.round(s.coll / s.target * 100)) : 0;
    var next = s.vs.find(function (v) { return v.status === 'in_progress'; }) || s.vs.find(function (v) { return v.status === 'pending'; });
    var duty, selfie = a && a.in && a.in.selfie ? '<img src="' + a.in.selfie + '" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;margin-right:10px">' : '';
    if (on) duty = '<div class="row-between" style="margin-bottom:12px"><div style="display:flex;align-items:center">' + selfie + '<div><b style="color:var(--ok)">On duty</b><div class="muted">Checked in at ' + FF.fmtTime(a.in.t) + (a.in.late ? ' · late' : '') + '</div></div></div><span class="tag ok">GPS ' + (gpsMode === 'sim' ? 'demo' : 'live') + '</span></div><button class="btn btn-bad" id="endDuty">End Duty</button>';
    else if (a && a.out) duty = '<div class="row-between"><div><b>Duty completed</b><div class="muted">' + FF.fmtTime(a.in.t) + ' – ' + FF.fmtTime(a.out.t) + ' · ' + s.km.toFixed(1) + ' km</div></div><span class="tag">Checked out</span></div>';
    else duty = '<div style="margin-bottom:12px"><b>You are off duty</b><div class="muted">Working hours ' + C().tracking.workStart + '–' + C().tracking.workEnd + '. Starting duty records attendance with GPS' + (CONFIG.on('selfie') ? ' and a selfie' : '') + (CONFIG.on('liveTracking') ? ' and starts location tracking until you end duty' : '') + '.</div></div><button class="btn btn-primary" id="startDuty">Start Duty</button>';
    var stats = [];
    if (vis) stats.push('<div class="stat"><b>' + s.done + '/' + s.total + '</b><span>' + term('visit') + 's</span></div>');
    stats.push('<div class="stat"><b>' + s.km.toFixed(1) + '</b><span>km travelled</span></div>');
    if (coll) stats.push('<div class="stat"><b>' + pct + '%</b><span>Target</span></div>');
    else if (a) stats.push('<div class="stat"><b>' + (((a.out ? a.out.t : Date.now()) - a.in.t) / 3600000).toFixed(1) + '</b><span>hours</span></div>');
    if (!$('#homeTop')) $('#scr-home').innerHTML = '<div id="homeTop"></div><div class="card"><h3>My route today</h3><div class="map" id="homeMap"></div></div>';
    $('#homeTop').innerHTML =
      '<div class="card">' + duty + '</div>' +
      '<div class="card"><h3>Today</h3><div class="stats" style="grid-template-columns:repeat(' + stats.length + ',1fr)">' + stats.join('') + '</div>' +
      (coll ? '<div style="margin-top:12px" class="row-between"><span class="muted">Collected</span><b>' + FF.inr(s.coll) + ' <span class="muted">/ ' + FF.inr(s.target) + '</span></b></div><div class="bar"><i style="width:' + pct + '%"></i></div>' : '') + '</div>' +
      (!vis ? '' : next ? '<div class="muted" style="margin:4px 2px 8px;font-weight:600">' + (next.status === 'in_progress' ? 'Active ' : 'Next ') + term('visit').toLowerCase() + '</div>' + visitCard(next, s.vs.indexOf(next)) : '<div class="card"><b>All ' + term('visit').toLowerCase() + 's completed 🎉</b></div>');
    bind();
    drawHomeMap();
  }

  function renderVisits() {
    var s = summary();
    $('#scr-visits').innerHTML = '<div class="muted" style="margin:0 2px 10px">' + s.done + ' of ' + s.total + ' completed · tap for details</div>' + s.vs.map(visitCard).join('');
    bind();
  }

  function fieldInput(f) {
    var id = 'cf-' + f.key, lbl = '<label for="' + id + '">' + FF.esc(f.label) + (f.required ? ' *' : '') + '</label>';
    if (f.type === 'select') return '<div class="field">' + lbl + '<select id="' + id + '"><option value="">Select…</option>' + (f.options || []).map(function (o) { return '<option>' + FF.esc(o) + '</option>'; }).join('') + '</select></div>';
    return '<div class="field">' + lbl + '<input id="' + id + '" type="' + (f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text') + '"></div>';
  }

  function renderVisit(full) {
    var vs = FF.visitsFor(me.id), v = vs.find(function (x) { return x.id === openVisitId; });
    if (!v) return go('visits');
    var vt = CONFIG.visitType(v.type), pays = vt.collectsPayment && CONFIG.on('collections');
    var d = pos && onDuty() ? FF.dist(pos, v) : null;
    var geo = d == null ? '<div class="geo out">Start duty to verify your location</div>'
      : d <= FF.GEOFENCE ? '<div class="geo in">✓ Inside ' + term('customer').toLowerCase() + ' geofence · ' + FF.fmtDist(d) + ' away</div>'
        : '<div class="geo out">⚠ Outside geofence · ' + FF.fmtDist(d) + ' away (limit ' + FF.GEOFENCE + ' m' + (C().tracking.outsideGeofence === 'block' ? ', start blocked' : '') + ')</div>';
    if (!full && $('#geoBox')) { $('#geoBox').innerHTML = geo; drawVisitMap(v); return; }
    var action = '';
    if (v.status === 'pending') {
      action = '<button class="btn btn-ghost" id="navTo">' + (simTarget === v.id ? 'Heading here (demo route)…' : 'Navigate here') + '</button><button class="btn btn-primary" id="startVisit">Start ' + term('visit') + '</button>';
    } else if (v.status === 'in_progress') {
      action = '<h3 style="margin-top:4px">Complete ' + term('visit').toLowerCase() + '</h3>' +
        '<div class="field"><label>Outcome *</label><select id="f-outcome"><option value="">Select…</option>' + vt.outcomes.map(function (o) { return '<option>' + FF.esc(o) + '</option>'; }).join('') + '</select></div>' +
        (pays ? '<div class="field"><label>Amount collected (₹)</label><input id="f-amount" type="number" inputmode="numeric" min="0" placeholder="Due ' + v.due + '"></div><div class="field"><label>Payment mode</label><select id="f-mode">' + C().collections.paymentModes.map(function (m) { return '<option>' + FF.esc(m) + '</option>'; }).join('') + '</select></div>' : '') +
        (CONFIG.on('customForms') ? (vt.fields || []).map(fieldInput).join('') : '') +
        '<div class="field"><label>Remarks *</label><textarea id="f-remarks" placeholder="Notes"></textarea></div>' +
        '<button class="btn btn-ok" id="completeVisit">Submit &amp; complete</button>';
    } else {
      var cust = v.custom ? Object.keys(v.custom).map(function (k) { return '<dt>' + FF.esc(k) + '</dt><dd>' + FF.esc(v.custom[k]) + '</dd>'; }).join('') : '';
      action = '<dl class="kv"><dt>Outcome</dt><dd>' + FF.esc(v.outcome) + '</dd>' + (v.amount ? '<dt>Collected</dt><dd>' + FF.inr(v.amount) + ' (' + v.mode + ')</dd><dt>Receipt</dt><dd>' + v.receipt + '</dd>' : '') + cust +
        '<dt>Started</dt><dd>' + FF.fmtTime(v.startedAt) + ' · ' + FF.fmtDist(v.startDist) + ' from site</dd><dt>Completed</dt><dd>' + FF.fmtTime(v.completedAt) + '</dd><dt>Verification</dt><dd>' + (v.flagged ? '⚠ Flagged — outside geofence' : '✓ GPS verified') + '</dd></dl>' +
        '<p class="muted" style="margin:10px 0 0">' + FF.esc(v.remarks) + '</p>';
    }
    $('#scr-visit').innerHTML =
      '<button class="btn btn-ghost" id="backBtn" style="width:auto;padding:8px 14px;margin-bottom:10px">← All ' + term('visit').toLowerCase() + 's</button>' +
      '<div class="card"><div class="row-between"><h3 style="margin:0">' + FF.esc(v.customer) + '</h3><span class="tag">' + FF.esc(vt.label) + '</span></div>' +
      '<p class="muted" style="margin:6px 0 10px">' + FF.esc(v.address) + '</p>' +
      '<dl class="kv"><dt>Loan / App ref</dt><dd>' + v.loan + '</dd>' + (v.due && pays ? '<dt>EMI due</dt><dd>' + FF.inr(v.due) + '</dd><dt>Overdue</dt><dd>' + v.overdueDays + ' days</dd>' : '') + '</dl></div>' +
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

  function renderExp() {
    var ex = C().expenses, km = FF.pathKm(track()), ta = km * (Number(ex.perKmRate) || 0);
    var list = S().expenses.filter(function (e) { return e.emp === me.id; });
    var tot = list.reduce(function (s, e) { return s + e.amount; }, 0);
    $('#scr-exp').innerHTML =
      '<div class="card"><div class="row-between"><span class="muted">Travel allowance today (auto)</span><span class="tag info">' + FF.inr(ex.perKmRate) + '/km</span></div><div style="font-size:26px;font-weight:700;margin:4px 0">' + FF.inr(ta) + '</div><div class="muted">' + km.toFixed(1) + ' km tracked by GPS · claims ' + FF.inr(tot) + '</div></div>' +
      '<div class="card"><h3>New claim</h3><div class="field"><label>Category</label><select id="e-cat">' + ex.categories.map(function (c) { return '<option>' + FF.esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Amount (₹)' + (ex.maxClaim ? ' · max ' + FF.inr(ex.maxClaim) : '') + '</label><input id="e-amt" type="number" min="0"></div><div class="field"><label>Description</label><input id="e-note" placeholder="e.g. Lunch near Saidapet"></div><button class="btn btn-primary" id="submitExp">Submit claim</button></div>' +
      '<div class="card"><h3>My claims today</h3>' + (list.length ? list.map(function (e) { return '<div class="coll-row"><div><b>' + FF.esc(e.cat) + '</b><div class="muted">' + FF.esc(e.note) + ' · ' + FF.fmtTime(e.t) + '</div></div><div style="text-align:right"><b>' + FF.inr(e.amount) + '</b><div><span class="tag ' + (e.status === 'Approved' ? 'ok' : e.status === 'Rejected' ? 'bad' : 'warn') + '">' + e.status + '</span></div></div></div>'; }).join('') : '<p class="muted">No claims yet.</p>') + '</div>';
    bind();
  }

  function renderProfile() {
    var b = FF.branch(me.branch), tk = C().tracking;
    $('#scr-profile').innerHTML =
      '<div class="card"><div class="row-between"><div><h3 style="margin:0">' + me.name + '</h3><div class="muted">' + me.role + '</div></div><div class="logo-mark" data-keep="1" style="background:' + me.color + ';color:#fff">' + FF.initials(me.name) + '</div></div>' +
      '<dl class="kv" style="margin-top:12px"><dt>Employee ID</dt><dd>' + me.id + '</dd><dt>Branch</dt><dd>' + b.name + '</dd><dt>Organisation</dt><dd>' + FF.esc(C().company.name) + '</dd><dt>Working hours</dt><dd>' + tk.workStart + '–' + tk.workEnd + '</dd></dl></div>' +
      '<div class="card"><h3>GPS source</h3><div class="seg"><button data-gps="sim" class="' + (gpsMode === 'sim' ? 'active' : '') + '">Demo route</button><button data-gps="device" class="' + (gpsMode === 'device' ? 'active' : '') + '">Device GPS</button></div>' +
      '<p class="muted" style="margin:8px 0 0">Demo route simulates movement towards your next ' + term('visit').toLowerCase() + '. Device GPS uses the phone\'s real location.</p></div>' +
      '<div class="card"><h3>Privacy notice</h3><div class="notice">Your location is recorded only between <b>Start Duty</b> and <b>End Duty</b>' + (tk.autoStopAtWorkEnd ? ' (automatically stopped at ' + tk.workEnd + ')' : '') + ', to verify attendance and ' + term('customer').toLowerCase() + ' visits. It is visible to your branch manager and retained for ' + tk.retentionDays + ' days as per company policy. You will always see the tracking status at the top of the app.</div></div>' +
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
    else if (tab === 'exp' && full) renderExp();
    else if (tab === 'profile' && full) renderProfile();
  }

  function bind() {
    var on = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = fn; };
    on('startDuty', startDuty); on('endDuty', endDuty); on('logout', logout); on('submitExp', submitExpense);
    on('backBtn', function () { go('visits'); });
    on('startVisit', function () { startVisit(openVisitId); });
    on('completeVisit', function () { completeVisit(openVisitId); });
    on('navTo', function () {
      var v = FF.visitsFor(me.id).find(function (x) { return x.id === openVisitId; });
      if (gpsMode !== 'sim') { window.open('https://www.openstreetmap.org/directions?route=;' + v.lat + ',' + v.lng); return; }
      simTarget = openVisitId; toast('Demo route: heading to ' + term('customer').toLowerCase()); render(true);
    });
    on('resetDemo', function () { if (!confirm('Reset all demo data (attendance, visits, collections, expenses)?')) return; stopTracking(); FF.reset(); pos = null; toast('Demo data reset'); go('home'); });
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

  // Keep in sync with dashboard / admin console changes
  window.addEventListener('storage', function (e) {
    if (e.key === CONFIG.CFG_KEY || e.key === CONFIG.PLANS_KEY) {
      CONFIG.reload(); applyConfig();
      if (me && onDuty() && !CONFIG.on('liveTracking')) stopTracking();
      else if (me && onDuty() && !simTimer && watchId == null) startTracking(true);
      if (me) render(true); return;
    }
    if (e.key !== FF.KEY || !me) return;
    FF.reload();
    if (!onDuty() && (simTimer || watchId != null)) { stopTracking(); pos = null; render(true); return; }
    render(false);
  });

  applyConfig();
  var saved = pref('session', '');
  if (saved && FF.emp(saved)) enter(FF.emp(saved));
})();
