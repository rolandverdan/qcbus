// ==================================================
// TRIP MANAGEMENT
// ==================================================

import {
  getActiveTripRepo,
  listenToActiveTripRepo,
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

import { getDistanceKm, getEta, getNearestStop } from "../../shared/js/eta.js";

let tripTimerInterval = null;
let unsubscribeDropoffRequests = null;
let unsubscribeActiveTrip = null;
let busLocationWatchId = null;
let lastBusLocationWriteAt = 0;
const BUS_LOCATION_WRITE_INTERVAL_MS = 1000;
const STOP_ETA_CAPTURE_DISTANCE_KM = 3;
const STOP_ARRIVAL_RADIUS_KM = 0.15;
let stopEtaAnalytics = [];
let stopEtaAnalyticsWrite = Promise.resolve();

function orderedTripStops() {
  const stops = [...(AppState.routeStops || [])].sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  );
  const fromIndex = stops.findIndex((stop) => stop.id === AppState.trip.directionFromId);
  const toIndex = stops.findIndex((stop) => stop.id === AppState.trip.directionToId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [];
  const step = fromIndex < toIndex ? 1 : -1;
  const ordered = [];
  for (let index = fromIndex; ; index += step) {
    ordered.push(stops[index]);
    if (index === toIndex) break;
  }
  return ordered.slice(1);
}

function trackStopEtaAndArrival(latitude, longitude, now) {
  if (!AppState.trip.tripId) return;
  const stops = orderedTripStops();
  if (!stops.length) return;

  const analytics = Array.isArray(stopEtaAnalytics) ? stopEtaAnalytics : [];
  const nextStop = stops.find((stop) => !analytics.some(
    (entry) => entry.stopId === stop.id && entry.actualArrivalAt
  ));
  if (!nextStop) return;

  const distanceKm = getDistanceKm({ lat: latitude, lng: longitude }, nextStop);
  if (distanceKm === null) return;
  const existing = analytics.find((entry) => entry.stopId === nextStop.id);
  let changed = false;

  if (!existing && distanceKm <= STOP_ETA_CAPTURE_DISTANCE_KM && distanceKm > STOP_ARRIVAL_RADIUS_KM) {
    const eta = getEta(AppState.bus, nextStop, now);
    if (Number.isFinite(eta.minutes)) {
      analytics.push({
        stopId: nextStop.id,
        stopName: nextStop.name || "Bus stop",
        predictedArrivalAt: now + eta.minutes * 60_000,
        predictionCapturedAt: now,
        actualArrivalAt: null,
        distanceAtPredictionKm: distanceKm,
      });
      changed = true;
    }
  }

  const currentEntry = analytics.find((entry) => entry.stopId === nextStop.id);
  if (currentEntry && !currentEntry.actualArrivalAt && distanceKm <= STOP_ARRIVAL_RADIUS_KM) {
    currentEntry.actualArrivalAt = now;
    changed = true;
  }

  if (changed) {
    stopEtaAnalytics = analytics;
    const tripId = AppState.trip.tripId;
    const snapshot = analytics.map((entry) => ({ ...entry }));
    stopEtaAnalyticsWrite = stopEtaAnalyticsWrite
      .catch(() => {})
      .then(() => updateTripRepo(tripId, { stopEtaAnalytics: snapshot }))
      .catch((error) => console.error("Stop ETA analytics save failed:", error));
  }
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

function getTimestampMillis(val) {
  if (!val) return Date.now();
  if (typeof val.toMillis === "function") return val.toMillis();
  if (typeof val.toDate === "function") return val.toDate().getTime();
  if (typeof val.seconds === "number") return val.seconds * 1000;
  if (typeof val === "number") return val;
  const parsed = new Date(val).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
}

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

  lastBusLocationWriteAt = 0;
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
      trackStopEtaAndArrival(latitude, longitude, now);
      updateNearestStop(latitude, longitude);
      window.updateConductorEta?.();
      window.updateFloatingLiveMap?.();

      if (now - lastBusLocationWriteAt < BUS_LOCATION_WRITE_INTERVAL_MS) return;
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
      maximumAge: 0,
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

      window.refreshConductorPage?.();
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

  const directionValue = document.getElementById("tripDirectionSelect")?.value || "";
  const [directionFromId, directionToId] = directionValue.split("|");
  const directionFrom = AppState.routeStops.find((stop) => stop.id === directionFromId);
  const directionTo = AppState.routeStops.find((stop) => stop.id === directionToId);
  if (!directionFrom || !directionTo || directionFrom.id === directionTo.id) {
    showToast("Choose which way the bus is going", "warn");
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
      directionFromId: directionFrom.id,
      directionFromName: directionFrom.name,
      directionToId: directionTo.id,
      directionToName: directionTo.name,
      directionLabel: `${directionFrom.name} → ${directionTo.name}`,

      capacity: AppState.bus.capacity,
      onboard: 0,
      totalIn: 0,
      totalOut: 0,
    });

    const now = Date.now();
    AppState.trip = {
      active: true,
      startedAt: now,
      endedAt: null,
      tripId: trip.id,
      directionFromId: directionFrom.id,
      directionFromName: directionFrom.name,
      directionToId: directionTo.id,
      directionToName: directionTo.name,
      directionLabel: `${directionFrom.name} → ${directionTo.name}`,
    };
    stopEtaAnalytics = [];

    AppState.occupancy = {
      onboard: 0,
      totalIn: 0,
      totalOut: 0,
      capacity: AppState.bus.capacity,
    };

    listenToDropoffRequests(trip.id);
    if (window.startLiveOccupancySync) window.startLiveOccupancySync(trip.id);
    startBusLocationTracking();
    setLiveMapAvailable(true);

    recordHistory(
      'trip',
      `Trip started · ${AppState.trip.tripId}`
    );

    if (window.broadcastOccupancy) {
      window.broadcastOccupancy();
    }

    updateTripStatus();
    startTripTimer();

    showToast('Trip started', 'success');
    navigateTo('counter');

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
    const finishedTripId = AppState.trip.tripId;
    await endTripRepo(
      finishedTripId,
      {
        onboard: AppState.occupancy.onboard,
        totalIn: AppState.occupancy.totalIn,
        totalOut: AppState.occupancy.totalOut,
      }
    );

    AppState.trip.active = false;
    AppState.trip.endedAt = Date.now();
    AppState.trip.tripId = null;
    AppState.trip.directionTo = null;

    listenToDropoffRequests(null);
    if (window.stopLiveOccupancySync) window.stopLiveOccupancySync();
    stopBusLocationTracking();
    setLiveMapAvailable(false);
    stopTripTimer();

    recordHistory(
      'trip',
      `Trip ended · ${finishedTripId}`
    );

    updateTripStatus();

    showToast('Trip ended', 'info');
    navigateTo('trip');

  } catch (error) {
    console.error('End trip error:', error);
    showToast('Failed to end trip', 'error');
  }
}

