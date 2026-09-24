// ==================================================
// PASSENGER COUNTER
// ==================================================
let counterRefreshInterval = null;

function addPassenger(direction, amount = 1) {
  if (!AppState.trip.active) {
    showToast('Start a trip first', 'warn');
    return;
  }

  const occ = AppState.occupancy;

  if (direction === 'in') {
    // Enforce capacity
    if (occ.onboard >= occ.capacity) {
      showToast('Bus is full', 'error');
      return;
    }
    const space = occ.capacity - occ.onboard;
    const added = Math.min(amount, space);
    occ.onboard += added;
    occ.totalIn += added;
    addHistory('in', `+${added} boarded (${occ.onboard}/${occ.capacity})`);
  } else {
    const removed = Math.min(amount, occ.onboard);
    if (removed === 0) return;
    occ.onboard -= removed;
    occ.totalOut += removed;
    addHistory('out', `−${removed} alighted (${occ.onboard}/${occ.capacity})`);
  }

  // Broadcast to commuter
  if (window.broadcastOccupancy) window.broadcastOccupancy();

  // Refresh the counter view in-place (keeps animation smooth)
  if (AppState.currentPage === 'counter') {
    softRefreshCounter();
  } else {
    navigateTo('counter');
  }

  // Buzz feedback
  if (navigator.vibrate) navigator.vibrate(direction === 'in' ? 30 : 20);
}

function resetCounter() {
  if (!confirm('Reset counters for this trip?')) return;
  AppState.occupancy.onboard = 0;
  AppState.occupancy.totalIn = 0;
  AppState.occupancy.totalOut = 0;
  addHistory('trip', 'Counter reset');
  if (window.broadcastOccupancy) window.broadcastOccupancy();
  softRefreshCounter();
  showToast('Counter reset', 'info');
}

// Update just the numbers (avoids full page re-render every tap)
function softRefreshCounter() {
  const big = document.getElementById('bigCount');
  if (big) big.textContent = AppState.occupancy.onboard;

  // Reload everything else (buttons, progress, activity)
  const content = document.getElementById('content');
  if (content && AppState.currentPage === 'counter') {
    content.innerHTML = Pages.counter();
  }
}

// Called when entering counter page
function startCounterTimer() {
  // no-op for now; kept for future "auto sync" indicator
}

function stopCounterTimer() {
  if (counterRefreshInterval) {
    clearInterval(counterRefreshInterval);
    counterRefreshInterval = null;
  }
}

function clearHistory() {
  if (!confirm('Clear all activity logs?')) return;
  AppState.history = [];
  navigateTo('alerts');
}

// Expose
window.addPassenger = addPassenger;
window.resetCounter = resetCounter;
window.softRefreshCounter = softRefreshCounter;
window.startCounterTimer = startCounterTimer;
window.stopCounterTimer = stopCounterTimer;
window.clearHistory = clearHistory;