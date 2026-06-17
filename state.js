/* ============================================================
   SmartLift — shared state & decision engine
   This is the single source of truth for both the Vehicle
   Simulator page and the Fleet Dashboard page, so an event on
   one vehicle is visible on the other without duplicating logic.

   Bug fixes vs. the original Group 21 prototype (kept here as a
   comment trail so the team can see what changed and why):

   1. ORIGINAL BUG — manual override didn't stick.
      autoDetect() ran every animation frame and only checked
      `next !== state.lastAuto`. It never checked whether the
      driver had switched to manual, so the moment you clicked a
      wheel toggle while inside any hazard zone, the very next
      frame silently snapped you back to AUTO. Fixed by gating
      autoDetect() entirely behind `state.controlMode === 'AUTO'`.

   2. ORIGINAL BUG — mode flapping at zone edges.
      Re-running detection every frame with no debounce meant a
      car sitting on a zone boundary could toggle modes dozens of
      times a second, flooding the event log. Fixed with a 400ms
      debounce + requiring the new mode to be stable for 2
      consecutive checks before committing.

   3. ORIGINAL BUG — pothole pulse race condition.
      A setInterval set up at boot *and* setMode('POTHOLE', ...)
      both wrote state.roughPulse independently, so entering
      pothole mode via click vs. via auto-detect produced
      different, fighting wheel patterns. Fixed by giving the
      pulse a single owner (the central decision loop) that only
      runs while POTHOLE is the live mode.
   ============================================================ */

