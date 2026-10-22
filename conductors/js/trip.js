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

let busLocationHeartbeatInterval = null;
let pendingLocationWriteTimer = null;
let isRequestingDevicePosition = false;
let lastGpsFixReceivedAt = 0;
let lastSpeedSample = null;
let tripWakeLock = null;

const CONDUCTOR_DEVICE_ID =
  window.__conductorDeviceId ||
  (window.__conductorDeviceId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function requestTripWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    if (!tripWakeLock) {
      tripWakeLock = await navigator.wakeLock.request("screen");
      tripWakeLock.addEventListener("release", () => {
        tripWakeLock = null;
      });
    }
  } catch (_err) {
    // Wake lock is best-effort on mobile browsers
  }
}

function releaseTripWakeLock() {
  if (tripWakeLock) {
    tripWakeLock.release().catch(() => {});
    tripWakeLock = null;
  }
}

function computeLiveBusSpeedKmh(latitude, longitude, hardwareSpeedMs, now) {
  let instantSpeedKmh = null;
  let distMeters = 0;
  let elapsedSec = 0;

  if (lastSpeedSample) {
    elapsedSec = (now - lastSpeedSample.time) / 1000;
    const distKm = getDistanceKm(lastSpeedSample, { lat: latitude, lng: longitude });
    distMeters = Number.isFinite(distKm) ? distKm * 1000 : 0;
  }

  if (Number.isFinite(hardwareSpeedMs) && hardwareSpeedMs > 0.15) {
    instantSpeedKmh = hardwareSpeedMs * 3.6;
  } else if (lastSpeedSample && elapsedSec >= 0.4 && elapsedSec <= 30) {
    if (distMeters >= 1.2) {
      instantSpeedKmh = Math.min(100, (distMeters / 1000) / (elapsedSec / 3600));
    } else if (elapsedSec < 3.5) {
      instantSpeedKmh = (lastSpeedSample.speedKmh || 0) * 0.5;
    } else {
      instantSpeedKmh = 0;
    }
  } else {
    instantSpeedKmh = 0;
  }

  const prevSpeed = lastSpeedSample?.speedKmh || 0;
  const blended =
    instantSpeedKmh < 0.8
      ? 0
      : prevSpeed > 0
        ? prevSpeed * 0.35 + instantSpeedKmh * 0.65
        : instantSpeedKmh;
  const speedKmh = Math.round(blended * 10) / 10;

  if (!lastSpeedSample || distMeters >= 1.2 || elapsedSec >= 2.5) {
    lastSpeedSample = {
      lat: latitude,
      lng: longitude,
      time: now,
      speedKmh,
    };
  } else {
    lastSpeedSample.speedKmh = speedKmh;
  }

  return speedKmh;
}

async function flushBusLocationToFirestore() {
  if (pendingLocationWriteTimer) {
    clearTimeout(pendingLocationWriteTimer);
    pendingLocationWriteTimer = null;
  }
  const localGps = window.__conductorLocalGps;
  if (!AppState.bus.documentId || !localGps) return;

  lastBusLocationWriteAt = Date.now();
  try {
    await updateBusLocationRepo(AppState.bus.documentId, {
      lat: localGps.lat,
      lng: localGps.lng,
      speedKmh: localGps.speedKmh,
      accuracy: localGps.accuracy,
      deviceId: CONDUCTOR_DEVICE_ID,
    });
  } catch (error) {
    console.error("Bus location update failed:", error);
  }
}

function requestDevicePosition(forceWrite = false) {
  if (!navigator.geolocation || isRequestingDevicePosition) return;
  isRequestingDevicePosition = true;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      isRequestingDevicePosition = false;
      handleConductorGpsPosition(position, forceWrite);
    },
    (error) => {
      if (error && error.code !== error.PERMISSION_DENIED) {
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => {
            isRequestingDevicePosition = false;
            handleConductorGpsPosition(fallbackPos, forceWrite);
          },
          (fallbackErr) => {
            isRequestingDevicePosition = false;
            console.warn("Bus location fetch warning:", fallbackErr);
          },
          { enableHighAccuracy: false, maximumAge: 0, timeout: 6000 }
        );
      } else {
        isRequestingDevicePosition = false;
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
  );
}

