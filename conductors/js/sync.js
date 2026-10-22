// ==================================================
// FIRESTORE OCCUPANCY SYNC
// ==================================================
import {
  updateTripRepo,
  listenToTripOccupancyRepo
} from "../../shared/js/repositories/trips.repo.js";

let tripListenerUnsubscribe = null;

async function broadcastOccupancy() {
  if (!AppState.trip.active || !AppState.trip.tripId) return;

  try {
    await updateTripRepo(AppState.trip.tripId, {
      onboard: AppState.occupancy.onboard,
      totalIn: AppState.occupancy.totalIn,
      totalOut: AppState.occupancy.totalOut,
    });
  } catch (error) {
    console.error('Occupancy sync failed:', error);
  }
}

// Real-time listener that fires instantly when the DB changes
function startLiveOccupancySync(tripId) {
  if (tripListenerUnsubscribe) {
    tripListenerUnsubscribe();
    tripListenerUnsubscribe = null;
  }

  if (!tripId) return;

  tripListenerUnsubscribe = listenToTripOccupancyRepo(tripId, (data) => {
    if (!data) return;

    // Check if trip was ended on another device
    if (data.status === "ended" && AppState.trip.active) {
      AppState.trip.active = false;
      AppState.trip.endedAt = Date.now();
      AppState.trip.tripId = null;
      if (window.stopBusLocationTracking) window.stopBusLocationTracking();
      if (window.stopTripTimer) window.stopTripTimer();
      if (window.updateTripStatus) window.updateTripStatus();
      window.refreshConductorPage?.();
      return;
    }

    // 1. Force the local memory to match the exact database numbers
    AppState.occupancy.onboard = Number(data.onboard) || 0;
    AppState.occupancy.totalIn = Number(data.totalIn) || 0;
    AppState.occupancy.totalOut = Number(data.totalOut) || 0;
    if (data.capacity) {
      AppState.occupancy.capacity = Number(data.capacity);
    }

   if (window.softRefreshCounter) window.softRefreshCounter();
    if (AppState.currentPage !== 'scanner') {
      window.refreshConductorPage?.();
    }
  });
}

function stopLiveOccupancySync() {
  if (tripListenerUnsubscribe) {
    tripListenerUnsubscribe();
    tripListenerUnsubscribe = null;
  }
}

// Expose globally
window.broadcastOccupancy = broadcastOccupancy;
window.startLiveOccupancySync = startLiveOccupancySync;
window.stopLiveOccupancySync = stopLiveOccupancySync;
