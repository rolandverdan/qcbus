// ==================================================
// PASSENGER COUNTER
// ==================================================
import {
  markExpectedDropoffsAlightedRepo,
} from "../../shared/js/repositories/dropoffs.repo.js";

let counterRefreshInterval = null;

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

    recordHistory(
      'in',
      `+${added} boarded (${occ.onboard}/${occ.capacity})`
    );

  } else {
    const removed = Math.min(amount, occ.onboard);

    if (removed === 0) return;

    occ.onboard -= removed;
    occ.totalOut += removed;

    recordHistory(
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

  // Save to Firestore & Broadcast
  if (window.broadcastOccupancy) {
    await window.broadcastOccupancy();
  } else if (window.saveTripOccupancy) {
    await window.saveTripOccupancy();
  }

  // Refresh counter view
  if (AppState.currentPage === 'counter') {
    softRefreshCounter();
  } else if (AppState.currentPage !== 'scanner') {
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

  recordHistory('trip', 'Counter reset');

  // Save reset to Firestore
  if (window.broadcastOccupancy) {
    await window.broadcastOccupancy();
  } else if (window.saveTripOccupancy) {
    await window.saveTripOccupancy();
  }

  softRefreshCounter();

  showToast('Counter reset', 'info');
}


// Update numbers across all views
function softRefreshCounter() {
  const big = document.getElementById('bigCount');
  if (big) {
    big.textContent = AppState.occupancy.onboard;
  }

  const scannerCount = document.getElementById('scannerCount');
  if (scannerCount) {
    scannerCount.textContent = AppState.occupancy.onboard;
  }

  const content = document.getElementById('content');
  if (content && window.Pages) {
    if (AppState.currentPage === 'counter') {
      content.innerHTML = Pages.counter();
    } else if (AppState.currentPage === 'trip') {
      content.innerHTML = Pages.trip();
      if (AppState.trip.active && window.startTripTimer) {
        window.startTripTimer();
      }
    }
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