// ==================================================
// TRIP MANAGEMENT
// ==================================================

import {
  getActiveTripRepo,
  addTripRepo,
  updateTripRepo,
  endTripRepo,
} from "../../shared/js/repositories/trips.repo.js";

import {
  listenToTripDropoffRequestsRepo,
} from "../../shared/js/repositories/dropoffs.repo.js";

import {
  updateBusLocationRepo,
} from "../../shared/js/repositories/buses.repo.js";

import { getNearestStop } from "../../shared/js/eta.js";

let tripTimerInterval = null;
let unsubscribeDropoffRequests = null;
let busLocationWatchId = null;
let lastBusLocationWriteAt = 0;

function setLiveMapAvailable(isAvailable) {
  window.__liveMapAvailable = isAvailable;
  window.setLiveMapAvailability?.(isAvailable);
}

function updateNearestStop(latitude, longitude) {
  const nearestStop = getNearestStop(
    { lat: latitude, lng: longitude },
    AppState.routeStops
  );

  if (nearestStop?.id !== AppState.currentAlightStopId) {
    window.setNearestAlightStop?.(nearestStop?.id || null);
  }
}

function startBusLocationTracking() {
  if (busLocationWatchId !== null) return;

  if (!navigator.geolocation || !AppState.bus.documentId) {
    showToast("Live ETA needs location access", "warn");
    return;
  }

  busLocationWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude, speed } = position.coords;
      const now = Date.now();
      const speedKmh = Number.isFinite(speed) && speed >= 0
        ? speed * 3.6
        : 0;

      AppState.bus.lat = latitude;
      AppState.bus.lng = longitude;
      AppState.bus.speedKmh = speedKmh;
      AppState.bus.locationUpdatedAt = now;
      updateNearestStop(latitude, longitude);
      window.updateConductorEta?.();
      window.updateFloatingLiveMap?.();

      if (now - lastBusLocationWriteAt < 10000) return;
      lastBusLocationWriteAt = now;

      try {
        await updateBusLocationRepo(AppState.bus.documentId, {
          lat: latitude,
          lng: longitude,
          speedKmh,
        });
      } catch (error) {
        console.error("Bus location update failed:", error);
      }
    },
    (error) => {
      console.error("Bus location tracking failed:", error);
      showToast("Allow location access to share live ETA", "warn");
      stopBusLocationTracking();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    }
  );
}

function stopBusLocationTracking() {
  if (busLocationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(busLocationWatchId);
  }

  busLocationWatchId = null;
}

function listenToDropoffRequests(tripId) {
  if (unsubscribeDropoffRequests) {
    unsubscribeDropoffRequests();
    unsubscribeDropoffRequests = null;
  }

  AppState.dropoffRequests = [];
  AppState.currentAlightStopId = null;
  if (!tripId) return;

  unsubscribeDropoffRequests = listenToTripDropoffRequestsRepo(
    tripId,
    (requests) => {
      AppState.dropoffRequests = requests;

      if (["trip", "counter"].includes(AppState.currentPage)) {
        const content = document.getElementById("content");
        if (content) {
          content.innerHTML = window.Pages[AppState.currentPage]();
        }
      }
    },
    (error) => console.error("Drop-off count listener failed:", error)
  );
}

// ---------- Start Trip ----------
async function startTrip() {
  if (AppState.trip.active) return;

  if (!AppState.bus.id) {
    showToast('No bus assigned', 'error');
    return;
  }

  if (!AppState.bus.routeId) {
    showToast('No route assigned', 'error');
    return;
  }

  try {
    const trip = await addTripRepo({
      conductorId: AppState.conductor.id,
      conductorName: AppState.conductor.name,

      busId: AppState.bus.id,
      busCode: AppState.bus.code || AppState.bus.id,

      routeId: AppState.bus.routeId,
      routeName: AppState.bus.route,

      capacity: AppState.bus.capacity,
      onboard: 0,
      totalIn: 0,
      totalOut: 0,
    });

    AppState.trip = {
      active: true,
      startedAt: Date.now(),
      endedAt: null,
      tripId: trip.id,
    };
    listenToDropoffRequests(trip.id);
    startBusLocationTracking();
    setLiveMapAvailable(true);

    AppState.occupancy = {
      onboard: 0,
      totalIn: 0,
      totalOut: 0,
      capacity: AppState.bus.capacity,
    };

    addHistory(
      'trip',
      `Trip started · ${AppState.trip.tripId}`
    );

    if (window.broadcastOccupancy) {
      window.broadcastOccupancy();
    }

    updateTripStatus();

    showToast('Trip started', 'success');

    navigateTo('counter');

    startTripTimer();

  } catch (error) {
    console.error('Start trip error:', error);
    showToast('Failed to start trip', 'error');
  }
}