// ---------- Save Occupancy ----------
async function saveTripOccupancy() {
  if (!AppState.trip.active || !AppState.trip.tripId) return;

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

  el.textContent = 'Quezon City';
}

// ---------- Timer ----------
function stopTripTimer() {
  if (tripTimerInterval) {
    clearInterval(tripTimerInterval);
    tripTimerInterval = null;
  }
}

function startTripTimer() {
  stopTripTimer();

  const updateClock = () => {
    const el = document.getElementById('tripDuration');
    
    // Stop if the element doesn't exist or trip isn't active
    if (!el || !AppState.trip.active || !AppState.trip.startedAt) {
      if (el) el.textContent = '00:00:00';
      return;
    }

    const startTime = getTimestampMillis(AppState.trip.startedAt);
    const ms = Math.max(0, Date.now() - startTime);

    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);

    el.textContent = [h, m, s]
      .map(v => String(v).padStart(2, '0'))
      .join(':');
  };

  updateClock(); 
  tripTimerInterval = setInterval(updateClock, 1000);
}

// ---------- Restore Active Trip ----------
async function restoreActiveTrip() {
  if (!AppState.conductor.id) return;

  try {
    const trip = await getActiveTripRepo(AppState.conductor.id, AppState.bus.id);

    if (!trip) {
      AppState.trip.active = false;
      AppState.trip.tripId = null;
      updateTripStatus();
      stopTripTimer();
      return;
    }

    const startedTime = getTimestampMillis(trip.startedAt);

    AppState.trip = {
      active: true,
      startedAt: startedTime,
      endedAt: null,
      tripId: trip.id,
      directionFromId: trip.directionFromId || null,
      directionFromName: trip.directionFromName || null,
      directionToId: trip.directionToId || null,
      directionToName: trip.directionToName || null,
      directionTo: trip.directionToName || null,
      directionLabel: trip.directionLabel || "",
    };
    stopEtaAnalytics = Array.isArray(trip.stopEtaAnalytics)
      ? trip.stopEtaAnalytics.map((entry) => ({ ...entry }))
      : [];
    listenToDropoffRequests(trip.id);
    if (window.startLiveOccupancySync) window.startLiveOccupancySync(trip.id);
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

// ---------- Real-time active trip listener across devices ----------
function initActiveTripListener() {
  if (unsubscribeActiveTrip) {
    unsubscribeActiveTrip();
    unsubscribeActiveTrip = null;
  }

  if (!AppState.conductor.id && !AppState.bus.id) return;

  unsubscribeActiveTrip = listenToActiveTripRepo(
    AppState.conductor.id,
    (trip) => {
      if (trip && trip.status === "active") {
        const wasActive = AppState.trip.active;
        const previousTripId = AppState.trip.tripId;

        const startedTime = getTimestampMillis(trip.startedAt);
        AppState.trip.active = true;
        AppState.trip.startedAt = startedTime;
        AppState.trip.endedAt = null;
        AppState.trip.tripId = trip.id;
        AppState.trip.directionFromId = trip.directionFromId || null;
        AppState.trip.directionFromName = trip.directionFromName || null;
        AppState.trip.directionToId = trip.directionToId || null;
        AppState.trip.directionToName = trip.directionToName || null;
        AppState.trip.directionTo = trip.directionToName || null;
        AppState.trip.directionLabel = trip.directionLabel || "";
        stopEtaAnalytics = Array.isArray(trip.stopEtaAnalytics)
          ? trip.stopEtaAnalytics.map((entry) => ({ ...entry }))
          : [];

        AppState.occupancy.onboard = Number(trip.onboard) || 0;
        AppState.occupancy.totalIn = Number(trip.totalIn) || 0;
        AppState.occupancy.totalOut = Number(trip.totalOut) || 0;
        if (trip.capacity) AppState.occupancy.capacity = Number(trip.capacity);

        if (!wasActive || previousTripId !== trip.id) {
          listenToDropoffRequests(trip.id);
          if (window.startLiveOccupancySync) window.startLiveOccupancySync(trip.id);
          startBusLocationTracking();
          setLiveMapAvailable(true);
          updateTripStatus();
          startTripTimer();
          window.refreshConductorPage?.();
        }
      } else {
        if (AppState.trip.active) {
          AppState.trip.active = false;
          AppState.trip.endedAt = Date.now();
          AppState.trip.tripId = null;

          listenToDropoffRequests(null);
          if (window.stopLiveOccupancySync) window.stopLiveOccupancySync();
          stopBusLocationTracking();
          setLiveMapAvailable(false);
          stopTripTimer();
          updateTripStatus();
          window.refreshConductorPage?.();
        }
      }
    },
    AppState.bus.id
  );
}

// ---------- Expose ----------
window.startTrip = startTrip;
window.restoreActiveTrip = restoreActiveTrip;
window.initActiveTripListener = initActiveTripListener;
window.endTrip = endTrip;
window.startTripTimer = startTripTimer;
window.stopTripTimer = stopTripTimer;
window.saveTripOccupancy = saveTripOccupancy;
window.addHistory = recordHistory;
window.updateTripStatus = updateTripStatus;
