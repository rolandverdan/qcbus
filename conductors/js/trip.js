// ==================================================
// TRIP MANAGEMENT
// ==================================================

import {
  getActiveTripRepo,
  listenToActiveTripRepo,
  addTripRepo,
  updateTripRepo,
  endTripRepo,
  endStaleActiveTripsRepo,
} from "../../shared/js/repositories/trips.repo.js";

import {
  listenToTripDropoffRequestsRepo,
} from "../../shared/js/repositories/dropoffs.repo.js";

import {
  updateBusLocationRepo,
  clearBusLocationRepo,
} from "../../shared/js/repositories/buses.repo.js";

import { getDistanceKm, getEta, getNearestStop } from "../../shared/js/eta.js";

let tripTimerInterval = null;
let unsubscribeDropoffRequests = null;
let unsubscribeActiveTrip = null;
let busLocationWatchId = null;
let lastBusLocationWriteAt = 0;
const BUS_LOCATION_WRITE_INTERVAL_MS = 3000;
const STOP_ETA_CAPTURE_DISTANCE_KM = 3;
const STOP_ARRIVAL_RADIUS_KM = 0.15;
let stopEtaAnalytics = [];
let stopEtaAnalyticsWrite = Promise.resolve();
let stopArrivalCandidate = null;

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

function trackStopEtaAndArrival(latitude, longitude, now, accuracy) {
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
  const hasUsableAccuracy = Number.isFinite(accuracy) && accuracy > 0;

  if (!existing && hasUsableAccuracy && accuracy <= 100 && distanceKm <= STOP_ETA_CAPTURE_DISTANCE_KM && distanceKm > STOP_ARRIVAL_RADIUS_KM) {
    const eta = getEta(AppState.bus, nextStop, now);
    if (Number.isFinite(eta.minutes)) {
      analytics.push({
        stopId: nextStop.id,
        stopName: nextStop.name || "Bus stop",
        predictedArrivalAt: now + eta.minutes * 60_000,
        predictionCapturedAt: now,
        actualArrivalAt: null,
        distanceAtPredictionKm: distanceKm,
        gpsAccuracyMeters: accuracy,
      });
      changed = true;
    }
  }

  const currentEntry = analytics.find((entry) => entry.stopId === nextStop.id);
  if (currentEntry && !currentEntry.actualArrivalAt) {
    const isReliableArrivalFix = hasUsableAccuracy && accuracy <= 75;
    if (distanceKm <= STOP_ARRIVAL_RADIUS_KM && isReliableArrivalFix) {
      if (stopArrivalCandidate?.stopId === nextStop.id && now - stopArrivalCandidate.lastSeenAt <= 5000) {
        stopArrivalCandidate.fixes += 1;
        stopArrivalCandidate.lastSeenAt = now;
      } else {
        stopArrivalCandidate = { stopId: nextStop.id, firstSeenAt: now, lastSeenAt: now, fixes: 1 };
      }

      if (stopArrivalCandidate.fixes >= 3 && now - stopArrivalCandidate.firstSeenAt >= 3000) {
        currentEntry.actualArrivalAt = now;
        currentEntry.arrivalGpsAccuracyMeters = accuracy;
        stopArrivalCandidate = null;
        changed = true;
      }
    } else if (stopArrivalCandidate?.stopId === nextStop.id) {
      stopArrivalCandidate = null;
    }
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
  if (!AppState.bus.documentId || !localGps || !AppState.trip.tripId) return;
  if (Number.isFinite(localGps.accuracy) && localGps.accuracy > 150 &&
      !(Date.now() - (lastBusLocationWriteAt || gpsTripStartedAt) >= 30000 && localGps.accuracy <= 1000)) return;

  try {
    await updateBusLocationRepo(AppState.bus.documentId, {
      lat: localGps.lat,
      lng: localGps.lng,
      speedKmh: localGps.speedKmh,
      accuracy: localGps.accuracy,
      deviceId: CONDUCTOR_DEVICE_ID,
      tripId: AppState.trip.tripId,
    });
    lastBusLocationWriteAt = Date.now();
  } catch (error) {
    console.error("Bus location update failed:", error);
  }
}

function requestDevicePosition(forceWrite = false) {
  if (!navigator.geolocation || isRequestingDevicePosition) return;
  isRequestingDevicePosition = true;
  const onFailure = (error) => {
    if (error?.code === 1) {
      isRequestingDevicePosition = false;
      if (window.AppState) AppState.locationPermissionState = "denied";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        isRequestingDevicePosition = false;
        handleConductorGpsPosition(position, forceWrite);
      },
      (fallbackError) => {
        isRequestingDevicePosition = false;
        console.warn("Bus location fetch warning:", fallbackError || error);
      },
      { enableHighAccuracy: false, maximumAge: 15000, timeout: 15000 }
    );
  };
  navigator.geolocation.getCurrentPosition(
    (position) => {
      isRequestingDevicePosition = false;
      handleConductorGpsPosition(position, forceWrite);
    },
    onFailure,
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
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
    if (btn) btn.disabled = false;
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
    if (btn) btn.disabled = false;
    if (error?.code === 1) {
      if (window.AppState) AppState.locationPermissionState = "denied";
      showToast("Location access is blocked. Allow it in your browser site settings.", "error");
    } else {
      if (window.AppState) AppState.locationPermissionState = "prompt";
      showToast(error?.code === 3
        ? "Location is taking too long. Check that phone location is on and try again."
        : "Could not get phone location. Check that phone location is on and try again.", "warn");
    }
    window.refreshConductorPage?.();
  };

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (btn) btn.disabled = false;
      onSuccess(position);
    },
    (err) => {
      if (err && err.code !== err.PERMISSION_DENIED) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (btn) btn.disabled = false;
            onSuccess(position);
          },
          onError,
          { enableHighAccuracy: false, maximumAge: 15000, timeout: 15000 }
        );
      } else {
        onError(err);
      }
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
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
  window.__gpsStatus = {
    state: normalizedAccuracy !== null && normalizedAccuracy > 150 ? "weak" : "ok",
    accuracy: normalizedAccuracy,
    lastFixAt: now,
  };
  updateGpsStatusChip();
  gpsNoFixWarned = false;

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

  trackStopEtaAndArrival(AppState.bus.lat ?? latitude, AppState.bus.lng ?? longitude, now, normalizedAccuracy);
  updateNearestStop(AppState.bus.lat ?? latitude, AppState.bus.lng ?? longitude);
  window.updateConductorEta?.();
  window.updateFloatingLiveMap?.();

  if (!AppState.bus.documentId || hasBetterOtherDeviceFix) return;

  const elapsedSinceLastWrite = now - lastBusLocationWriteAt;
  if (!forceWrite && lastBusLocationWriteAt && elapsedSinceLastWrite < BUS_LOCATION_WRITE_INTERVAL_MS) {
    if (!pendingLocationWriteTimer) {
      pendingLocationWriteTimer = setTimeout(() => {
        flushBusLocationToFirestore();
      }, BUS_LOCATION_WRITE_INTERVAL_MS - elapsedSinceLastWrite);
    }
    return;
  }

  await flushBusLocationToFirestore();
}