// ---------- End Trip ----------
async function endTrip() {
  if (!AppState.trip.active) return;

  if (!confirm('End the current trip?')) return;

  try {
    await endTripRepo(
      AppState.trip.tripId,
      {
        onboard: AppState.occupancy.onboard,
        totalIn: AppState.occupancy.totalIn,
        totalOut: AppState.occupancy.totalOut,
      }
    );

    AppState.trip.active = false;
    AppState.trip.endedAt = Date.now();
    listenToDropoffRequests(null);
    stopBusLocationTracking();
    setLiveMapAvailable(false);

    addHistory(
      'trip',
      `Trip ended · ${AppState.trip.tripId}`
    );

    if (window.broadcastOccupancy) {
      window.broadcastOccupancy();
    }

    updateTripStatus();

    stopTripTimer();

    showToast('Trip ended', 'info');

    navigateTo('trip');

  } catch (error) {
    console.error('End trip error:', error);
    showToast('Failed to end trip', 'error');
  }
}

// ---------- Save Occupancy ----------
async function saveTripOccupancy() {
  if (!AppState.trip.active) return;

  try {
    await updateTripRepo(
      AppState.trip.tripId,
      {
        onboard: AppState.occupancy.onboard,
        totalIn: AppState.occupancy.totalIn,
        totalOut: AppState.occupancy.totalOut,
      }
    );
  } catch (error) {
    console.error('Trip occupancy update failed:', error);
  }
}

// ---------- Update header subtitle ----------
function updateTripStatus() {
  const el = document.getElementById('tripStatus');

  if (!el) return;

  el.textContent = AppState.trip.active
    ? 'Trip in progress'
    : 'Quezon City · No active trip';
}

// ---------- Timer ----------
function startTripTimer() {
  stopTripTimer();

  tripTimerInterval = setInterval(() => {
    const el = document.getElementById('tripDuration');

    if (!el || !AppState.trip.active) return;

    const ms = Date.now() - AppState.trip.startedAt;

    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);

    el.textContent = [h, m, s]
      .map(v => String(v).padStart(2, '0'))
      .join(':');

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

  if (AppState.history.length > 200) {
    AppState.history.pop();
  }
}

// ---------- Restore Active Trip ----------
async function restoreActiveTrip() {
  if (!AppState.conductor.id) return;

  try {
    const trip = await getActiveTripRepo(AppState.conductor.id);

    if (!trip) return;

    AppState.trip = {
      active: true,
      startedAt: trip.startedAt?.toMillis
        ? trip.startedAt.toMillis()
        : Date.now(),
      endedAt: null,
      tripId: trip.id,
    };
    listenToDropoffRequests(trip.id);
    startBusLocationTracking();
    setLiveMapAvailable(true);

    AppState.occupancy = {
      onboard: Number(trip.onboard) || 0,
      totalIn: Number(trip.totalIn) || 0,
      totalOut: Number(trip.totalOut) || 0,
      capacity: Number(trip.capacity) || AppState.bus.capacity,
    };

    updateTripStatus();
    startTripTimer();

    console.log("Active trip restored:", trip.id);
  } catch (error) {
    console.error("Failed to restore active trip:", error);
  }
}

// ---------- Expose ----------
window.startTrip = startTrip;
window.restoreActiveTrip = restoreActiveTrip;

window.endTrip = endTrip;
window.startTripTimer = startTripTimer;
window.stopTripTimer = stopTripTimer;
window.saveTripOccupancy = saveTripOccupancy;
window.addHistory = addHistory;
window.updateTripStatus = updateTripStatus;