// ==================================================
// PASSENGER COUNTER
// ==================================================
import {
  markExpectedDropoffsAlightedRepo,
} from "../../shared/js/repositories/dropoffs.repo.js";

let counterRefreshInterval = null;

async function addPassenger(direction, amount = 1) {
  if (!AppState.trip.active) {
    showToast('Start a trip first', 'warn');
    return;
  }

  const occ = AppState.occupancy;
  let dropoffSyncFailed = false;

  if (direction === 'in') {
    if (occ.onboard >= occ.capacity) {
      showToast('Bus is full', 'error');
      return;
    }

    const space = occ.capacity - occ.onboard;
    const added = Math.min(amount, space);

    occ.onboard += added;
    occ.totalIn += added;

    addHistory(
      'in',
      `+${added} boarded (${occ.onboard}/${occ.capacity})`
    );

  } else {
    const removed = Math.min(amount, occ.onboard);

    if (removed === 0) return;

    occ.onboard -= removed;
    occ.totalOut += removed;

    addHistory(
      'out',
      `−${removed} alighted (${occ.onboard}/${occ.capacity})`
    );

    if (AppState.currentAlightStopId) {
      try {
        await markExpectedDropoffsAlightedRepo(
          AppState.trip.tripId,
          AppState.currentAlightStopId,
          removed
        );
      } catch (error) {
        console.error('Expected drop-off update failed:', error);
        dropoffSyncFailed = true;
      }
    }
  }

  // Save to Firestore
  if (window.saveTripOccupancy) {
    await window.saveTripOccupancy();
  }

  // Broadcast to commuter
  if (window.broadcastOccupancy) {
    window.broadcastOccupancy();
  }

  // Refresh counter view
  if (AppState.currentPage === 'counter') {
    softRefreshCounter();
  } else {
    navigateTo('counter');
  }

  if (dropoffSyncFailed) {
    showToast('Alight counted, but expected drop-offs could not sync', 'warn');
  }

  // Buzz feedback
  if (navigator.vibrate) {
    navigator.vibrate(
      direction === 'in' ? 30 : 20
    );
  }
}


async function resetCounter() {
  if (!AppState.trip.active) {
    showToast('Start a trip first', 'warn');
    return;
  }

  if (!confirm('Reset counters for this trip?')) {
    return;
  }

  AppState.occupancy.onboard = 0;
  AppState.occupancy.totalIn = 0;
  AppState.occupancy.totalOut = 0;

  addHistory('trip', 'Counter reset');

  // Save reset to Firestore
  if (window.saveTripOccupancy) {
    await window.saveTripOccupancy();
  }

  // Broadcast to commuter
  if (window.broadcastOccupancy) {
    window.broadcastOccupancy();
  }

  softRefreshCounter();

  showToast('Counter reset', 'info');
}


// Update just the numbers
function softRefreshCounter() {
  const big = document.getElementById('bigCount');

  if (big) {
    big.textContent = AppState.occupancy.onboard;
  }

  const content = document.getElementById('content');

  if (
    content &&
    AppState.currentPage === 'counter'
  ) {
    content.innerHTML = Pages.counter();
  }
}


// Called when entering counter page
function startCounterTimer() {
  // no-op for now
}


function stopCounterTimer() {
  if (counterRefreshInterval) {
    clearInterval(counterRefreshInterval);
    counterRefreshInterval = null;
  }
}


function clearHistory() {
  if (!confirm('Clear all activity logs?')) {
    return;
  }

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