function startBusLocationTracking() {
  if (busLocationWatchId !== null) return;

  if (!navigator.geolocation || !AppState.bus.documentId) {
    showToast("Live ETA needs location access", "warn");
    return;
  }

  requestTripWakeLock();
  if (!gpsTripStartedAt) gpsTripStartedAt = Date.now();
  window.__gpsStatus ||= { state: "searching", accuracy: null, lastFixAt: null };
  updateGpsStatusChip();
  busLocationWatchId = navigator.geolocation.watchPosition(
    (position) => handleConductorGpsPosition(position, false),
    (error) => {
      console.warn("GPS signal hiccup:", error.message);
      if (error.code === 1) {
        window.__gpsStatus = { ...window.__gpsStatus, state: "denied" };
        if (window.AppState) AppState.locationPermissionState = "denied";
        showToast("Allow location access to share live ETA", "warn");
        stopBusLocationTracking();
      } else {
        window.__gpsStatus = { ...window.__gpsStatus, state: error.code === 2 ? "weak" : "searching" };
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 30000,
    }
  );
  if (!busLocationHeartbeatInterval) {
    busLocationHeartbeatInterval = setInterval(() => {
      if (!AppState.trip.active) return stopBusLocationTracking();
      updateGpsStatusChip();
      if (Date.now() - (lastGpsFixReceivedAt || gpsTripStartedAt) > 20000 && document.visibilityState === "visible" && busLocationWatchId !== null && Date.now() - lastWatchRestartAt >= 20000) {
        navigator.geolocation.clearWatch(busLocationWatchId);
        busLocationWatchId = null;
        lastWatchRestartAt = Date.now();
        startBusLocationTracking();
      }
      if (AppState.trip.active && !gpsNoFixWarned && Date.now() - (lastGpsFixReceivedAt || gpsTripStartedAt) > 60000) {
        gpsNoFixWarned = true;
        showToast("No GPS fix received for 60 seconds", "warn");
      }
    }, 5000);
  }
}

let lastWatchRestartAt = 0;
let gpsTripStartedAt = 0;
let gpsNoFixWarned = false;
function updateGpsStatusChip() {
  const status = window.__gpsStatus || { state: "searching" };
  const label = status.state === "ok" ? (Number.isFinite(status.accuracy) ? `GPS OK ±${Math.round(status.accuracy)} m` : "GPS OK") : status.state === "weak" ? "Weak GPS" : status.state === "denied" ? "GPS denied" : "Searching for GPS…";
  document.querySelectorAll("[data-gps-status]").forEach((chip) => { chip.textContent = label; });
}

if (!window.__conductorLocationLifecycleBound) {
  window.__conductorLocationLifecycleBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && window.AppState?.trip?.active) {
      requestTripWakeLock();
      checkGpsWatchdog();
    }
  });
  window.addEventListener("focus", () => {
    if (window.AppState?.trip?.active) {
      requestTripWakeLock();
      checkGpsWatchdog();
    }
  });
  window.addEventListener("online", () => {
    if (window.AppState?.trip?.active) {
      requestTripWakeLock();
      checkGpsWatchdog();
    }
  });
}

