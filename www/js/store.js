// FieldForce 360 - local data store (prototype backend stand-in).
// In production this is replaced by Supabase/PostgreSQL tables:
// attendance, employee_locations, customer_visits, collection_transactions, audit_logs.
(function () {
  var KEY = 'ff360.state.v1';
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function blank() {
    return { date: todayStr(), attendance: {}, track: {}, visits: {}, collections: [], expenses: [], audit: [], status: {} };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.date === todayStr()) { s.expenses = s.expenses || []; return s; }
    } catch (e) {}
    return blank();
  }

  var FF = {
    KEY: KEY,
    get GEOFENCE() { return Number(CONFIG.cfg.tracking.geofenceM) || 150; },
    typeLabel: function (id) { return CONFIG.visitType(id).label; },
    state: load(),
    reload: function () { this.state = load(); return this.state; },
    save: function () { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) {} },
    reset: function () { this.state = blank(); this.save(); },
    log: function (emp, action, detail) {
      this.state.audit.unshift({ t: Date.now(), emp: emp, action: action, detail: detail || '' });
      if (this.state.audit.length > 300) this.state.audit.length = 300;
    },
    emp: function (id) { return SEED.employees.find(function (e) { return e.id === id; }); },
    branch: function (id) { return SEED.branches.find(function (b) { return b.id === id; }); },
    visitsFor: function (emp) {
      var st = this.state.visits;
      return SEED.visits.filter(function (v) { return v.emp === emp; })
        .map(function (v) { return Object.assign({}, v, st[v.id] || { status: 'pending' }); });
    },
    target: function (emp) {
      return SEED.visits.filter(function (v) { return v.emp === emp; }).reduce(function (s, v) { return s + (v.due || 0); }, 0);
    },
    dist: function (a, b) {
      var R = 6371000, toR = Math.PI / 180;
      var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
      var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    },
    pathKm: function (pts) {
      var d = 0;
      for (var i = 1; i < (pts || []).length; i++) d += this.dist(pts[i - 1], pts[i]);
      return d / 1000;
    },
    fmtDist: function (m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; },
    fmtTime: function (t) { return t ? new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'; },
    ago: function (t) {
      if (!t) return '—';
      var s = Math.max(0, Math.round((Date.now() - t) / 1000));
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.round(s / 60) + ' min ago';
      return Math.round(s / 3600) + ' h ago';
    },
    inr: function (n) { return '₹' + Math.round(n || 0).toLocaleString('en-IN'); },
    initials: function (name) { return name.split(' ').map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase(); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  };
  window.FF = FF;
})();
