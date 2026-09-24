// ==================================================
// TRIP MANAGEMENT
// ==================================================
let tripTimerInterval = null;

function startTrip() {
  if (AppState.trip.active) return;

  AppState.trip = {
    active: true,
    startedAt: Date.now(),
    endedAt: null,
    tripId: 'TRIP-' + Date.now().toString().slice(-6),
  };

  // Reset occupancy
  AppState.occupancy = {
    onboard: 0,
    totalIn: 0,
    totalOut: 0,
    capacity: AppState.bus.capacity,
  };

  addHistory('trip', `Trip started · ${AppState.trip.tripId}`);

  // Broadcast to commuter (localStorage as temp sync)
  if (window.broadcastOccupancy) window.broadcastOccupancy();

  // Update header subtitle
  updateTripStatus();

  showToast('Trip started', 'success');
  navigateTo('counter');

  startTripTimer();
}

function endTrip() {
  if (!AppState.trip.active) return;

  if (!confirm('End the current trip?')) return;

  AppState.trip.active = false;
  AppState.trip.endedAt = Date.now();

  addHistory('trip', `Trip ended · ${AppState.trip.tripId}`);

  // Broadcast final state
  if (window.broadcastOccupancy) window.broadcastOccupancy();

  // Update header subtitle
  updateTripStatus();

  stopTripTimer();
  showToast('Trip ended', 'info');
  navigateTo('trip');
}

// ---------- Update header subtitle ----------
function updateTripStatus() {
  const el = document.getElementById('tripStatus');
  if (!el) return;
  el.textContent = AppState.trip.active
    ? 'Trip in progress'
    : 'Quezon City · No active trip';
}

// ---------- Timer for duration display ----------
function startTripTimer() {
  stopTripTimer();
  tripTimerInterval = setInterval(() => {
    const el = document.getElementById('tripDuration');
    if (!el || !AppState.trip.active) return;

    const ms = Date.now() - AppState.trip.startedAt;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    el.textContent = [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }, 1000);
}

function stopTripTimer() {
  if (tripTimerInterval) {
    clearInterval(tripTimerInterval);
    tripTimerInterval = null;
  }
}

// ---------- History ----------
function addHistory(kind, label) {
  AppState.history.unshift({
    id: Date.now() + Math.random(),
    kind,
    label,
    time: Date.now(),
  });
  if (AppState.history.length > 200) AppState.history.pop();
}

// Expose
window.startTrip = startTrip;
window.endTrip = endTrip;
window.startTripTimer = startTripTimer;
window.stopTripTimer = stopTripTimer;
window.addHistory = addHistory;
window.updateTripStatus = updateTripStatus;