function checkGpsWatchdog() {
  updateGpsStatusChip();
  if (Date.now() - (lastGpsFixReceivedAt || gpsTripStartedAt) > 20000 && document.visibilityState === "visible" && Date.now() - lastWatchRestartAt >= 20000) {
    stopBusWatchOnly();
    lastWatchRestartAt = Date.now();
    startBusLocationTracking();
  }
}

function stopBusWatchOnly() {
  if (busLocationWatchId !== null) navigator.geolocation?.clearWatch(busLocationWatchId);
  busLocationWatchId = null;
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
    try {
      await endStaleActiveTripsRepo(AppState.conductor.id, AppState.bus.id, AppState.bus.documentId, null);
    } catch (error) {
      console.warn("Unable to close stale active trips:", error);
    }
    try {
      await clearBusLocationRepo(AppState.bus.documentId);
    } catch (error) {
      console.warn("Unable to clear previous bus location:", error);
    }
    lastBusLocationWriteAt = 0;
    lastGpsFixReceivedAt = 0;
    gpsTripStartedAt = Date.now();
    gpsNoFixWarned = false;
    const trip = await addTripRepo({
      conductorId: AppState.conductor.id,
      conductorName: AppState.conductor.name,

      busId: AppState.bus.id,
      busCode: AppState.bus.code || AppState.bus.id,
      busDocId: AppState.bus.documentId || null,

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
    stopArrivalCandidate = null;

    AppState.occupancy = {
      onboard: 0,
      totalIn: 0,
      totalOut: 0,
      capacity: AppState.bus.capacity,
    };

    listenToDropoffRequests(trip.id);
    if (window.startLiveOccupancySync) window.startLiveOccupancySync(trip.id);
    startBusLocationTracking();
    const localGps = window.__conductorLocalGps;
    if (localGps && Date.now() - localGps.updatedAt < 20000 && Number.isFinite(localGps.lat) && Number.isFinite(localGps.lng) && (localGps.lat !== 0 || localGps.lng !== 0)) {
      updateBusLocationRepo(AppState.bus.documentId, { ...localGps, deviceId: CONDUCTOR_DEVICE_ID, tripId: trip.id })
        .then(() => { lastBusLocationWriteAt = Date.now(); })
        .catch((err) => console.warn("Initial bus location sync failed:", err));
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
    try {
      await clearBusLocationRepo(AppState.bus.documentId);
    } catch (error) {
      console.warn("Unable to clear ended trip location:", error);
    }

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
    stopArrivalCandidate = null;
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
        if (previousTripId !== trip.id) stopArrivalCandidate = null;

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