function requestConductorLocationPermission() {
  if (!navigator.geolocation) {
    if (window.AppState) AppState.locationPermissionState = "unsupported";
    showToast("Location is not supported by this browser", "error");
    window.refreshConductorPage?.();
    return;
  }

  const btn = document.getElementById("conductorLocationPermissionBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Requesting…";
  }

  const onSuccess = (position) => {
    if (window.AppState) AppState.locationPermissionState = "granted";
    handleConductorGpsPosition(position, true);
    if (window.AppState?.trip?.active) {
      startBusLocationTracking();
    }
    const acc = position?.coords?.accuracy;
    const accLabel = Number.isFinite(acc) ? ` (±${Math.round(acc)}m)` : "";
    showToast(`Phone GPS location enabled${accLabel}`, "success");
    window.refreshConductorPage?.();
  };

  const onError = (error) => {
    if (error?.code === error?.PERMISSION_DENIED) {
      if (window.AppState) AppState.locationPermissionState = "denied";
      showToast("Location blocked. Allow Location in your browser site settings.", "error");
    } else {
      showToast("Could not get phone location. Make sure GPS is turned on.", "warn");
    }
    window.refreshConductorPage?.();
  };

  navigator.geolocation.getCurrentPosition(
    onSuccess,
    (err) => {
      if (err && err.code !== err.PERMISSION_DENIED) {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          onError,
          { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 }
        );
      } else {
        onError(err);
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

async function handleConductorGpsPosition(position, forceWrite = false) {
  const { latitude, longitude, speed, accuracy } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (window.AppState) AppState.locationPermissionState = "granted";
  const now = Date.now();
  lastGpsFixReceivedAt = now;

  const normalizedAccuracy = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null;
  const speedKmh = computeLiveBusSpeedKmh(latitude, longitude, speed, now);

  window.__conductorLocalGps = {
    lat: latitude,
    lng: longitude,
    accuracy: normalizedAccuracy,
    speedKmh,
    deviceId: CONDUCTOR_DEVICE_ID,
    updatedAt: now,
  };

  const remoteUpdatedAtMs = getTimestampMillis(AppState.bus.remoteLocationUpdatedAt);
  const remoteAccuracy = Number(AppState.bus.remoteAccuracy);
  const remoteDeviceId = AppState.bus.remoteLocationDeviceId || null;
  const hasBetterOtherDeviceFix =
    Boolean(remoteDeviceId) &&
    remoteDeviceId !== CONDUCTOR_DEVICE_ID &&
    Number.isFinite(remoteAccuracy) &&
    remoteAccuracy > 0 &&
    remoteAccuracy <= 40 &&
    now - remoteUpdatedAtMs < 15000 &&
    Number.isFinite(normalizedAccuracy) &&
    normalizedAccuracy > 250;

  if (!hasBetterOtherDeviceFix) {
    AppState.bus.lat = latitude;
    AppState.bus.lng = longitude;
    AppState.bus.accuracy = normalizedAccuracy;
    AppState.bus.speedKmh = speedKmh;
    AppState.bus.locationUpdatedAt = now;
  }

  trackStopEtaAndArrival(AppState.bus.lat ?? latitude, AppState.bus.lng ?? longitude, now);
  updateNearestStop(AppState.bus.lat ?? latitude, AppState.bus.lng ?? longitude);
  window.updateConductorEta?.();
  window.updateFloatingLiveMap?.();

  if (!AppState.bus.documentId || hasBetterOtherDeviceFix) return;

  const elapsedSinceLastWrite = now - lastBusLocationWriteAt;
  if (!forceWrite && elapsedSinceLastWrite < 750) {
    if (!pendingLocationWriteTimer) {
      pendingLocationWriteTimer = setTimeout(() => {
        flushBusLocationToFirestore();
      }, 750 - elapsedSinceLastWrite);
    }
    return;
  }

  await flushBusLocationToFirestore();
}

function bindBusLocationWatch() {
  if (!navigator.geolocation) return;
  if (busLocationWatchId !== null) {
    navigator.geolocation.clearWatch(busLocationWatchId);
    busLocationWatchId = null;
  }

  busLocationWatchId = navigator.geolocation.watchPosition(
    (position) => handleConductorGpsPosition(position, false),
    (error) => {
      console.warn("Bus location tracking error:", error);
      if (error && error.code === error.PERMISSION_DENIED) {
        if (window.AppState) AppState.locationPermissionState = "denied";
        showToast("Allow location access to share live ETA", "warn");
        stopBusLocationTracking();
        window.refreshConductorPage?.();
      } else {
        requestDevicePosition(true);
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    }
  );
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

      // Reduced throttle from 10s to 4s for smoother live map tracking
      if (now - lastBusLocationWriteAt < 4000) return;
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
      console.warn("GPS signal hiccup:", error.message);
      // ONLY stop tracking if the user explicitly blocked permission (code 1)
      if (error.code === error.PERMISSION_DENIED) {
        showToast("Allow location access to share live ETA", "warn");
        stopBusLocationTracking();
      }
      // For TIMEOUT (3) or POSITION_UNAVAILABLE (2) under flyovers/tunnels, 
      // do nothing! watchPosition will automatically recover once signal returns.
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000, // Allow slightly cached GPS in weak signal areas
      timeout: 25000,    // Give GPS 25s before timing out in dead zones
    }
  );
}

if (!window.__conductorLocationLifecycleBound) {
  window.__conductorLocationLifecycleBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && window.AppState?.trip?.active) {
      requestTripWakeLock();
      bindBusLocationWatch();
      requestDevicePosition(true);
    }
  });
  window.addEventListener("focus", () => {
    if (window.AppState?.trip?.active) {
      requestTripWakeLock();
      requestDevicePosition(true);
    }
  });
  window.addEventListener("online", () => {
    if (window.AppState?.trip?.active) {
      requestDevicePosition(true);
      flushBusLocationToFirestore();
    }
  });
}

