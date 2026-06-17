/* ============================================================
   App shell — routing between pages, the single requestAnimationFrame
   loop that drives both the car simulation and the fleet drift, and
   the sidebar status readouts (fleet alert badge, uptime, etc).
   ============================================================ */

const App = (() => {
  let currentPage = 'vehicle';
  let uptimeSeconds = 0;

  function logPageMarkup() {
    return `
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M6 3h10l2 2v16H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>
            <h2>System-Wide Event Log</h2>
          </div>
          <button class="tool-btn" id="clearLogGlobal" style="padding:7px 10px;font-size:.78rem">Clear All</button>
        </div>
        <div class="section log-table-wrap" style="padding-top:10px">
          <table class="data-table" id="globalLogTable">
            <thead><tr><th style="width:90px">Time</th><th style="width:130px">Source</th><th>Event</th><th>Detail</th><th style="width:64px">Type</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;
  }

  function mountLogsPage() {
    document.getElementById('page-logs').innerHTML = logPageMarkup();
    document.getElementById('topActions').innerHTML = `<div class="top-pill">Showing all vehicles · ${SmartLift.eventLog.length} events</div>`;
    document.getElementById('pageTitle').innerHTML = `<h1>SmartLift <span>System Log</span></h1><p>Every suspension decision and manual override, across the whole fleet.</p>`;
    document.getElementById('clearLogGlobal').addEventListener('click', () => SmartLift.clearLog());
    renderLogsPage();
  }

  function renderLogsPage() {
    const tbody = document.querySelector('#globalLogTable tbody');
    if (!tbody) return;
    const rows = SmartLift.eventLog;
    tbody.innerHTML = rows.length ? rows.map(item => `
      <tr><td style="color:var(--muted)">${item.time}</td><td><strong>${item.source}</strong></td><td>${item.event}</td><td>${item.message}</td><td><span class="tag ${item.type.toLowerCase()}">${item.type}</span></td></tr>
    `).join('') : `<tr><td colspan="5" class="empty-state">No events logged yet.</td></tr>`;
    const topAction = document.querySelector('#topActions .top-pill');
    if (topAction) topAction.textContent = `Showing all vehicles · ${rows.length} events`;
  }

  function goTo(page) {
    if (page === currentPage) return;
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    document.querySelectorAll('#mainNav .nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));

    if (page === 'vehicle' && !VehiclePage.isMounted()) VehiclePage.mount();
    else if (page === 'vehicle') VehiclePage.render();

    if (page === 'fleet' && !FleetPage.isMounted()) FleetPage.mount();
    else if (page === 'fleet') FleetPage.render();

    if (page === 'logs') mountLogsPage();
  }

  function bindNav() {
    document.querySelectorAll('#mainNav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page));
    });
  }

  function refreshSidebarStatus() {
    const alertCount = SmartLift.fleet.filter(v => v.mode !== 'NORMAL').length;
    const badge = document.getElementById('fleetAlertBadge');
    if (badge) { badge.style.display = alertCount > 0 ? 'inline-block' : 'none'; badge.textContent = alertCount; }
    const fleetSizeStat = document.getElementById('fleetSizeStat');
    if (fleetSizeStat) fleetSizeStat.textContent = `${SmartLift.fleet.length} vehicles`;

    // Occasionally simulate a brief cloud-sync hiccup, since "always
    // connected" forever reads as fake — matches the proposal's note
    // that edge AI must keep working even without connectivity.
  }

  function updateUptime() {
    uptimeSeconds += 1;
    const hh = String(Math.floor(uptimeSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((uptimeSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(uptimeSeconds % 60).padStart(2, '0');
    const el = document.getElementById('uptime');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
  }

  function mainLoop(now) {
    if (currentPage === 'vehicle') VehiclePage.driveLoop(now);
    SmartLift.tickFleetSimulation(now);
    requestAnimationFrame(mainLoop);
  }

  function boot() {
    bindNav();
    SmartLift.subscribe(() => {
      refreshSidebarStatus();
      if (currentPage === 'fleet') FleetPage.render();
      if (currentPage === 'logs') renderLogsPage();
      if (currentPage === 'vehicle') VehiclePage.render();
    });

    VehiclePage.mount();
    SmartLift.addLog('INFO', 'System boot', 'SmartLift operations console initialised. Edge AI active, fleet sync connected.');
    refreshSidebarStatus();

    requestAnimationFrame(mainLoop);
    setInterval(updateUptime, 1000);
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { goTo };
})();
