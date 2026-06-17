/* ============================================================
   Fleet Dashboard page — the proposal's third deliverable
   ("cloud-connected fleet dashboard giving city operators live
   vehicle status, road condition maps, and predictive
   maintenance alerts") which didn't exist in the original
   prototype at all. Reads from the same SmartLift state object
   the Vehicle Simulator writes to, so driving into a flood zone
   on the Vehicle page immediately shows up here.
   ============================================================ */

const FleetPage = (() => {
  let mounted = false;

  const TYPE_ICON = { Ambulance: '🚑', 'Fire Truck': '🚒', 'City Bus': '🚌' };
  const ZONE_ICON = { Flood: '💧', Pothole: '⚠️', Obstruction: '🚧' };

  function markup() {
    return `
      <section class="fleet-summary">
        <div class="summary-card">
          <small>Fleet Size</small><span class="big" id="fleetTotal">5</span>
          <span class="delta">Across 5 districts</span>
        </div>
        <div class="summary-card alert">
          <small>Active Alerts</small><span class="big" id="fleetAlerts">0</span>
          <span class="delta">Flood / Pothole / 3-Wheel</span>
        </div>
        <div class="summary-card warn">
          <small>Maintenance Due</small><span class="big" id="fleetMaint">0</span>
          <span class="delta">Predictive maintenance</span>
        </div>
        <div class="summary-card good">
          <small>Avg. Battery</small><span class="big" id="fleetBattery">0%</span>
          <span class="delta">Across active fleet</span>
        </div>
      </section>

      <section class="fleet-grid">
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M5 12l2-5h10l2 5"/><path d="M4 12h16v6H4z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
              <h2>Live Vehicle Status</h2>
            </div>
            <div class="top-pill live" style="padding:7px 11px"><span class="dot"></span><span class="live-text">LIVE</span></div>
          </div>
          <div class="section" style="padding-top:10px">
            <table class="data-table" id="fleetTable">
              <thead><tr><th>Vehicle</th><th>District</th><th>Suspension Mode</th><th>Battery</th><th>Last Service</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:14px;">
          <div class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2"/></svg>
                <h2>Road Condition Map</h2>
              </div>
            </div>
            <div class="section" id="roadMapSection" style="padding-top:10px"></div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                <h2>Predictive Maintenance</h2>
              </div>
            </div>
            <div class="section" id="maintSection" style="padding-top:10px"></div>
          </div>
        </div>
      </section>
    `;
  }

  function topActionsMarkup() {
    return `
      <div class="top-pill"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/></svg>Seri Iskandar Region</div>
      <div class="top-pill live"><span class="dot"></span><span class="live-text">LIVE</span> Fleet Sync</div>
    `;
  }

  function mount() {
    const page = document.getElementById('page-fleet');
    page.innerHTML = markup();
    document.getElementById('topActions').innerHTML = topActionsMarkup();
    document.getElementById('pageTitle').innerHTML = `<h1>SmartLift <span>Fleet Dashboard</span></h1><p>City-operator view: live status, shared road-condition map, and predictive maintenance across the fleet.</p>`;
    mounted = true;
    render();
  }

  function batteryClass(pct) { return pct <= 30 ? 'low' : pct <= 60 ? 'mid' : ''; }

  function renderFleetTable() {
    const tbody = document.querySelector('#fleetTable tbody');
    if (!tbody) return;
    tbody.innerHTML = SmartLift.fleet.map(v => {
      const info = SmartLift.MODE_INFO[v.mode];
      const serviceTag = v.lastService >= 90 ? 'alert' : v.lastService >= 60 ? 'warn' : 'neutral';
      return `
        <tr class="row-link" data-go-vehicle="${v.id}" title="Select ${v.name} in Vehicle Simulator">
          <td>${TYPE_ICON[v.type] || ''} <span class="vehicle-id">${v.name}</span><span class="vehicle-sub">${v.type}${v.id === SmartLift.vehicle.id ? ' · simulator-linked' : ' · click to test'}</span></td>
          <td>${v.district}</td>
          <td><span class="vehicle-row-mode"><span class="icon">${info.icon}</span><span class="tag ${info.tag}">${info.label}</span></span></td>
          <td><span class="battery-pill">${v.battery}%<span class="battery-track"><span class="battery-fill ${batteryClass(v.battery)}" style="width:${v.battery}%"></span></span></span></td>
          <td><span class="tag ${serviceTag}">${v.lastService}d ago</span></td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-go-vehicle]').forEach(row => row.addEventListener('click', () => {
      SmartLift.selectFleetVehicle(row.dataset.goVehicle);
      App.goTo('vehicle');
    }));
  }

  function renderRoadMap() {
    const el = document.getElementById('roadMapSection');
    if (!el) return;
    const reports = SmartLift.roadReports;
    if (!reports.length) {
      el.innerHTML = `<div class="empty-state">No road conditions reported yet.<br>Drive a vehicle into a hazard zone on the Vehicle Simulator to populate this map.</div>`;
      return;
    }
    el.innerHTML = `<div class="road-map-list">${reports.map(r => `
      <div class="road-report-card">
        <span class="rr-icon">${ZONE_ICON[r.zone] || '📍'}</span>
        <div class="rr-body">
          <strong>${r.zone} — ${r.district}</strong>
          <small>Severity: ${r.severity} · Last reported ${timeAgo(r.lastSeen)}</small>
        </div>
        <span class="rr-count">${r.reportCount}× reported</span>
      </div>
    `).join('')}</div>`;
  }

  function renderMaintenance() {
    const el = document.getElementById('maintSection');
    if (!el) return;
    const alerts = SmartLift.maintenanceAlerts;
    if (!alerts.length) {
      el.innerHTML = `<div class="empty-state">All vehicles within normal service windows.</div>`;
      return;
    }
    el.innerHTML = alerts.map(a => `
      <div class="maint-alert-card ${a.severity.toLowerCase()}">
        <div class="ma-body">
          <strong>${a.name} <span style="color:var(--muted);font-weight:600">— ${a.district}</span></strong>
          <ul>${a.reasons.map(r => `<li>${r}</li>`).join('')}</ul>
        </div>
        <span class="tag ${a.severity === 'High' ? 'alert' : 'warn'}">${a.severity}</span>
      </div>
    `).join('');
  }

  function timeAgo(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.round(m / 60)}h ago`;
  }

  function render() {
    if (!mounted) return;
    document.getElementById('fleetTotal').textContent = SmartLift.fleet.length;
    const alertCount = SmartLift.fleet.filter(v => v.mode !== 'NORMAL').length;
    document.getElementById('fleetAlerts').textContent = alertCount;
    document.getElementById('fleetMaint').textContent = SmartLift.maintenanceAlerts.length;
    const avgBattery = Math.round(SmartLift.fleet.reduce((a, v) => a + v.battery, 0) / SmartLift.fleet.length);
    document.getElementById('fleetBattery').textContent = `${avgBattery}%`;

    renderFleetTable();
    renderRoadMap();
    renderMaintenance();
  }

  return { mount, render, isMounted: () => mounted };
})();
