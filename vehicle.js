/* ============================================================
   Vehicle Simulator page — markup + render loop
   ============================================================ */

const VehiclePage = (() => {
  let mounted = false;
  let stageEl, carEl;

  function buildZoneMarkup() {
    return Object.entries(SmartLift.ZONES).map(([key, zone]) =>
      `<div class="zone ${key}" id="zone-${key}" data-zone="${key}" style="left:${zone.x}%; top:${zone.y}%; width:${zone.w}%; height:${zone.h}%"></div>`
    ).join('');
  }

  function markup() {
    return `
      <section class="workspace">
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2"/></svg>
              <h2>Virtual Road Environment</h2>
            </div>
            <div class="panel-tools">
              <button class="tool-btn" id="resetView"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15.6-6M21 12a9 9 0 0 1-15.6 6"/><path d="M18 3v5h-5M6 21v-5h5"/></svg>Reset View</button>
              <button class="tool-btn" id="fullscreenBtn" title="Fullscreen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></svg></button>
            </div>
          </div>
          <div class="stage" id="stage">
            ${buildZoneMarkup()}
            <div class="sim-car" id="car">
              <div class="car-body"></div>
              <div class="vehicle-roof-label" id="vehicleRoofLabel">AMB</div>
              <div class="car-accent"></div>
              <div class="wheel-module fl" data-wheel="FL"></div>
              <div class="wheel-module fr" data-wheel="FR"></div>
              <div class="wheel-module rl" data-wheel="RL"></div>
              <div class="wheel-module rr" data-wheel="RR"></div>
              <div class="direction-arrow"></div>
            </div>
          </div>
        </div>

        <aside class="panel right-panel">
          <div class="panel-head">
            <div class="panel-title">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
              <h2>Suspension Control</h2>
            </div>
          </div>

          <div class="section" style="padding-bottom:8px">
            <h3 class="section-title">Fleet Vehicle</h3>
            <div class="fleet-select-card">
              <label for="fleetVehicleSelect">Vehicle to test</label>
              <select id="fleetVehicleSelect"></select>
              <div class="vehicle-behaviour" id="vehicleBehaviourText">—</div>
            </div>
          </div>

          <div class="section" style="padding-bottom:8px">
            <h3 class="section-title">Control Mode</h3>
            <div class="control-mode-switch">
              <button id="modeAuto" data-control="AUTO"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Edge AI (Auto)</button>
              <button id="modeManual" data-control="MANUAL"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>Manual</button>
            </div>
          </div>

          <div class="section" style="padding-top:0; padding-bottom:8px">
            <div class="ai-reasoning" id="aiReasoning">
              <div class="ai-icon">AI</div>
              <div class="ai-body"><strong>Edge AI Decision</strong><p id="aiReasoningText">—</p></div>
            </div>
          </div>

          <div class="section" style="padding-top:0">
            <h3 class="section-title">Suspension Mode</h3>
            <div class="mode-grid" id="modeGrid"></div>
          </div>

          <div class="section">
            <h3 class="section-title">Active Wheels</h3>
            <div class="wheel-grid" id="activeWheelGrid"></div>
          </div>

          <div class="section">
            <div class="metrics">
              <div class="metric"><small>Speed</small><span class="big" id="speedValue">0<span class="unit">km/h</span></span></div>
              <div class="metric"><small>Water Level</small><span class="big" id="waterValue">0<span class="unit">cm</span></span><svg class="mini-chart blue" viewBox="0 0 80 34"><path d="M3 27 C16 19, 25 31, 38 22 S58 11, 77 17"/></svg></div>
              <div class="metric"><small>Road Condition</small><span class="big" id="roadValue" style="font-size:1.05rem;margin-top:11px">Smooth</span><span class="unit" id="roadSub">Normal road</span></div>
              <div class="metric"><small>Vibration</small><span class="big" id="vibrationValue">0.3<span class="unit">m/s²</span></span><svg class="mini-chart" viewBox="0 0 80 34"><path d="M3 25 L12 18 L20 24 L29 10 L39 26 L49 15 L58 22 L68 8 L77 19"/></svg></div>
            </div>
          </div>

          <div class="section control-row">
            <div class="mini-panel">
              <h3>Manual Drive</h3>
              <p>Use arrow keys or WASD</p>
              <div class="drive-pad">
                <span></span><button data-drive="forward">↑</button><span></span>
                <button data-drive="left">←</button><button data-drive="stop" class="center">○</button><button data-drive="right">→</button>
                <span></span><button data-drive="backward">↓</button><span></span>
              </div>
            </div>
            <div class="mini-panel">
              <h3>Wheel-Lift Control</h3>
              <p id="wheelControlHint">Switch to Manual to enable</p>
              <div class="wheel-controls" id="wheelControls"></div>
            </div>
          </div>

          <div class="lift-viz">
            <h3 class="section-title" style="margin-bottom:2px">Lift Mechanism Visualization</h3>
            <div style="font-size:.74rem;color:var(--text-2);font-weight:650;margin-bottom:8px">Chassis remains stable while individual wheels lift independently.</div>
            <div class="viz-wrap">
              <div class="side-car-scene"></div>
              <div class="stability">
                <small>Chassis Stability</small>
                <strong id="stabilityValue">100%</strong>
                <div class="bar"><span id="stabilityBar"></span></div>
              </div>
            </div>
          </div>

          <div class="section event-log-compact" style="padding-top:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
              <h3 class="section-title" style="margin:0" id="vehicleActivityTitle">Recent Activity — ${SmartLift.vehicle.name}</h3>
              <button class="tool-btn" id="clearLogVehicle" style="padding:6px 9px;font-size:.72rem">Clear</button>
            </div>
            <table class="data-table" id="vehicleLogTable"><tbody></tbody></table>
          </div>
        </aside>
      </section>
    `;
  }

  function topActionsMarkup() {
    return `
      <div class="top-pill" id="currentVehiclePill">${SmartLift.getVehicleProfile(SmartLift.vehicle.type).icon} ${SmartLift.vehicle.name}</div>
      <div class="top-pill live"><span class="dot"></span><span class="live-text">LIVE</span> Simulation Running</div>
    `;
  }

  function mount() {
    const page = document.getElementById('page-vehicle');
    page.innerHTML = markup();
    document.getElementById('topActions').innerHTML = topActionsMarkup();
    document.getElementById('pageTitle').innerHTML = `<h1>SmartLift <span>Vehicle Simulator</span></h1><p>Drive into a hazard zone and watch the edge AI decide or take manual control.</p>`;

    stageEl = document.getElementById('stage');
    carEl = document.getElementById('car');

    buildModeGrid();
    buildWheelStatusGrid();
    buildWheelControls();
    buildFleetVehicleSelector();
    bindEvents();
    render();
    mounted = true;
  }

  function buildModeGrid() {
    const grid = document.getElementById('modeGrid');
    grid.innerHTML = Object.entries(SmartLift.MODE_INFO).map(([key, info]) => `
      <div class="mode-card" data-mode="${key}"><div class="mode-icon">${info.icon}</div><div><strong>${info.label}</strong><small>${info.sub}</small></div></div>
    `).join('');
    grid.querySelectorAll('[data-mode]').forEach(card => {
      card.addEventListener('click', () => SmartLift.manualSetMode(card.dataset.mode));
    });
  }

  function buildWheelStatusGrid() {
    const grid = document.getElementById('activeWheelGrid');
    grid.innerHTML = Object.keys(SmartLift.WHEEL_NAMES).map(w => `
      <div class="wheel-tile" data-tile="${w}">
        <span class="wheel-state-icon">◌</span>
        <div><strong>${w}</strong><small>${SmartLift.WHEEL_NAMES[w]}</small></div>
        <div class="upmark" data-up="${w}">↑</div>
      </div>
    `).join('');
  }

  function buildWheelControls() {
    const controls = document.getElementById('wheelControls');
    controls.innerHTML = Object.keys(SmartLift.WHEEL_NAMES).map(w => `
      <div class="wheel-control">
        <div class="lift-icon">↑</div>
        <span>${SmartLift.WHEEL_NAMES[w]}</span>
        <div class="switch lift" data-toggle-lift="${w}" title="Lift / lower ${SmartLift.WHEEL_NAMES[w]}"></div>
        <div class="switch retract" data-toggle-retract="${w}" title="Retract / restore ${SmartLift.WHEEL_NAMES[w]}"></div>
      </div>
    `).join('');
  }


  function buildFleetVehicleSelector() {
    const selector = document.getElementById('fleetVehicleSelect');
    if (!selector) return;
    selector.innerHTML = SmartLift.fleet.map(v => {
      const profile = SmartLift.getVehicleProfile(v.type);
      return `<option value="${v.id}">${profile.icon} ${v.name} — ${v.type}</option>`;
    }).join('');
    selector.value = SmartLift.vehicle.id;
    selector.addEventListener('change', () => {
      SmartLift.selectFleetVehicle(selector.value);
      render();
    });
  }

  function bindEvents() {
    document.getElementById('resetView').addEventListener('click', () => SmartLift.resetVehicle());
    document.getElementById('clearLogVehicle')?.addEventListener('click', () => SmartLift.clearLog());
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });

    document.getElementById('modeAuto').addEventListener('click', () => SmartLift.setControlMode('AUTO'));
    document.getElementById('modeManual').addEventListener('click', () => SmartLift.setControlMode('MANUAL'));

    document.querySelectorAll('[data-toggle-lift]').forEach(btn => btn.addEventListener('click', () => {
      if (SmartLift.vehicle.controlMode !== 'MANUAL') return;
      SmartLift.manualToggleWheel(btn.dataset.toggleLift, 'lift');
    }));
    document.querySelectorAll('[data-toggle-retract]').forEach(btn => btn.addEventListener('click', () => {
      if (SmartLift.vehicle.controlMode !== 'MANUAL') return;
      SmartLift.manualToggleWheel(btn.dataset.toggleRetract, 'retract');
    }));

    document.querySelectorAll('[data-drive]').forEach(btn => {
      const action = btn.dataset.drive;
      const start = e => { e.preventDefault(); if (action === 'stop') SmartLift.vehicle.speed = 0; else SmartLift.vehicle.keys.add(action); };
      const end = () => SmartLift.vehicle.keys.delete(action);
      btn.addEventListener('mousedown', start);
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', end);
      btn.addEventListener('touchend', end);
    });

    window.addEventListener('keydown', e => {
      if (!mounted || !document.getElementById('page-vehicle').classList.contains('active')) return;
      const k = e.key.toLowerCase();
      const allowed = ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '];
      if (allowed.includes(k)) { e.preventDefault(); SmartLift.vehicle.keys.add(k); }
    });
    window.addEventListener('keyup', e => SmartLift.vehicle.keys.delete(e.key.toLowerCase()));
  }

  function activeWheelCount() {
    return Object.values(SmartLift.vehicle.wheel).filter(v => v !== 'retracted').length;
  }

  function render() {
    if (!mounted) return;
    const v = SmartLift.vehicle;
    const profile = SmartLift.getVehicleProfile(v.type);

    const selector = document.getElementById('fleetVehicleSelect');
    if (selector && selector.value !== v.id) selector.value = v.id;
    const behaviour = document.getElementById('vehicleBehaviourText');
    if (behaviour) behaviour.textContent = `${profile.icon} ${v.type} · Max ${Math.round(profile.maxForward * 10)} km/h · Turn ${profile.turnRate.toFixed(1)} · ${profile.description}`;
    const currentPill = document.getElementById('currentVehiclePill');
    if (currentPill) currentPill.textContent = `${profile.icon} ${v.name}`;
    const activityTitle = document.getElementById('vehicleActivityTitle');
    if (activityTitle) activityTitle.textContent = `Recent Activity — ${v.name}`;
    if (carEl) {
      carEl.dataset.type = v.type;
      carEl.setAttribute('aria-label', `${v.name} simulator vehicle`);
    }
    const roofLabel = document.getElementById('vehicleRoofLabel');
    if (roofLabel) roofLabel.textContent = profile.short;
    const sideScene = document.querySelector('.side-car-scene');
    if (sideScene) sideScene.dataset.type = v.type;

    // Control mode buttons
    document.getElementById('modeAuto').classList.toggle('active', v.controlMode === 'AUTO');
    document.getElementById('modeManual').classList.toggle('active', v.controlMode === 'MANUAL');

    // Manual-only controls enabled state
    const isManual = v.controlMode === 'MANUAL';
    document.querySelectorAll('[data-toggle-lift], [data-toggle-retract]').forEach(el => el.classList.toggle('disabled', !isManual));
    // Mode cards stay clickable in both control modes by design: clicking
    // one is how the driver switches into Manual (manualSetMode handles
    // that transition), so disabling them in AUTO would remove the only
    // discoverable way to take over.
    document.getElementById('wheelControlHint').textContent = isManual ? 'Toggle individual wheel lift' : 'Switch to Manual to enable';

    // AI reasoning panel
    const reasoningBox = document.getElementById('aiReasoning');
    const reasoningText = document.getElementById('aiReasoningText');
    reasoningBox.classList.toggle('manual', isManual);
    reasoningBox.querySelector('strong').textContent = isManual ? 'Manual Override Active' : 'Edge AI Decision';
    reasoningText.textContent = isManual
      ? 'Driver is in direct control. Edge AI is monitoring sensors but suspension commands are suppressed until Auto is re-enabled.'
      : SmartLift.MODE_INFO[v.mode].reasoning;

    // Mode cards
    document.querySelectorAll('#modeGrid [data-mode]').forEach(card => card.classList.toggle('active', card.dataset.mode === v.mode));

    // Metrics
    document.getElementById('speedValue').innerHTML = `${Math.round(Math.abs(v.speed) * 10)}<span class="unit">km/h</span>`;
    document.getElementById('waterValue').innerHTML = `${v.water}<span class="unit">cm</span>`;
    document.getElementById('roadValue').textContent = v.road;
    document.getElementById('roadSub').textContent = v.roadSub;
    document.getElementById('vibrationValue').innerHTML = `${v.vibration.toFixed(1)}<span class="unit">m/s²</span>`;

    // Wheels
    Object.keys(SmartLift.WHEEL_NAMES).forEach(w => {
      const status = v.wheel[w];
      const moduleEl = stageEl.querySelector(`.wheel-module[data-wheel="${w}"]`);
      moduleEl?.classList.toggle('lifted', status === 'lifted');
      moduleEl?.classList.toggle('retracted', status === 'retracted');

      const tile = document.querySelector(`[data-tile="${w}"]`);
      tile?.classList.toggle('lifted', status === 'lifted');
      tile?.classList.toggle('retracted', status === 'retracted');
      const up = document.querySelector(`[data-up="${w}"]`);
      if (up) up.textContent = status === 'retracted' ? '×' : '↑';

      const liftSwitch = document.querySelector(`[data-toggle-lift="${w}"]`);
      const retractSwitch = document.querySelector(`[data-toggle-retract="${w}"]`);
      liftSwitch?.classList.toggle('on', status === 'lifted');
      retractSwitch?.classList.toggle('on', status === 'retracted');
    });

    const stability = activeWheelCount() === 3 ? 86 : 100;
    document.getElementById('stabilityValue').textContent = `${stability}%`;
    document.getElementById('stabilityBar').style.width = `${stability}%`;

    // Zone highlight (purely visual feedback for which zone the car is in)
    Object.keys(SmartLift.ZONES).forEach(key => {
      const z = SmartLift.ZONES[key];
      const inZone = v.x >= z.x && v.x <= z.x + z.w && v.y >= z.y && v.y <= z.y + z.h;
      document.getElementById(`zone-${key}`)?.classList.toggle('active-highlight', inZone);
    });

    renderVehicleLog();
  }

  function renderVehicleLog() {
    const tbody = document.querySelector('#vehicleLogTable tbody');
    if (!tbody) return;
    const rows = SmartLift.eventLog.filter(e => e.source === SmartLift.vehicle.name).slice(0, 4);
    tbody.innerHTML = rows.length ? rows.map(item => `
      <tr><td style="width:80px;color:var(--muted)">${item.time}</td><td><strong style="color:var(--text)">${item.event}</strong></td><td>${item.message}</td><td style="width:64px"><span class="tag ${item.type.toLowerCase()}">${item.type}</span></td></tr>
    `).join('') : `<tr><td colspan="4" class="empty-state">No activity yet — drive into a hazard zone or toggle a wheel.</td></tr>`;
  }

  function driveLoop(now) {
    const v = SmartLift.vehicle;
    const k = v.keys;
    const forward = k.has('w') || k.has('arrowup') || k.has('forward');
    const backward = k.has('s') || k.has('arrowdown') || k.has('backward');
    const left = k.has('a') || k.has('arrowleft') || k.has('left');
    const right = k.has('d') || k.has('arrowright') || k.has('right');
    const stop = k.has(' ') || k.has('stop');

    const profile = SmartLift.getVehicleProfile(v.type);
    if (forward) v.speed = Math.min(profile.maxForward, v.speed + profile.acceleration);
    if (backward) v.speed = Math.max(profile.maxReverse, v.speed - profile.reverseAcceleration);
    const turnFactor = Math.max(0.32, Math.min(1, Math.abs(v.speed) / 1.5));
    if (left) v.angle -= profile.turnRate * turnFactor * (v.speed >= 0 ? 1 : -1);
    if (right) v.angle += profile.turnRate * turnFactor * (v.speed >= 0 ? 1 : -1);
    if (stop) v.speed *= 0.72;
    if (!forward && !backward) v.speed *= profile.drag;
    if (Math.abs(v.speed) < 0.02) v.speed = 0;

    const rad = (v.angle - 90) * Math.PI / 180;
    v.x += Math.cos(rad) * v.speed * profile.moveScale;
    v.y += Math.sin(rad) * v.speed * profile.moveScale;
    v.x = Math.max(4, Math.min(96, v.x));
    v.y = Math.max(6, Math.min(94, v.y));

    if (carEl) {
      carEl.style.left = `${v.x}%`;
      carEl.style.top = `${v.y}%`;
      carEl.style.setProperty('--angle', `${v.angle}deg`);
      carEl.style.setProperty('--spin', `${(now / 24 * Math.max(.4, Math.abs(v.speed))) % 360}deg`);
      carEl.classList.toggle('moving', Math.abs(v.speed) > .25);
    }

    SmartLift.tickAutoDetect(now);
    SmartLift.tickPotholePulse(now);
    if (mounted) render();
  }

  return { mount, render, driveLoop, isMounted: () => mounted };
})();
