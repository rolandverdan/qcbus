// ==================================================
// SOS EMERGENCY
// ==================================================
let sosCooldown = false;

function recordHistory(kind, label) {
  if (typeof window.addHistory === "function") {
    return window.addHistory(kind, label);
  }
  const item = { kind, label, time: Date.now() };
  if (!Array.isArray(window.AppState?.history)) {
    if (window.AppState) window.AppState.history = [];
  }
  window.AppState?.history?.unshift(item);
  return item;
}

function openSOS() {
  document.getElementById('sosModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSOS() {
  document.getElementById('sosModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function triggerSOS(type) {
  if (sosCooldown) return;

  const labels = {
    medical: 'Medical Emergency',
    crime: 'Crime / Theft',
    accident: 'Road Accident',
    other: 'Other Emergency',
  };

  // 1. Save locally
  AppState.sos = {
    active: true,
    lastTriggered: Date.now(),
    type,
  };

  recordHistory('sos', `SOS · ${labels[type] || type}`);

  // 2. Broadcast to backend (frontend simulation)
  broadcastSOS(type, labels[type]);

  // 3. Show full-screen alarm
  showSOSAlarm(labels[type]);

  // 4. Prevent spamming (30s cooldown)
  sosCooldown = true;
  setTimeout(() => { sosCooldown = false; }, 30000);

  closeSOS();

  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
}

function showSOSAlarm(label) {
  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'sosActive';
  overlay.className = 'fixed inset-0 z-[200] bg-red-600 text-white flex flex-col items-center justify-center p-6 text-center';
  overlay.innerHTML = `
    <div class="relative mb-6">
      <div class="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
        <span class="text-5xl">🚨</span>
      </div>
      <div class="absolute inset-0 rounded-full bg-white/40 animate-pulse-ring"></div>
    </div>

    <h1 class="text-3xl font-bold mb-2">SOS SENT</h1>
    <p class="text-lg opacity-90 mb-1">${label}</p>
    <p class="text-sm opacity-80 mb-8">Authorities and dispatch have been notified.</p>

    <div class="bg-white/10 backdrop-blur rounded-2xl p-4 w-full max-w-sm mb-6">
      <p class="text-xs uppercase tracking-wider opacity-75 mb-1">Bus</p>
      <p class="font-bold">${AppState.bus.id} · ${AppState.bus.route}</p>
      <p class="text-xs opacity-75 mt-2">Conductor: ${AppState.conductor.name}</p>
      <p class="text-xs opacity-75">Time: ${new Date().toLocaleTimeString()}</p>
    </div>

    <button onclick="dismissSOS()" class="w-full max-w-sm py-4 bg-white text-red-600 font-bold rounded-2xl shadow-lg active:scale-[0.98] transition">
      I'M SAFE · DISMISS
    </button>
  `;
  document.body.appendChild(overlay);
}

function dismissSOS() {
  const overlay = document.getElementById('sosActive');
  if (overlay) overlay.remove();
  AppState.sos.active = false;
  recordHistory('sos', 'SOS cleared');
  showToast('SOS cleared', 'info');
}

// Broadcast SOS via localStorage (temporary until backend exists)
function broadcastSOS(type, label) {
  const payload = {
    kind: 'sos',
    busId: AppState.bus.id,
    route: AppState.bus.route,
    conductor: AppState.conductor.name,
    type,
    label,
    time: Date.now(),
  };
  localStorage.setItem('qcSOS', JSON.stringify(payload));
  localStorage.setItem('qcSOS_updated', Date.now().toString());
}

// Expose
window.openSOS = openSOS;
window.closeSOS = closeSOS;
window.triggerSOS = triggerSOS;
window.dismissSOS = dismissSOS;