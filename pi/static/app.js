/* ============================================================
   BedJet Controller — Web UI
   ============================================================ */

// ---- Constants ------------------------------------------------

const TEMP_MIN = 66;
const TEMP_MAX = 104;

const MODE_NAMES = ['Off', 'Heat', 'Turbo', 'Ext Heat', 'Cool', 'Dry', 'Wait'];

// Steps 0–19 → percentages 5%–100% (each step = 5%)
function stepToPct(step) { return (parseInt(step, 10) + 1) * 5; }

// ---- State ----------------------------------------------------

let targetTempF = 72;        // local temp the user is aiming for
let fanDebounce  = null;      // debounce timer for slider drag
let ws           = null;
let wsDelay      = 2000;      // reconnect back-off (ms)
let toastTimer   = null;

// ---- WebSocket ------------------------------------------------

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  setConnState('connecting', 'Connecting…');

  ws.onopen = () => {
    wsDelay = 2000; // reset back-off on success
    setConnState('connecting', 'Connected');
  };

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      applyStatus(data);
    } catch (e) {
      console.warn('Bad WS message:', e);
    }
  };

  ws.onclose = () => {
    setConnState('disconnected', 'Disconnected');
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws.close();
  };
}

function scheduleReconnect() {
  setTimeout(connectWS, wsDelay);
  wsDelay = Math.min(wsDelay * 2, 30000);
}

// ---- Status update → UI --------------------------------------

function applyStatus(s) {
  if (!s.connected) {
    setConnState('disconnected', 'BedJet offline');
    clearStatus();
    return;
  }

  setConnState('connected', 'Connected');

  // Temps
  el('actual-temp').textContent = `${s.actual_temp_f}°`;
  el('set-temp').textContent    = `${s.set_temp_f}°`;

  // Sync local target to device set-point (don't override a pending adjustment)
  targetTempF = s.set_temp_f;
  el('target-temp').textContent = `${targetTempF}°F`;

  // Mode badge
  const badge = el('mode-badge');
  badge.textContent = MODE_NAMES[s.mode] ?? `Mode ${s.mode}`;
  badge.className   = `mode-badge mode-${s.mode}`;

  // Highlight active mode button
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.mode, 10) === s.mode);
  });

  // Fan
  el('fan-stat').textContent = `Fan: ${s.fan_pct}%`;
  const slider = el('fan-slider');
  // Only update slider if user isn't dragging (no pending debounce)
  if (!fanDebounce) {
    slider.value = s.fan_step;
  }
  el('fan-pct-label').textContent = `${s.fan_pct}%`;

  // Timer
  const h = String(s.timer_h).padStart(2, '0');
  const m = String(s.timer_m).padStart(2, '0');
  const timerStr = (s.timer_h === 0 && s.timer_m === 0 && s.timer_s === 0)
    ? 'No timer'
    : `${h}:${m}`;
  el('timer-stat').textContent = `Timer: ${timerStr}`;
}

function clearStatus() {
  el('actual-temp').textContent = '--°';
  el('set-temp').textContent    = '--°';
  el('target-temp').textContent = '--°F';
  el('fan-stat').textContent    = 'Fan: --%';
  el('timer-stat').textContent  = 'Timer: --:--';
  el('fan-pct-label').textContent = '--%';

  const badge = el('mode-badge');
  badge.textContent = '--';
  badge.className   = 'mode-badge';

  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
}

function setConnState(state, text) {
  const indicator = el('conn-indicator');
  indicator.className = `conn-indicator ${state}`;
  el('conn-text').textContent = text;
}

// ---- Commands ------------------------------------------------

async function post(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!data.success) {
      toast(data.error ?? 'Command failed', 'error');
    }
    return data.success;
  } catch (err) {
    toast('Network error', 'error');
    return false;
  }
}

function setMode(mode) {
  if (mode === 0) {
    post('/command/off');
  } else {
    post('/command/mode', { mode });
  }
}

function adjustTemp(delta) {
  targetTempF = Math.min(TEMP_MAX, Math.max(TEMP_MIN, targetTempF + delta));
  el('target-temp').textContent = `${targetTempF}°F`;
  post('/command/temperature', { temp_f: targetTempF });
}

function onFanInput(step) {
  // Update label immediately while dragging
  el('fan-pct-label').textContent = `${stepToPct(step)}%`;
  // Reset debounce — send only after user stops for 400ms
  clearTimeout(fanDebounce);
  fanDebounce = setTimeout(() => {
    fanDebounce = null;
  }, 400);
}

function sendFan(step) {
  // Called on 'change' (mouse/touch release)
  clearTimeout(fanDebounce);
  fanDebounce = null;
  el('fan-pct-label').textContent = `${stepToPct(step)}%`;
  post('/command/fan', { step: parseInt(step, 10) });
}

function setTimer() {
  const hours   = parseInt(el('timer-hours').value,   10) || 0;
  const minutes = parseInt(el('timer-minutes').value, 10) || 0;
  if (hours === 0 && minutes === 0) {
    toast('Enter a timer duration', 'error');
    return;
  }
  post('/command/timer', { hours, minutes })
    .then(ok => { if (ok) toast(`Timer set: ${hours}h ${minutes}m`); });
}

// ---- Toast ---------------------------------------------------

function toast(msg, type) {
  const t = el('toast');
  t.textContent = msg;
  t.className   = `toast show ${type ?? ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

// ---- Util ----------------------------------------------------

function el(id) { return document.getElementById(id); }

// ---- Init ----------------------------------------------------

// Fetch current status once on load (before WS connects)
fetch('/status')
  .then(r => r.json())
  .then(applyStatus)
  .catch(() => {});

connectWS();