const SmartLift = (() => {

  const WHEEL_NAMES = { FL: 'Front Left', FR: 'Front Right', RL: 'Rear Left', RR: 'Rear Right' };

  // Per the proposal: Flood Mode, Pothole Anticipation, Emergency 3-Wheel
  // Drive, plus Normal. Each entry is the "decision" the edge AI makes —
  // shown to the user so the onboard AI objective isn't just implied.
  const MODE_INFO = {
    NORMAL:    { label: 'Normal',        sub: 'Standard ride height',  icon: '◇', tag: 'good',  reasoning: 'No hazard detected. Maintaining standard ride height for fuel efficiency and comfort.' },
    FLOOD:     { label: 'Flood Mode',    sub: 'High water level',      icon: '♒', tag: 'alert', reasoning: 'Water level exceeds 15cm threshold. Lifting all four wheels to maximum 150mm while using a firmer stabilised setup to keep the chassis and intake above the waterline.' },
    POTHOLE:   { label: 'Pothole Alert', sub: 'Rough terrain',         icon: '⌁', tag: 'warn',  reasoning: 'Vibration signature matches an uneven-surface profile. Suspension stiffness is slightly softened so the wheel modules can absorb rough impact while maintaining chassis stability.' },
    EMERGENCY: { label: '3-Wheel Mode',  sub: 'Adaptive drive',        icon: '✣', tag: 'alert', reasoning: 'Wheel obstruction reported on Front-Left. Retracting the affected module and redistributing load across the remaining three wheels to keep the vehicle mobile.' },
  };

  // Vehicle profiles used by the Vehicle Simulator selector. These match
  // the fleet dashboard vehicle types: Ambulance, Fire Truck, and City Bus.
  // Values tune how the vehicle feels when driving the same road environment.
  const VEHICLE_PROFILES = {
    Ambulance: {
      icon: '🚑', label: 'Ambulance', short: 'AMB',
      maxForward: 4.8, maxReverse: -2.4, acceleration: 0.105, reverseAcceleration: 0.078,
      turnRate: 2.85, moveScale: 0.072, drag: 0.972,
      description: 'Fast response vehicle — quickest acceleration and sharpest turning.'
    },
    'Fire Truck': {
      icon: '🚒', label: 'Fire Truck', short: 'FIRE',
      maxForward: 3.3, maxReverse: -1.5, acceleration: 0.060, reverseAcceleration: 0.045,
      turnRate: 1.65, moveScale: 0.055, drag: 0.965,
      description: 'Heavy emergency vehicle — slower response and wider turning radius.'
    },
    'City Bus': {
      icon: '🚌', label: 'City Bus', short: 'BUS',
      maxForward: 2.8, maxReverse: -1.25, acceleration: 0.046, reverseAcceleration: 0.034,
      turnRate: 1.18, moveScale: 0.048, drag: 0.960,
      description: 'Public transport vehicle — longest body, slowest acceleration, widest turns.'
    }
  };

  function getVehicleProfile(type = vehicle.type) {
    return VEHICLE_PROFILES[type] || VEHICLE_PROFILES.Ambulance;
  }

  // Hazard zones for the simulator stage, expressed as percentages of the
  // stage box (so they aren't tied to any one background image and a 5th
  // zone can be added just by adding an entry here).
  const ZONES = {
    water:   { type: 'FLOOD',     x: 6,  y: 45, w: 30, h: 36, label: 'Flood Zone',           sub: 'High water level. Auto wheel-lift recommended.' },
    rough:   { type: 'POTHOLE',   x: 64, y: 12, w: 32, h: 26, label: 'Rough Road / Potholes', sub: 'Uneven surface. Vibration risk.' },
    blocked: { type: 'EMERGENCY', x: 64, y: 62, w: 32, h: 26, label: 'Blocked Wheel Zone',    sub: 'Wheel obstruction risk reported.' },
  };

  function freshWheelState() {
    return { FL: 'normal', FR: 'normal', RL: 'normal', RR: 'normal' };
  }

  const SUSPENSION_PRESETS = {
    NORMAL:    { rideHeight: 'Standard', rideHeightMm: 0,   stiffnessLabel: 'Normal',             stiffnessPct: 55, note: 'Balanced comfort and control for normal road driving.' },
    FLOOD:     { rideHeight: '+150 mm',   rideHeightMm: 150, stiffnessLabel: 'Firm / Stabilised',  stiffnessPct: 72, note: 'Raised ride height with firmer control to keep the chassis stable above floodwater.' },
    POTHOLE:   { rideHeight: '+60 mm',    rideHeightMm: 60,  stiffnessLabel: 'Slightly Softened',  stiffnessPct: 38, note: 'Softened damping helps the wheels absorb pothole impact before it reaches the chassis.' },
    EMERGENCY: { rideHeight: 'Adaptive',  rideHeightMm: 90,  stiffnessLabel: 'Load Stabilised',    stiffnessPct: 82, note: 'Stiffer load control supports emergency 3-wheel mobility and reduces body roll.' },
    MANUAL:    { rideHeight: 'Custom',    rideHeightMm: 0,   stiffnessLabel: 'Manual Custom',      stiffnessPct: 50, note: 'Driver has manually adjusted wheel modules. Edge AI is monitoring but not commanding suspension.' },
  };

  function applySuspensionPreset(mode) {
    const p = SUSPENSION_PRESETS[mode] || SUSPENSION_PRESETS.NORMAL;
    vehicle.rideHeight = p.rideHeight;
    vehicle.rideHeightMm = p.rideHeightMm;
    vehicle.stiffnessLabel = p.stiffnessLabel;
    vehicle.stiffnessPct = p.stiffnessPct;
    vehicle.stiffnessNote = p.note;
  }

  // --- The simulator vehicle (the one you actively drive) ---
  const vehicle = {
    id: 'SL-04',
    name: 'Ambulance SL-04',
    type: 'Ambulance',
    district: 'Seri Iskandar Central',
    x: 52, y: 55, angle: 0, speed: 0,
    controlMode: 'AUTO',        // 'AUTO' | 'MANUAL'
    mode: 'NORMAL',             // current decided suspension mode
    pendingMode: 'NORMAL',      // candidate mode awaiting debounce confirmation
    pendingSince: 0,
    water: 0, vibration: 0.3,
    road: 'Smooth', roadSub: 'Normal road',
    rideHeight: 'Standard', rideHeightMm: 0, stiffnessLabel: 'Normal', stiffnessPct: 55,
    stiffnessNote: 'Balanced comfort and control for normal road driving.',
    wheel: freshWheelState(),
    keys: new Set(),
    roughPulse: false,
    battery: 92,
  };

  // --- The rest of the fleet (simulated independently, lighter-weight,
  //     feeds the Fleet Dashboard + cross-vehicle road condition map) ---
  const fleet = [
    { id: 'SL-04', name: 'Ambulance SL-04', type: 'Ambulance',   district: 'Seri Iskandar Central', mode: 'NORMAL', battery: 92, lastService: 6,  isSimVehicle: true },
    { id: 'SL-07', name: 'Fire Truck SL-07', type: 'Fire Truck', district: 'Tronoh District',        mode: 'NORMAL', battery: 78, lastService: 41, isSimVehicle: false },
    { id: 'SL-11', name: 'City Bus SL-11',   type: 'City Bus',   district: 'Perak Tengah',           mode: 'NORMAL', battery: 65, lastService: 88, isSimVehicle: false },
    { id: 'SL-12', name: 'City Bus SL-12',   type: 'City Bus',   district: 'Bandar Seri Iskandar',   mode: 'NORMAL', battery: 54, lastService: 102, isSimVehicle: false },
    { id: 'SL-15', name: 'Ambulance SL-15',  type: 'Ambulance',  district: 'Kampung Gajah',          mode: 'NORMAL', battery: 88, lastService: 14, isSimVehicle: false },
  ];

  let selectedVehicleId = 'SL-04';

  // road condition reports aggregated across the fleet (proposal: "if
  // several vehicles detect the same road issue... create a road
  // condition map for better route planning")
  let roadReports = [];
  let maintenanceAlerts = [];
  let eventLog = [];
  let listeners = [];
  let logIdCounter = 1;

  function notify() { listeners.forEach(fn => fn()); }
  function subscribe(fn) { listeners.push(fn); }

  function addLog(type, event, message, source = vehicle.name) {
    eventLog.unshift({ id: logIdCounter++, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type, event, message, source });
    eventLog = eventLog.slice(0, 60);
    notify();
  }

  function setWheelPattern(pattern) {
    Object.keys(WHEEL_NAMES).forEach(w => { vehicle.wheel[w] = pattern[w] || 'normal'; });
  }

  // Centralised mode application — the single place that decides what a
  // mode means for wheels/metrics, replacing the duplicated logic that
  // caused bug #3 above.
  function applyMode(mode, source) {
    const wasMode = vehicle.mode;
    vehicle.mode = mode;

    if (mode === 'NORMAL') {
      vehicle.water = Math.max(0, vehicle.water - 4);
      vehicle.road = 'Smooth'; vehicle.roadSub = 'Normal road'; vehicle.vibration = 0.3;
      applySuspensionPreset('NORMAL');
      setWheelPattern(freshWheelState());
    }
    if (mode === 'FLOOD') {
      vehicle.water = 32; vehicle.road = 'Flood Zone'; vehicle.roadSub = 'High water level'; vehicle.vibration = 0.7;
      applySuspensionPreset('FLOOD');
      setWheelPattern({ FL: 'lifted', FR: 'lifted', RL: 'lifted', RR: 'lifted' });
    }
    if (mode === 'POTHOLE') {
      vehicle.road = 'Rough'; vehicle.roadSub = 'Uneven surface'; vehicle.vibration = 2.4;
      applySuspensionPreset('POTHOLE');
      setWheelPattern(vehicle.roughPulse ? { FL: 'lifted', RR: 'lifted' } : { FR: 'lifted', RL: 'lifted' });
      vehicle.stiffnessPct = vehicle.roughPulse ? 34 : 42;
      vehicle.stiffnessLabel = vehicle.roughPulse ? 'Slightly Softened' : 'Adaptive Soft';
    }
    if (mode === 'EMERGENCY') {
      vehicle.road = 'Wheel blocked'; vehicle.roadSub = 'Risk reported'; vehicle.vibration = 1.8;
      applySuspensionPreset('EMERGENCY');
      setWheelPattern({ FL: 'retracted' });
    }

    if (wasMode !== mode) {
      const info = MODE_INFO[mode];
      addLog(mode === 'EMERGENCY' || mode === 'FLOOD' ? 'ALERT' : (mode === 'POTHOLE' ? 'WARN' : 'INFO'),
        `${info.label} ${source === 'Auto' ? 'auto-engaged' : 'set'}`, info.reasoning);

      // Whenever the sim vehicle changes mode away from NORMAL while
      // inside a zone, log a fleet-wide road condition report so the
      // Fleet Dashboard's shared map has something to aggregate.
      if (mode !== 'NORMAL') reportRoadCondition(mode);
      fleetSyncSimVehicle();
    }
  }

  function reportRoadCondition(mode) {
    const zoneType = { FLOOD: 'Flood', POTHOLE: 'Pothole', EMERGENCY: 'Obstruction' }[mode];
    if (!zoneType) return;
    const existing = roadReports.find(r => r.zone === zoneType && r.district === vehicle.district);
    if (existing) {
      existing.reportCount += 1;
      existing.lastSeen = Date.now();
    } else {
      roadReports.unshift({ id: `RR-${Date.now()}`, zone: zoneType, district: vehicle.district, reportCount: 1, lastSeen: Date.now(), severity: mode === 'FLOOD' ? 'High' : mode === 'EMERGENCY' ? 'High' : 'Medium' });
    }
    roadReports = roadReports.slice(0, 12);
  }

  function fleetSyncSimVehicle() {
    fleet.forEach(v => { v.isSimVehicle = v.id === vehicle.id; });
    const f = fleet.find(v => v.id === vehicle.id);
    if (f) {
      f.mode = vehicle.mode;
      f.battery = Math.round(vehicle.battery);
      selectedVehicleId = f.id;
    }
    notify();
  }

  function selectFleetVehicle(id) {
    const selected = fleet.find(v => v.id === id);
    if (!selected || selected.id === vehicle.id) return;

    // Persist the previous simulator vehicle back into the fleet before switching.
    fleetSyncSimVehicle();

    selectedVehicleId = selected.id;
    vehicle.id = selected.id;
    vehicle.name = selected.name;
    vehicle.type = selected.type;
    vehicle.district = selected.district;
    vehicle.battery = selected.battery;
    vehicle.x = 52; vehicle.y = 55; vehicle.angle = 0; vehicle.speed = 0;
    vehicle.controlMode = 'AUTO';
    vehicle.pendingMode = selected.mode || 'NORMAL';
    vehicle.pendingSince = performance.now();
    vehicle.roughPulse = false;
    applyMode(selected.mode || 'NORMAL', 'Fleet Select');
    addLog('INFO', 'Simulator vehicle changed', `${getVehicleProfile(vehicle.type).label} selected from Fleet Dashboard. Handling model updated: ${getVehicleProfile(vehicle.type).description}`, vehicle.name);
    fleetSyncSimVehicle();
  }

  // --- Public decision-loop entry points, called from vehicle.js ---

  function isPointInZone(px, py, z) {
    return px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
  }

  function detectZone(px, py) {
    for (const key of Object.keys(ZONES)) {
      if (isPointInZone(px, py, ZONES[key])) return ZONES[key].type;
    }
    return 'NORMAL';
  }

  // Debounced auto-detect: fixes bug #2 (flapping) and bug #1 (manual
  // override being overwritten) by (a) only running in AUTO control
  // mode and (b) requiring a candidate mode to be stable for ~400ms
  // before it actually commits.
  function tickAutoDetect(now) {
    if (vehicle.controlMode !== 'AUTO') return;
    const detected = detectZone(vehicle.x, vehicle.y);

    if (detected !== vehicle.pendingMode) {
      vehicle.pendingMode = detected;
      vehicle.pendingSince = now;
      return;
    }
    const stableFor = now - vehicle.pendingSince;
    if (detected !== vehicle.mode && stableFor >= 400) {
      applyMode(detected, 'Auto');
    }
  }

  function setControlMode(mode) {
    vehicle.controlMode = mode;
    addLog('INFO', `Switched to ${mode === 'AUTO' ? 'Auto (Edge AI)' : 'Manual'} control`,
      mode === 'AUTO' ? 'Edge AI resumes autonomous suspension decisions.' : 'Driver has taken direct control of wheel modules.');
    if (mode === 'AUTO') {
      vehicle.pendingMode = vehicle.mode;
      vehicle.pendingSince = performance.now();
    }
  }

  function manualSetMode(mode) {
    setControlMode('MANUAL');
    applyMode(mode, 'Manual');
  }

  function manualToggleWheel(wheel, kind) {
    setControlMode('MANUAL');
    const current = vehicle.wheel[wheel];
    const targetState = kind === 'lift' ? (current === 'lifted' ? 'normal' : 'lifted') : (current === 'retracted' ? 'normal' : 'retracted');
    vehicle.wheel[wheel] = targetState;
    vehicle.road = 'Manual override'; vehicle.roadSub = 'Driver controlled';
    applySuspensionPreset('MANUAL');
    addLog(targetState === 'retracted' ? 'ALERT' : 'INFO', `${WHEEL_NAMES[wheel]} ${targetState}`, `Driver manually set ${WHEEL_NAMES[wheel]} module to ${targetState}.`);
    fleetSyncSimVehicle();
    notify();
  }

  // Pothole pulse — single owner now. Only advances while POTHOLE is the
  // live, committed mode (not just pending), called from the main loop.
  function tickPotholePulse(now) {
    if (vehicle.mode !== 'POTHOLE') return;
    if (!vehicle._pulseLast) vehicle._pulseLast = now;
    if (now - vehicle._pulseLast >= 850) {
      vehicle._pulseLast = now;
      vehicle.roughPulse = !vehicle.roughPulse;
      setWheelPattern(vehicle.roughPulse ? { FL: 'lifted', RR: 'lifted' } : { FR: 'lifted', RL: 'lifted' });
      vehicle.stiffnessPct = vehicle.roughPulse ? 34 : 42;
      vehicle.stiffnessLabel = vehicle.roughPulse ? 'Slightly Softened' : 'Adaptive Soft';
    }
  }

  function resetVehicle() {
    vehicle.x = 52; vehicle.y = 55; vehicle.angle = 0; vehicle.speed = 0;
    vehicle.controlMode = 'AUTO'; vehicle.pendingMode = 'NORMAL'; vehicle.pendingSince = performance.now();
    applyMode('NORMAL', 'Reset');
    addLog('INFO', 'View reset', 'Vehicle returned to the default test position.');
  }

  // --- Fleet-wide simulated drift, so the Fleet Dashboard feels alive
  //     even when you're not driving the sim vehicle ---
  function tickFleetSimulation(now) {
    if (!vehicle._fleetTickLast) vehicle._fleetTickLast = now;
    if (now - vehicle._fleetTickLast < 4000) return;
    vehicle._fleetTickLast = now;

    fleet.forEach(v => {
      if (v.id === vehicle.id) return; // selected simulator vehicle is driven by the user
      v.battery = Math.max(8, v.battery - (Math.random() < 0.5 ? 1 : 0));
      v.lastService += 1;
      // occasionally drift a background vehicle's mode to keep the
      // dashboard feeling like a live fleet, weighted toward Normal
      const roll = Math.random();
      if (roll < 0.08) v.mode = 'POTHOLE';
      else if (roll < 0.12) v.mode = 'FLOOD';
      else if (roll < 0.14) v.mode = 'EMERGENCY';
      else if (roll < 0.5) v.mode = 'NORMAL';
      if (v.mode !== 'NORMAL' && roll < 0.14) {
        addLog(v.mode === 'EMERGENCY' ? 'ALERT' : (v.mode === 'POTHOLE' ? 'WARN' : 'ALERT'),
          `${MODE_INFO[v.mode].label} engaged`, `${v.name} (${v.district}) — ${MODE_INFO[v.mode].reasoning}`, v.name);
        reportFleetRoadCondition(v, v.mode);
      }
    });
    recomputeMaintenanceAlerts();
    notify();
  }

  function reportFleetRoadCondition(v, mode) {
    const zoneType = { FLOOD: 'Flood', POTHOLE: 'Pothole', EMERGENCY: 'Obstruction' }[mode];
    if (!zoneType) return;
    const existing = roadReports.find(r => r.zone === zoneType && r.district === v.district);
    if (existing) { existing.reportCount += 1; existing.lastSeen = Date.now(); }
    else roadReports.unshift({ id: `RR-${Date.now()}-${v.id}`, zone: zoneType, district: v.district, reportCount: 1, lastSeen: Date.now(), severity: mode === 'FLOOD' ? 'High' : mode === 'EMERGENCY' ? 'High' : 'Medium' });
    roadReports = roadReports.slice(0, 12);
  }

  function recomputeMaintenanceAlerts() {
    maintenanceAlerts = fleet
      .filter(v => v.lastService >= 60 || v.battery <= 30)
      .map(v => {
        const reasons = [];
        if (v.lastService >= 90) reasons.push('Suspension service overdue (90+ days)');
        else if (v.lastService >= 60) reasons.push('Suspension service due soon (60+ days)');
        if (v.battery <= 30) reasons.push('Battery critically low');
        return { id: v.id, name: v.name, district: v.district, severity: v.lastService >= 90 || v.battery <= 30 ? 'High' : 'Medium', reasons };
      })
      .sort((a, b) => (a.severity === 'High' ? -1 : 1) - (b.severity === 'High' ? -1 : 1));
  }

  recomputeMaintenanceAlerts();

  return {
    WHEEL_NAMES, MODE_INFO, ZONES, VEHICLE_PROFILES, SUSPENSION_PRESETS, getVehicleProfile, selectFleetVehicle,
    vehicle, fleet,
    get selectedVehicleId() { return selectedVehicleId; },
    get roadReports() { return roadReports; },
    get maintenanceAlerts() { return maintenanceAlerts; },
    get eventLog() { return eventLog; },
    subscribe, notify, addLog,
    tickAutoDetect, tickPotholePulse, tickFleetSimulation,
    setControlMode, manualSetMode, manualToggleWheel, resetVehicle,
    clearLog: () => { eventLog = []; notify(); },
  };
})();
