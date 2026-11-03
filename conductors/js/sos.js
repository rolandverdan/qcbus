import {
  createEmergencyRepo,
  listenToEmergenciesRepo,
  resolveEmergencyRepo,
} from "../../shared/js/repositories/emergencies.repo.js";

// ==================================================
// SOS EMERGENCY
// ==================================================
let sosCooldown = false;
let unsubscribePassengerHelp = null;
const visiblePassengerHelpIds = new Set();
const pendingPassengerHelpAlerts = [];

function escapeSOSHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function showPassengerHelpAlert(emergency) {
  if (document.getElementById("passengerHelpAlert")) {
    pendingPassengerHelpAlerts.push(emergency);
    return;
  }
  const overlay = document.createElement("div");
  overlay.id = "passengerHelpAlert";
  overlay.className = "fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <section class="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl">
      <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-700">
        <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
      </div>
      <h2 class="text-xl font-bold text-red-800">Passenger needs help</h2>
      <p class="mt-2 text-sm text-gray-700">A passenger requested immediate assistance. Please check on the passengers.</p>
      <div class="mt-4 rounded-xl bg-gray-50 p-3 text-left text-sm text-gray-700">
        <p><span class="font-semibold">Bus:</span> ${escapeSOSHtml(emergency.busCode || emergency.busId || "Bus")}</p>
        <p class="mt-1"><span class="font-semibold">Route:</span> ${escapeSOSHtml(emergency.route || "Route unavailable")}</p>
        ${emergency.location?.lat !== null && emergency.location?.lng !== null ? `<p class="mt-1"><span class="font-semibold">Location:</span> ${Number(emergency.location.lat).toFixed(5)}, ${Number(emergency.location.lng).toFixed(5)}</p>` : ""}
      </div>
      <button type="button" class="mt-4 w-full rounded-xl bg-red-700 px-4 py-3 font-bold text-white hover:bg-red-800" data-ack-passenger-help="${escapeSOSHtml(emergency.id)}">Acknowledge and check passenger</button>
    </section>`;
  document.body.appendChild(overlay);
  if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]);
  overlay.querySelector("[data-ack-passenger-help]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Acknowledging…";
    try {
      await resolveEmergencyRepo(emergency.id, `Conductor (${AppState.conductor?.name || "Conductor"})`);
      overlay.remove();
      showToast("Passenger help alert acknowledged", "success");
      const nextAlert = pendingPassengerHelpAlerts.shift();
      if (nextAlert) showPassengerHelpAlert(nextAlert);
    } catch (error) {
      console.error("Could not acknowledge passenger help alert:", error);
      button.disabled = false;
      button.textContent = "Acknowledge and check passenger";
      showToast("Could not acknowledge alert. Please retry.", "error");
    }
  });
}

function startPassengerHelpListener() {
  if (unsubscribePassengerHelp) unsubscribePassengerHelp();
  const conductorId = AppState.conductor?.id;
  if (!conductorId) return;
  unsubscribePassengerHelp = listenToEmergenciesRepo((emergencies) => {
    const ownBusId = String(AppState.bus?.documentId || "");
    const ownBusCode = String(AppState.bus?.id || "");
    const alert = emergencies.find((item) =>
      item.type === "passenger_help" && item.status === "active" &&
      (item.conductorId === conductorId ||
        (ownBusId && String(item.busId) === ownBusId) ||
        (ownBusCode && String(item.busCode) === ownBusCode)) &&
      !visiblePassengerHelpIds.has(item.id)
    );
    if (!alert) return;
    visiblePassengerHelpIds.add(alert.id);
    showPassengerHelpAlert(alert);
  }, (error) => console.error("Passenger help listener failed:", error));
}

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
        <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v4m0 4h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
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

  if (AppState.sos.currentEmergencyId) {
    const conductorName = AppState.conductor?.name || "Conductor";
    resolveEmergencyRepo(AppState.sos.currentEmergencyId, `Conductor (${conductorName})`).catch((err) => {
      console.warn("Could not mark emergency resolved from conductor app:", err);
    });
  }
}

// Broadcast SOS to Firestore backend and localStorage
async function broadcastSOS(type, label) {
  const payload = {
    type,
    label: label || 'Emergency',
    busId: AppState.bus.id || 'BUS',
    busCode: AppState.bus.code || AppState.bus.id || 'BUS',
    plateNumber: AppState.bus.plateNumber || '',
    route: AppState.bus.route || 'No Route',
    routeId: AppState.bus.routeId || null,
    tripId: AppState.trip.tripId || null,
    tripDirection: AppState.trip.directionLabel || '',
    conductorId: AppState.conductor.id || null,
    conductorName: AppState.conductor.name || 'Conductor',
    conductorEmail: AppState.conductor.email || '',
    onboard: AppState.occupancy.onboard || 0,
    capacity: AppState.occupancy.capacity || 45,
    totalIn: AppState.occupancy.totalIn || 0,
    totalOut: AppState.occupancy.totalOut || 0,
    lat: AppState.bus.lat || null,
    lng: AppState.bus.lng || null,
    speedKmh: AppState.bus.speedKmh || null,
  };

  try {
    const created = await createEmergencyRepo(payload);
    AppState.sos.currentEmergencyId = created.id;
  } catch (error) {
    console.error("Failed to broadcast SOS to Firestore:", error);
  }

  // Also store in localStorage for local reactive sync
  try {
    localStorage.setItem('qcSOS', JSON.stringify({ kind: 'sos', ...payload, time: Date.now() }));
    localStorage.setItem('qcSOS_updated', Date.now().toString());
  } catch (err) {
    console.warn("Could not write qcSOS to localStorage:", err);
  }
}

// Expose
window.openSOS = openSOS;
window.closeSOS = closeSOS;
window.triggerSOS = triggerSOS;
window.dismissSOS = dismissSOS;
window.startPassengerHelpListener = startPassengerHelpListener;