function stopBusLocationTracking() {
  if (busLocationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(busLocationWatchId);
  }
  busLocationWatchId = null;

  if (busLocationHeartbeatInterval) {
    clearInterval(busLocationHeartbeatInterval);
    busLocationHeartbeatInterval = null;
  }
  if (pendingLocationWriteTimer) {
    clearTimeout(pendingLocationWriteTimer);
    pendingLocationWriteTimer = null;
  }
  lastSpeedSample = null;
  releaseTripWakeLock();
}

function listenToDropoffRequests(tripId) {
  if (unsubscribeDropoffRequests) {
    unsubscribeDropoffRequests();
    unsubscribeDropoffRequests = null;
  }

  AppState.dropoffRequests = [];
  AppState.currentAlightStopId = null;
  window.updateFloatingLiveMap?.();
  if (!tripId) return;

  unsubscribeDropoffRequests = listenToTripDropoffRequestsRepo(
    tripId,
    (requests) => {
      AppState.dropoffRequests = requests;

      window.refreshConductorPage?.();
      window.updateFloatingLiveMap?.();
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
    if (
      AppState.bus.documentId &&
      Number.isFinite(Number(AppState.bus.lat)) &&
      Number.isFinite(Number(AppState.bus.lng))
    ) {
      updateBusLocationRepo(AppState.bus.documentId, {
        lat: AppState.bus.lat,
        lng: AppState.bus.lng,
        speedKmh: AppState.bus.speedKmh || 0,
      }).catch((err) => console.warn("Initial bus location sync failed:", err));
    }
    setLiveMapAvailable(true);
    window.updateFloatingLiveMap?.();

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
        }
        window.refreshConductorPage?.();
        window.updateFloatingLiveMap?.();
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
window.startBusLocationTracking = startBusLocationTracking;
window.stopBusLocationTracking = stopBusLocationTracking;
window.requestConductorLocationPermission = requestConductorLocationPermission;
window.requestConductorDevicePosition = requestDevicePosition;

