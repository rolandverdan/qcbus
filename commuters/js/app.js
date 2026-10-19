import {
  requireRole,
} from "../../shared/js/auth.js";

import { auth } from "../../shared/js/firebase.js";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../../shared/js/firebase.js";
import {
  COMMUTER_NEARBY_RADIUS_METERS,
  DROPOFF_BUS_RADIUS_METERS,
  getDistanceKm,
  getEta,
} from "../../shared/js/eta.js";

import {
  getUserProfile,
  updateUserProfile,
} from "../../shared/js/repositories/users.repo.js";

import {
  signOutUser,
} from "../../shared/js/repositories/auth.repo.js";

import "../../shared/js/loading.js";

import {
  createReport,
} from "../../shared/js/repositories/reports.repo.js";

import {
  listenToDropoffRequestRepo,
  saveDropoffRequestRepo,
} from "../../shared/js/repositories/dropoffs.repo.js";

// ==================================================
// FIREBASE AUTH GUARD
// ==================================================

const session = await requireRole("commuter");

if (!session) {
  throw new Error("Commuter authentication required.");
}

const { user, profile } = session;


// ==================================================
// APP STATE
// ==================================================

const AppState = {
  currentPage: "home",
  routeFilter: "all",

  user: {
    uid: user.uid,
    name: profile?.name || user.displayName || "Commuter",
    email: profile?.email || user.email || "",
    phone: profile?.phone || user.phoneNumber || "",
    photoURL: profile?.photoURL || user.photoURL || "",
    savedRoutes: Array.isArray(profile?.savedRoutes)
      ? profile.savedRoutes
      : [],
  },

  notifications: [],

  settings: {
    notifications: false,
    notificationSound: true,
    notificationVibration: true,
    darkMode: false,
  },

  routes: [],
  stops: [],
  buses: [],
  nearbyLocation: null,
  nearbyLocationError: "",
  activeTrips: [],
  userLocation: null,
  dropoff: {
    tripId: null,
    stopId: null,
    stopName: "",
  },
};

let pendingProfilePhoto = null;
let pendingProfilePhotoPreviewUrl = "";

window.AppState = AppState;

// ==================================================
// LIVE PROFILE SYNC — reflects name/phone/photo changes instantly
// ==================================================
onSnapshot(
  doc(db, "users", user.uid),
  (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const next = {
      name: data.name || user.displayName || "Commuter",
      email: data.email || user.email || "",
      phone: data.phone || "",
      photoURL: data.photoURL || user.photoURL || "",
    };
    const changed = Object.keys(next).some((k) => AppState.user[k] !== next[k]);
    if (!changed) return;
    Object.assign(AppState.user, next);
    // Don't clobber the edit form while the user is typing in it
    if (!document.getElementById("editProfileModal")) {
      refreshCurrentPage({ refreshRoutes: false });
    }
  },
  (error) => console.error("Live profile sync failed:", error)
);


// ==================================================
// FIRESTORE LISTENERS
// ==================================================

let unsubscribeRoutes = null;
let unsubscribeStops = null;
let unsubscribeBuses = null;
let unsubscribeTrips = null;
let unsubscribeMyDropoff = null;

let rawBuses = [];
let nearbyLocationWatchId = null;


// ==================================================
// HELPERS
// ==================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCommuterGreeting() {
  const hourInManila = Number(
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date())
  );

  if (hourInManila >= 5 && hourInManila < 12) return "Good morning,";
  if (hourInManila >= 12 && hourInManila < 18) return "Good afternoon,";
  return "Good evening,";
}

function getNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}


function getRouteById(routeId) {
  if (!routeId) return null;

  return (
    AppState.routes.find(
      (route) => route.id === routeId
    ) || null
  );
}


function getStopsByRoute(routeId) {
  return AppState.stops
    .filter((stop) => stop.routeId === routeId)
    .sort(
      (a, b) =>
        getNumber(a.order, 0) -
        getNumber(b.order, 0)
    );
}


function getBusById(busId) {
  if (!busId) return null;

  return (
    AppState.buses.find(
      (bus) => bus.id === busId
    ) || null
  );
}


function getBusByCode(busCode) {
  if (!busCode) return null;

  return (
    AppState.buses.find(
      (bus) => bus.code === busCode
    ) || null
  );
}


function getActiveTripForBus(busId, busCode) {
  return (
    AppState.activeTrips.find(
      (trip) =>
        trip.status === "active" &&
        [trip.busId, trip.busCode].some(
          tripBusId =>
            tripBusId &&
            (tripBusId === busId || tripBusId === busCode)
        )
    ) || null
  );
}

function isCommuterNearTripBus(trip) {
  const location = AppState.userLocation;
  if (
    !trip ||
    !location ||
    Date.now() - location.updatedAt > 30000
  ) {
    return false;
  }

  const bus = AppState.buses.find(
    (activeBus) => activeBus.tripId === trip.id
  );
  const distanceKm = getDistanceKm(location, bus);

  return (
    distanceKm !== null &&
    distanceKm * 1000 <= DROPOFF_BUS_RADIUS_METERS
  );
}


function renderCommuterDropoffEta() {
  const trip = AppState.activeTrips.find(
    (activeTrip) => activeTrip.id === AppState.dropoff.tripId
  );
  const stop = AppState.stops.find(
    (routeStop) => routeStop.id === AppState.dropoff.stopId
  );

  if (!trip || !stop) {
    return `
      <p class="text-sm font-semibold text-gray-800">Drop-off ETA</p>
      <p class="mt-1 text-xs text-gray-500">Confirm a stop on the map to see its live estimate.</p>
    `;
  }

  const bus = AppState.buses.find(
    (activeBus) => activeBus.tripId === trip.id
  );
  const eta = getEta(bus, stop);

  return `
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-blue-800">Drop-off ETA</p>
        <p class="mt-1 text-sm font-semibold text-gray-800">${escapeHtml(stop.name || stop.stopName || "Selected stop")}</p>
        <p class="mt-1 text-xs text-gray-500">${escapeHtml(eta.detail)}</p>
      </div>
      <span class="shrink-0 text-xl font-bold text-qc-blue-accent">${escapeHtml(eta.label)}</span>
    </div>
  `;
}


function updateCommuterDropoffEta() {
  const etaCard = document.getElementById("dropoffEtaCard");
  if (etaCard) etaCard.innerHTML = renderCommuterDropoffEta();
}

function getRouteLabel(route) {
  if (!route) {
    return "No route assigned";
  }

  if (route.code && route.name) {
    return `${route.code} · ${route.name}`;
  }

  return route.code || route.name || "Unnamed route";
}


function getStatusLabel(bus) {
  if (bus.tripActive) {
    return "On Trip";
  }

  const status =
    String(bus.status || "idle")
      .trim()
      .toLowerCase();

  if (!status) {
    return "Idle";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}


function getStatusClass(bus) {
  if (bus.tripActive) {
    return "text-green-600";
  }

  const status =
    String(bus.status || "")
      .toLowerCase();

  if (
    status === "active" ||
    status === "available" ||
    status === "online"
  ) {
    return "text-blue-600";
  }

  if (
    status === "inactive" ||
    status === "offline"
  ) {
    return "text-red-500";
  }

  return "text-gray-500";
}

function getNearbyBuses() {
  if (!AppState.nearbyLocation) return [];

  return AppState.buses
    .map((bus) => {
      const distanceKm = getDistanceKm(AppState.nearbyLocation, bus);
      const updatedAt = bus.locationUpdatedAt?.toMillis?.()
        ?? (bus.locationUpdatedAt instanceof Date
          ? bus.locationUpdatedAt.getTime()
          : typeof bus.locationUpdatedAt === "number"
            ? bus.locationUpdatedAt
            : Date.parse(bus.locationUpdatedAt || ""));

      if (
        distanceKm === null ||
        distanceKm * 1000 > COMMUTER_NEARBY_RADIUS_METERS ||
        !Number.isFinite(updatedAt) ||
        Date.now() - updatedAt > 120000 ||
        updatedAt - Date.now() > 30000
      ) {
        return null;
      }

      return { bus, distanceKm };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function getNextStopEtaForBus(bus) {
  if (!bus?.tripActive || !bus.directionFromId || !bus.directionToId) return null;

  const stops = getStopsByRoute(bus.routeId);
  const fromIndex = stops.findIndex((stop) => stop.id === bus.directionFromId);
  const toIndex = stops.findIndex((stop) => stop.id === bus.directionToId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;

  const direction = fromIndex < toIndex ? 1 : -1;
  const directedStops = [];
  for (let i = fromIndex; direction > 0 ? i <= toIndex : i >= toIndex; i += direction) {
    directedStops.push(stops[i]);
  }

  const busLatitude = Number(bus.lat);
  const busLongitude = Number(bus.lng);
  if (!Number.isFinite(busLatitude) || !Number.isFinite(busLongitude)) return null;

  const earthRadiusMeters = 6371008.8;
  const toPoint = (stop) => {
    const latitude = Number(stop.lat ?? stop.latitude);
    const longitude = Number(stop.lng ?? stop.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const meanLatitude = (latitude + busLatitude) / 2 * Math.PI / 180;
    return {
      x: (longitude - busLongitude) * Math.PI / 180 * earthRadiusMeters * Math.cos(meanLatitude),
      y: (latitude - busLatitude) * Math.PI / 180 * earthRadiusMeters,
    };
  };

  let nearestSegmentIndex = -1;
  let nearestDistanceSquared = Infinity;
  for (let i = 0; i < directedStops.length - 1; i += 1) {
    const start = toPoint(directedStops[i]);
    const end = toPoint(directedStops[i + 1]);
    if (!start || !end) continue;

    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const progress = segmentLengthSquared
      ? Math.max(0, Math.min(1, -(start.x * segmentX + start.y * segmentY) / segmentLengthSquared))
      : 0;
    const offsetX = start.x + progress * segmentX;
    const offsetY = start.y + progress * segmentY;
    const distanceSquared = offsetX * offsetX + offsetY * offsetY;

    if (
      distanceSquared < nearestDistanceSquared - 25 ||
      (Math.abs(distanceSquared - nearestDistanceSquared) <= 25 && i > nearestSegmentIndex)
    ) {
      nearestDistanceSquared = distanceSquared;
      nearestSegmentIndex = i;
    }
  }

  const nextStop = nearestSegmentIndex >= 0
    ? directedStops[nearestSegmentIndex + 1]
    : null;
  if (!nextStop) return null;

  return {
    stop: nextStop,
    eta: getEta(bus, nextStop),
  };
}

function isDropoffStopAheadForTrip(trip, stop) {
  if (!trip || !stop || trip.routeId !== stop.routeId) return false;

  const bus = AppState.buses.find((activeBus) =>
    activeBus.tripId === trip.id ||
    activeBus.id === trip.busId ||
    activeBus.code === trip.busCode
  );
  const nextStop = getNextStopEtaForBus(bus)?.stop;
  if (!bus || !nextStop) return false;

  const stops = getStopsByRoute(trip.routeId);
  const fromStopId = trip.directionFromId || bus.directionFromId;
  const toStopId = trip.directionToId || bus.directionToId;
  const fromIndex = stops.findIndex((routeStop) => routeStop.id === fromStopId);
  const toIndex = stops.findIndex((routeStop) => routeStop.id === toStopId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return false;

  const direction = fromIndex < toIndex ? 1 : -1;
  const directedStops = [];
  for (let i = fromIndex; direction > 0 ? i <= toIndex : i >= toIndex; i += direction) {
    directedStops.push(stops[i]);
  }

  const nextPosition = directedStops.findIndex((routeStop) => routeStop.id === nextStop.id);
  const candidatePosition = directedStops.findIndex((routeStop) => routeStop.id === stop.id);
  return nextPosition >= 0 && candidatePosition >= nextPosition;
}

function startNearbyBusDetection() {
  if (!navigator.geolocation) {
    AppState.nearbyLocationError = "Location is not supported by this browser.";
    refreshCurrentPage();
    return;
  }
  if (nearbyLocationWatchId !== null) return;

  AppState.nearbyLocationError = "";
  nearbyLocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      AppState.nearbyLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        updatedAt: Date.now(),
      };
      AppState.nearbyLocationError = "";
      if (AppState.currentPage === "home") refreshCurrentPage();
    },
    (error) => {
      AppState.nearbyLocationError = error.code === error.PERMISSION_DENIED
        ? "Location permission is blocked. Allow it in your browser settings to find nearby buses."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Your current location is unavailable. Try again in a moment."
          : "Could not get your location. Please try again.";
      if (AppState.currentPage === "home") refreshCurrentPage();
      if (error.code === error.PERMISSION_DENIED) {
        navigator.geolocation.clearWatch(nearbyLocationWatchId);
        nearbyLocationWatchId = null;
      }
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
  refreshCurrentPage();
}

function stopNearbyBusDetection() {
  if (nearbyLocationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(nearbyLocationWatchId);
  }
  nearbyLocationWatchId = null;
  AppState.nearbyLocation = null;
  AppState.nearbyLocationError = "";
  if (AppState.currentPage === "home") refreshCurrentPage();
}


function getInitials(name) {
  const parts =
    String(name || "Commuter")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  return parts
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


function isRouteSaved(routeId) {
  return Array.isArray(AppState.user.savedRoutes)
    ? AppState.user.savedRoutes.includes(routeId)
    : false;
}

function getFilteredRoutes() {
  return AppState.routeFilter === "favorites"
    ? AppState.routes.filter((route) => AppState.user.savedRoutes.includes(route.id))
    : AppState.routes;
}

function setRouteFilter(filter) {
  AppState.routeFilter = filter === "favorites" ? "favorites" : "all";
  navigateTo("routes", false);
}


// ==================================================
// SAVED ROUTES
// ==================================================

async function toggleSavedRoute(routeId) {
  const route = getRouteById(routeId);

  if (!route) {
    console.error("Route not found:", routeId);
    return;
  }

  const currentSavedRoutes = Array.isArray(AppState.user.savedRoutes)
    ? [...AppState.user.savedRoutes]
    : [];

  const alreadySaved = currentSavedRoutes.includes(routeId);

  const updatedSavedRoutes = alreadySaved
    ? currentSavedRoutes.filter((id) => id !== routeId)
    : [...currentSavedRoutes, routeId];

  try {
    await updateUserProfile(AppState.user.uid, {
      savedRoutes: updatedSavedRoutes,
    });

    AppState.user.savedRoutes = updatedSavedRoutes;

    const favoriteButton = Array.from(
      document.querySelectorAll("[data-favorite-route-id]")
    ).find((button) => button.dataset.favoriteRouteId === routeId);

    if (favoriteButton) {
      const isSaved = updatedSavedRoutes.includes(routeId);
      favoriteButton.classList.toggle("bg-yellow-50", isSaved);
      favoriteButton.classList.toggle("text-yellow-500", isSaved);
      favoriteButton.classList.toggle("bg-gray-50", !isSaved);
      favoriteButton.classList.toggle("text-gray-400", !isSaved);
      favoriteButton.classList.toggle("hover:bg-blue-50", !isSaved);
      favoriteButton.classList.toggle("hover:text-qc-blue", !isSaved);
      favoriteButton.title = isSaved ? "Remove from saved routes" : "Save route";
      favoriteButton.setAttribute("aria-label", favoriteButton.title);
      favoriteButton.querySelector("svg")?.setAttribute(
        "fill",
        isSaved ? "currentColor" : "none"
      );

      // In the favorites-only view, remove the card after un-favoriting it.
      if (!isSaved && AppState.routeFilter === "favorites") {
        favoriteButton.closest("[data-saved-route-id]")?.remove();
      }
    }

    showSavedRouteToast(
      alreadySaved
        ? "Route removed from saved routes"
        : "Route saved successfully"
    );

  } catch (error) {
    console.error("Failed to update saved route:", error);

    showSavedRouteToast(
      "Unable to update saved route",
      true
    );
  }
}


function openSavedRoute(routeId) {
  if (!getRouteById(routeId)) {
    showSavedRouteToast("This saved route is no longer available", true);
    return;
  }

  navigateTo("routes", true, { scrollToTop: false });

  requestAnimationFrame(() => {
    const routeCard = Array.from(
      document.querySelectorAll("[data-saved-route-id]")
    ).find((card) => card.dataset.savedRouteId === routeId);

    if (!routeCard) return;

    routeCard.scrollIntoView({ behavior: "smooth", block: "start" });
    routeCard.classList.add("ring-2", "ring-qc-blue-accent");
    setTimeout(() => {
      routeCard.classList.remove("ring-2", "ring-qc-blue-accent");
    }, 1600);
  });
}

function openSavedRouteOnMap(routeId) {
  if (!getRouteById(routeId)) {
    showSavedRouteToast("This saved route is no longer available", true);
    return;
  }

  navigateTo("map");
  window.selectMapRoute?.(routeId);
}

window.openSavedRouteOnMap = openSavedRouteOnMap;

function showSavedRouteToast(message, isError = false) {
  const existingToast =
    document.getElementById("savedRouteToast");

  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");

  toast.id = "savedRouteToast";

  toast.className = `
    fixed
    bottom-24
    left-1/2
    -translate-x-1/2
    z-[9999]
    px-4
    py-3
    rounded-xl
    shadow-lg
    text-sm
    font-medium
    flex
    items-center
    gap-2
    ${
      isError
        ? "bg-red-600 text-white"
        : "bg-gray-900 text-white"
    }
  `;

  toast.innerHTML = `
    <span aria-hidden="true" class="shrink-0">
      ${isError
        ? '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.3 3.9 2.6 17.2A2 2 0 004.3 20h15.4a2 2 0 001.7-2.8L13.7 3.9a2 2 0 00-3.4 0z"/></svg>'
        : '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 12 4 4L19 6"/></svg>'}
    </span>

    <span>
      ${escapeHtml(message)}
    </span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
}


// ==================================================
// REBUILD BUS DATA
// ==================================================

function rebuildBuses() {
  AppState.buses = rawBuses.map((rawBus) => {
    const activeTrip =
      getActiveTripForBus(
        rawBus.id,
        rawBus.code
      );

    const routeId =
      rawBus.routeId ||
      activeTrip?.routeId ||
      null;

    const route =
      getRouteById(routeId);

    return {
      id: rawBus.id,

      code:
        rawBus.code ||
        rawBus.id,

      routeId,

      route:
        activeTrip?.directionLabel || getRouteLabel(route),

      routeCode:
        route?.code ||
        "",

      routeName:
        route?.name ||
        activeTrip?.routeName ||
        "",

      directionFromId: activeTrip?.directionFromId || null,
      directionFromName: activeTrip?.directionFromName || "",
      directionToId: activeTrip?.directionToId || null,
      directionToName: activeTrip?.directionToName || "",
      directionLabel: activeTrip?.directionLabel || "",

      routeColor:
        route?.color ||
        "#1e40af",

      description:
        route?.description ||
        "",

      lat:
        rawBus.lat,

      lng:
        rawBus.lng,

      speedKmh:
        rawBus.speedKmh,

      locationUpdatedAt:
        rawBus.locationUpdatedAt,

      status:
        activeTrip
          ? "On Trip"
          : rawBus.status || "idle",

      capacity:
        getNumber(
          activeTrip?.capacity ??
          rawBus.capacity,
          0
        ),

      driverId:
        rawBus.driverId || null,

      conductorId:
        rawBus.conductorId || null,

      tripId:
        activeTrip?.id || null,

      directionLabel:
        activeTrip?.directionLabel || "",

      tripActive:
        Boolean(activeTrip),

      onboard:
        getNumber(activeTrip?.onboard, 0),

      totalIn:
        getNumber(activeTrip?.totalIn, 0),

      totalOut:
        getNumber(activeTrip?.totalOut, 0),
    };
  });
}


// ==================================================
// REFRESH CURRENT PAGE
// ==================================================

function getHomeBusViewSignature() {
  return JSON.stringify(
    AppState.buses.map((bus) => [
      bus.id,
      bus.code,
      bus.route,
      bus.directionLabel,
      bus.status,
      bus.onboard,
      bus.capacity,
      bus.tripActive,
      bus.lat,
      bus.lng,
      bus.locationUpdatedAt?.toMillis?.() || bus.locationUpdatedAt,
    ])
  );
}


function refreshCurrentPage({ refreshHome = true, refreshRoutes = true } = {}) {
  if (
    !document.getElementById("content")
  ) {
    return;
  }

  if (AppState.currentPage === "home" && refreshHome) {
    const content = document.getElementById("content");
    const scrollY = window.scrollY;
    content.innerHTML = Pages.home();
    content.firstElementChild?.classList.remove("slide-in");
    window.scrollTo(0, scrollY);

    return;
  }

  if (AppState.currentPage === "routes" && refreshRoutes) {
    const content = document.getElementById("content");
    const scrollY = window.scrollY;
    content.innerHTML = Pages.routes();
    content.firstElementChild?.classList.remove("slide-in");
    window.scrollTo(0, scrollY);

    return;
  }

  if (AppState.currentPage === "notifications") {
    const content = document.getElementById("content");
    const scrollY = window.scrollY;
    content.innerHTML = Pages.notifications();
    content.firstElementChild?.classList.remove("slide-in");
    window.scrollTo(0, scrollY);

    return;
  }

  if (AppState.currentPage === "account") {
    const content = document.getElementById("content");
    const scrollY = window.scrollY;
    content.innerHTML = Pages.account();
    content.firstElementChild?.classList.remove("slide-in");
    window.scrollTo(0, scrollY);

    return;
  }

  if (AppState.currentPage === "map") {
    if (
      typeof window.updateBusMarkers ===
      "function"
    ) {
      window.updateBusMarkers();
    }

    if (
      typeof window.updateBusLegend ===
      "function"
    ) {
      window.updateBusLegend();
    }

    if (
      typeof window.updateRouteLayers ===
      "function"
    ) {
      window.updateRouteLayers();
    }

    if (
      typeof window.updateRoutePicker ===
      "function"
    ) {
      window.updateRoutePicker(document.getElementById("routeSearchInput")?.value || "");
    }

    updateCommuterDropoffEta();
  }
}


function selectDropoffTrip(tripId) {
  if (unsubscribeMyDropoff) {
    unsubscribeMyDropoff();
    unsubscribeMyDropoff = null;
  }

  AppState.dropoff = {
    tripId: tripId || null,
    stopId: null,
    stopName: "",
  };

  const trip = AppState.activeTrips.find(
    (activeTrip) => activeTrip.id === tripId
  );

  if (trip) {
    unsubscribeMyDropoff = listenToDropoffRequestRepo(
      trip.id,
      AppState.user.uid,
      (request) => {
        if (AppState.dropoff.tripId !== trip.id) return;

        AppState.dropoff.stopId = request?.stopId || null;
        AppState.dropoff.stopName = request?.stopName || "";
        updateCommuterDropoffEta();
        window.evaluateDropoffAlerts?.();
      },
      (error) => console.error("Drop-off listener failed:", error)
    );
  }

}


async function confirmDropoffStop(tripId, stop) {
  const trip = AppState.activeTrips.find(
    (activeTrip) => activeTrip.id === tripId && activeTrip.status === "active"
  );

  if (!trip || trip.routeId !== stop.routeId) {
    showSavedRouteToast("Choose an active bus on this route", true);
    return false;
  }

  if (!isCommuterNearTripBus(trip)) {
    showSavedRouteToast(
      `Move within ${DROPOFF_BUS_RADIUS_METERS} meters of your bus to choose a stop`,
      true
    );
    return false;
  }

  if (!isDropoffStopAheadForTrip(trip, stop)) {
    showSavedRouteToast(
      "This stop has already been passed or the bus's next stop cannot be verified. Choose a later stop.",
      true
    );
    return false;
  }

  const stopName = stop.name || stop.stopName || "Selected stop";

  try {
    if (AppState.dropoff.tripId !== trip.id) {
      selectDropoffTrip(trip.id);
    }

    await saveDropoffRequestRepo(trip.id, AppState.user.uid, {
      ...stop,
      name: stopName,
    });
    AppState.dropoff.stopId = stop.id;
    AppState.dropoff.stopName = stopName;
    updateCommuterDropoffEta();
    showSavedRouteToast(`Drop-off set for ${stopName}`);
    window.evaluateDropoffAlerts?.();
    return true;
  } catch (error) {
    console.error("Failed to save drop-off:", error);
    showSavedRouteToast("Unable to set drop-off", true);
    return false;
  }
}


// ==================================================
// EDIT PROFILE
// ==================================================

function openEditProfile() {
  const existingModal =
    document.getElementById("editProfileModal");

  if (existingModal) {
    existingModal.remove();
  }

  clearPendingProfilePhoto();

  const modal = document.createElement("div");

  modal.id = "editProfileModal";

  modal.className =
    "fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4";

  modal.innerHTML = `
    <div class="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl">

      <div class="p-5 border-b border-gray-100 flex items-center justify-between">

        <div>
          <h2 class="text-lg font-semibold text-gray-800">
            Edit Profile
          </h2>

          <p class="text-xs text-gray-500 mt-1">
            Update your account information.
          </p>
        </div>

        <button
          type="button"
          onclick="closeEditProfile()"
          class="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
        >
          ✕
        </button>

      </div>


      <form id="editProfileForm" class="p-5 space-y-4">

        <div class="flex flex-col items-center gap-2 pb-1">
          <div class="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-qc-blue text-2xl font-bold">
            <img
              id="editProfilePhotoPreview"
              src="${escapeHtml(AppState.user.photoURL || "")}"
              alt="Profile photo preview"
              class="${AppState.user.photoURL ? "" : "hidden"} absolute inset-0 h-full w-full object-cover"
            />
            <span id="editProfilePhotoInitials" class="${AppState.user.photoURL ? "hidden" : ""}">
              ${escapeHtml(getInitials(AppState.user.name))}
            </span>
          </div>
          <label for="editProfilePhotoInput" class="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Choose profile photo
          </label>
          <input
            id="editProfilePhotoInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="sr-only"
            onchange="previewEditProfilePhoto(this)"
          />
          <p class="text-[11px] text-gray-400">JPG, PNG or WEBP · up to 5 MB</p>
        </div>

        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">
            Full Name
          </label>

          <input
            id="editProfileName"
            type="text"
            value="${escapeHtml(AppState.user.name)}"
            required
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-qc-blue"
          />
        </div>


        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">
            Email
          </label>

          <input
            type="email"
            value="${escapeHtml(AppState.user.email)}"
            disabled
            class="w-full px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-sm text-gray-400"
          />
        </div>


        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">
            Phone Number
          </label>

          <input
            id="editProfilePhone"
            type="tel"
            inputmode="numeric"
            autocomplete="tel-national"
            maxlength="12"
            pattern="[0-9]{0,12}"
            value="${escapeHtml(String(AppState.user.phone || "").replace(/\D/g, "").slice(0, 12))}"
            oninput="sanitizeEditProfilePhone(this)"
            aria-describedby="editProfilePhoneHint"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-qc-blue"
          />
          <p id="editProfilePhoneHint" class="mt-1 text-[11px] text-gray-400">Numbers only, up to 12 digits.</p>
        </div>


        <div class="flex gap-2 pt-2">

          <button
            type="button"
            onclick="closeEditProfile()"
            class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="flex-1 px-4 py-2.5 rounded-xl bg-qc-blue text-white text-sm font-medium"
          >
            Save Changes
          </button>

        </div>

      </form>

    </div>
  `;

  document.body.appendChild(modal);
}

function clearPendingProfilePhoto() {
  // pendingProfilePhoto now holds an 80x80 Base64 JPEG data URL (no Storage needed)
  pendingProfilePhoto = null;
  pendingProfilePhotoPreviewUrl = "";
}

function processProfilePicture(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 80;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const scale = Math.max(size / img.width, size / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const dx = (size - scaledWidth) / 2;
        const dy = (size - scaledHeight) / 2;

        ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, scaledWidth, scaledHeight);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function previewEditProfilePhoto(input) {
  const file = input.files?.[0];
  if (!file) return;

  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    input.value = "";
    showSavedRouteToast("Choose a JPG, PNG, or WEBP image", true);
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    input.value = "";
    showSavedRouteToast("Profile photos must be 5 MB or smaller", true);
    return;
  }

  let base64;
  try {
    base64 = await processProfilePicture(file);
  } catch (error) {
    console.error("Failed to process profile picture:", error);
    input.value = "";
    showSavedRouteToast("Could not read that image", true);
    return;
  }

  clearPendingProfilePhoto();
  pendingProfilePhoto = base64;
  pendingProfilePhotoPreviewUrl = base64;

  const preview = document.getElementById("editProfilePhotoPreview");
  const initials = document.getElementById("editProfilePhotoInitials");
  if (preview) {
    preview.src = base64;
    preview.classList.remove("hidden");
  }
  initials?.classList.add("hidden");
}

function sanitizeEditProfilePhone(input) {
  input.value = input.value.replace(/\D/g, "").slice(0, 12);
}


function closeEditProfile() {
  const modal =
    document.getElementById("editProfileModal");

  if (modal) {
    modal.remove();
  }
  clearPendingProfilePhoto();
}

function openChangePassword() {
  if (!auth.currentUser?.providerData.some((provider) => provider.providerId === "password")) {
    sendPasswordResetEmail(auth, auth.currentUser?.email || AppState.user.email)
      .then(() => showSavedRouteToast("Password setup link sent to your email"))
      .catch((error) => {
        console.error("Failed to send password setup email:", error);
        showSavedRouteToast("Unable to send password setup email", true);
      });
    return;
  }

  document.getElementById("changePasswordModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "changePasswordModal";
  modal.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4";
  modal.innerHTML = `
    <form id="changePasswordForm" class="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
      <div>
        <h2 class="text-lg font-semibold text-gray-800">Change Password</h2>
        <p class="mt-1 text-xs text-gray-500">Confirm your current password, then choose a new one.</p>
      </div>
      <label class="block text-xs font-medium text-gray-600">Current password
        <input name="currentPassword" type="password" autocomplete="current-password" required class="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-qc-blue" />
      </label>
      <label class="block text-xs font-medium text-gray-600">New password
        <input name="newPassword" type="password" minlength="8" autocomplete="new-password" required class="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-qc-blue" />
      </label>
      <label class="block text-xs font-medium text-gray-600">Confirm new password
        <input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required class="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-qc-blue" />
      </label>
      <div class="flex gap-2 pt-1">
        <button type="button" onclick="closeChangePassword()" class="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
        <button type="submit" class="flex-1 rounded-xl bg-qc-blue px-4 py-2.5 text-sm font-medium text-white">Update Password</button>
      </div>
    </form>
  `;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeChangePassword();
  });
  document.body.appendChild(modal);
  modal.querySelector('[name="currentPassword"]').focus();
}

function closeChangePassword() {
  document.getElementById("changePasswordModal")?.remove();
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const currentPassword = data.get("currentPassword");
  const newPassword = data.get("newPassword");
  const confirmPassword = data.get("confirmPassword");
  const button = form.querySelector('[type="submit"]');

  if (newPassword.length < 8) {
    showSavedRouteToast("New password must be at least 8 characters", true);
    return;
  }
  if (newPassword !== confirmPassword) {
    showSavedRouteToast("New passwords do not match", true);
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser?.email) {
    showSavedRouteToast("Please sign in again to change your password", true);
    return;
  }

  button.disabled = true;
  button.textContent = "Updating...";
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPassword);
    closeChangePassword();
    showSavedRouteToast("Password updated successfully");
  } catch (error) {
    console.error("Failed to change password:", error);
    const message = error.code === "auth/weak-password"
      ? "Choose a stronger password"
      : ["auth/wrong-password", "auth/invalid-credential"].includes(error.code)
        ? "Current password is incorrect"
        : error.code === "auth/too-many-requests"
          ? "Too many attempts. Try again later."
          : "Unable to update password. Please try again.";
    showSavedRouteToast(message, true);
    button.disabled = false;
    button.textContent = "Update Password";
  }
}


async function handleEditProfileSubmit(event) {
  event.preventDefault();

  const name =
    document
      .getElementById("editProfileName")
      .value
      .trim();

  const phone =
    document
      .getElementById("editProfilePhone")
      .value
      .replace(/\D/g, "");

  if (!name) {
    showSavedRouteToast(
      "Name cannot be empty",
      true
    );
    return;
  }

  if (phone.length > 12) {
    showSavedRouteToast("Phone number can have up to 12 digits", true);
    return;
  }

  const button =
    event.target.querySelector(
      'button[type="submit"]'
    );

  button.disabled = true;
  button.textContent = "Saving...";

  try {

    let photoURL = AppState.user.photoURL || "";
    if (pendingProfilePhoto) {
      // ~3–5 KB Base64 string, safely under Firestore's 1 MiB doc limit
      photoURL = pendingProfilePhoto;
    }

    await updateUserProfile(
      AppState.user.uid,
      {
        name,
        phone,
        ...(pendingProfilePhoto && { photoURL }),
      }
    );

    AppState.user.name = name;
    AppState.user.phone = phone;
    if (pendingProfilePhoto) AppState.user.photoURL = photoURL;

    closeEditProfile();

    showSavedRouteToast(
      "Profile updated successfully"
    );

    refreshCurrentPage();

  } catch (error) {

    console.error(
      "Failed to update profile:",
      error
    );

    button.disabled = false;
    button.textContent = "Save Changes";

    showSavedRouteToast(
      "Unable to update profile",
      true
    );
  }
}


// ==================================================
// ABOUT MODAL
// ==================================================

function openAboutModal() {
  const modal = document.getElementById("aboutModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeAboutModal() {
  const modal = document.getElementById("aboutModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

// Close on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAboutModal();
});


// ==================================================
// PAGE TEMPLATES
// ==================================================

const Pages = {

  // ==================================================
  // HOME
  // ==================================================

  home: () => `
    <div class="space-y-4 slide-in">

      <!-- Greeting -->

      <div class="relative isolate min-h-[152px] overflow-hidden bg-gradient-to-r from-qc-blue to-blue-700 text-white rounded-xl py-4 pl-4 pr-0 shadow-lg sm:min-h-[184px]">
        <div aria-hidden="true" class="absolute inset-0 bg-left bg-no-repeat opacity-25" style="background-image:url('../images/qcircle.jpg');background-size:140% auto"></div>
        <div class="relative z-10 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-lg opacity-90">${getCommuterGreeting()}</p>
            <h2 class="truncate text-2xl font-bold leading-tight">${escapeHtml(AppState.user.name)}</h2>
            <p class="mt-1 text-base opacity-75">Track QC bus in real-time</p>
          </div>
        </div>
      </div>


      <!-- Nearby Buses -->

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">

        <div class="flex items-center justify-between mb-3">

          <h3 class="font-semibold text-gray-800">
            Nearby Buses
          </h3>

          <span class="text-xs text-qc-blue font-medium">
            ${AppState.nearbyLocation ? `Within ${COMMUTER_NEARBY_RADIUS_METERS} m` : "Location needed"}
          </span>

        </div>

        <div class="mb-3 flex items-center justify-between gap-3 rounded-lg bg-blue-50 p-3">
          <p class="text-xs text-blue-800">
            ${AppState.nearbyLocation
              ? "Showing buses with recent locations near you."
              : AppState.nearbyLocationError || (nearbyLocationWatchId !== null
                ? "Finding your location to detect nearby buses…"
                : `Nearby detection starts automatically. Allow location access to find buses within ${COMMUTER_NEARBY_RADIUS_METERS} m.`)}
          </p>
        </div>


        <div class="space-y-3">

          ${
            !AppState.nearbyLocation
              ? `<div class="py-3 text-center text-xs text-gray-400">Your location is only used to find nearby buses.</div>`
              : getNearbyBuses().length
                ? getNearbyBuses()
                  .map(({ bus, distanceKm }) => `
                    <div
                      class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >

                      <div class="flex items-center gap-3 min-w-0">

                                                <div
                          class="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center border-2 border-white overflow-hidden"
                          style="background:${escapeHtml(bus.routeColor)}"
                        >
                          <img
                            src="../images/bus (2).png"
                            alt="Bus"
                            style="
                              width: 25px;
                              height: 25px;
                              object-fit: contain;
                              filter: brightness(0) invert(1);
                            "
                          />
                        </div>

                        <div class="min-w-0">

                          <p class="font-medium text-sm text-gray-800 truncate">
                            ${escapeHtml(bus.route || "No route assigned")}
                          </p>

                          <p class="text-xs text-gray-500">
                            ${escapeHtml(bus.code || bus.id)}
                          </p>

                        </div>

                      </div>


                      <div class="text-right ml-3 flex-shrink-0">

                        <p class="text-xs font-semibold text-qc-blue">
                          ${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away
                        </p>

                        <p class="text-xs font-medium ${getStatusClass(bus)}">
                          ${escapeHtml(getStatusLabel(bus))}
                        </p>

                        ${bus.tripActive
                          ? (() => {
                              const nextStopEta = getNextStopEtaForBus(bus);
                              return nextStopEta
                                ? `<p class="mt-1 text-xs text-gray-600">Next: ${escapeHtml(nextStopEta.stop.name || "Bus stop")} · ${escapeHtml(nextStopEta.eta.label)}</p>`
                                : `<p class="mt-1 text-xs text-gray-400">Next stop ETA unavailable</p>`;
                            })()
                          : ""}

                        <p class="text-xs text-gray-400">

                          ${
                            bus.tripActive
                              ? `${bus.onboard}/${bus.capacity} onboard`
                              : bus.capacity
                                ? `${bus.capacity} capacity`
                                : "Capacity unavailable"
                          }

                        </p>

                      </div>

                    </div>
                  `)
                  .join("")
              : `
                <div class="py-6 text-center">

                  <p class="text-sm text-gray-400">
                    No buses with recent locations found within ${COMMUTER_NEARBY_RADIUS_METERS} m.
                  </p>

                  <p class="text-xs text-gray-300 mt-1">
                    Nearby buses will appear here when they share a live location.
                  </p>

                </div>
              `
          }

        </div>

      </div>


      <!-- Available Routes -->

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">

        <div class="flex items-center justify-between mb-3">

          <h3 class="font-semibold text-gray-800">
            Available Routes
          </h3>

          <button
            onclick="navigateTo('routes')"
            class="text-xs text-qc-blue font-medium"
          >
            View all
          </button>

        </div>


        <div class="space-y-2">

          ${
            AppState.routes.length
              ? AppState.routes
                  .slice(0, 5)
                  .map((route) => {

                    const stopCount =
                      getStopsByRoute(route.id).length;

                    const busCount =
                      AppState.buses.filter(
                        (bus) =>
                          bus.routeId === route.id
                      ).length;

                    return `
                      <button
                        onclick="navigateTo('routes')"
                        class="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition"
                      >

                        <div class="flex items-center gap-3 min-w-0">

                          <span
                            class="w-3 h-3 rounded-full flex-shrink-0"
                            style="background:${escapeHtml(route.color || "#1e40af")}"
                          ></span>

                          <div class="min-w-0">

                            <p class="text-sm font-medium text-gray-800">
                              ${escapeHtml(route.code || "Route")}
                            </p>

                            <p class="text-xs text-gray-500 truncate">
                              ${escapeHtml(route.name || "Unnamed route")}
                            </p>

                          </div>

                        </div>

                        <div class="text-right ml-3 flex-shrink-0">

                          <p class="text-xs text-gray-500">
                            ${stopCount} ${stopCount === 1 ? "stop" : "stops"}
                          </p>

                          <p class="text-xs text-gray-400">
                            ${busCount} ${busCount === 1 ? "bus" : "buses"}
                          </p>

                        </div>

                      </button>
                    `;
                  })
                  .join("")
              : `
                <div class="py-5 text-center text-sm text-gray-400">
                  No routes available.
                </div>
              `
          }

        </div>

      </div>

      <!-- Saved Routes -->

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-semibold text-gray-800">Saved Route Status</h3>
            <p class="mt-0.5 text-xs text-gray-500">Live buses and their next stop</p>
          </div>
          <button onclick="setRouteFilter('favorites')" class="text-xs font-medium text-qc-blue hover:underline">All saved</button>
        </div>
        <div class="space-y-2">
          ${
            AppState.user.savedRoutes.length
              ? AppState.user.savedRoutes
                  .map((routeId) => {
                    const route = getRouteById(routeId);
                    if (!route) return "";
                    const activeBuses = AppState.buses
                      .filter((bus) => bus.routeId === routeId && bus.tripActive)
                      .sort((a, b) => {
                        if (!AppState.nearbyLocation) return String(a.code).localeCompare(String(b.code));
                        const distanceA = getDistanceKm(AppState.nearbyLocation, a) ?? Infinity;
                        const distanceB = getDistanceKm(AppState.nearbyLocation, b) ?? Infinity;
                        return distanceA - distanceB;
                      });
                    return `
                      <div class="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <div class="flex items-center justify-between gap-3">
                          <div class="flex min-w-0 items-center gap-2">
                            <span class="h-3 w-3 shrink-0 rounded-full" style="background:${escapeHtml(route.color || "#1e40af")}"></span>
                            <div class="min-w-0">
                              <p class="truncate text-sm font-semibold text-gray-800">${escapeHtml(route.code || route.name || "Saved route")}</p>
                              <p class="truncate text-xs text-gray-500">${escapeHtml(route.name || "")}</p>
                            </div>
                          </div>
                          <button onclick="openSavedRouteOnMap('${escapeHtml(routeId)}')" class="shrink-0 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-qc-blue hover:bg-blue-100">View map</button>
                        </div>
                        ${
                          activeBuses.length
                            ? `<div class="mt-2 space-y-1.5">
                                ${activeBuses.slice(0, 2).map((bus) => {
                                  const next = getNextStopEtaForBus(bus);
                                  return `<div class="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2">
                                    <span class="text-xs font-medium text-gray-700">Bus ${escapeHtml(bus.code || bus.id)}</span>
                                    <span class="text-right text-[11px] text-gray-500">${next ? `Next: ${escapeHtml(next.stop.name || "Stop")} · ${escapeHtml(next.eta.label)}` : "On trip · ETA unavailable"}</span>
                                  </div>`;
                                }).join("")}
                                ${activeBuses.length > 2 ? `<p class="px-1 text-[11px] text-gray-500">and ${activeBuses.length - 2} more active ${activeBuses.length - 2 === 1 ? "bus" : "buses"}</p>` : ""}
                              </div>`
                            : '<p class="mt-2 rounded-lg bg-white px-2.5 py-2 text-xs text-gray-500">No active buses on this route right now.</p>'
                        }
                      </div>
                    `;
                  })
                  .filter(Boolean)
                  .join("") || '<p class="py-3 text-center text-xs text-gray-500">Save a route to see its live bus status here.</p>'
              : '<p class="py-3 text-center text-xs text-gray-500">Save a route to see its live bus status here.</p>'
          }
        </div>
      </div>

      <!-- Saved Routes -->

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">

        <div class="flex items-center justify-between mb-3">

          <h3 class="font-semibold text-gray-800">
            Your Saved Routes
          </h3>

          <button
            onclick="navigateTo('routes')"
            class="text-xs text-qc-blue font-medium hover:underline"
          >
            Manage
          </button>

        </div>

        <div class="space-y-2">

          ${
            AppState.user.savedRoutes.length
              ? AppState.user.savedRoutes
                  .map((routeId) => {

                    const route = getRouteById(routeId);

                    if (!route) {
                      return `
                        <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <div class="min-w-0">
                            <p class="text-sm font-semibold text-gray-700">Saved route unavailable</p>
                            <p class="mt-0.5 text-xs text-gray-500">This route may have been removed.</p>
                          </div>
                          <button onclick="toggleSavedRoute('${escapeHtml(routeId)}')" class="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-qc-red hover:bg-red-50" aria-label="Remove unavailable saved route">Remove</button>
                        </div>
                      `;
                    }

                    return `
                      <button
                        onclick="openSavedRoute('${escapeHtml(routeId)}')"
                        class="w-full flex items-center justify-between p-3 bg-blue-50 rounded-xl text-left hover:bg-blue-100 transition"
                      >

                        <div class="min-w-0">

                          <p class="text-sm font-semibold text-qc-blue">
                            ${escapeHtml(route.name || "Saved route")}
                          </p>

                          <p class="text-xs text-gray-500 mt-0.5 truncate">
                            ${escapeHtml(route.description || "View route and stops on the map")}
                          </p>

                        </div>

                        <span class="text-blue-400 ml-3">
                          →
                        </span>

                      </button>
                    `;
                  })
                  .join("")
              : `
                <div class="text-center py-4">

                  <p class="text-xs text-gray-400">
                    No saved routes yet.
                  </p>

                  <button
                    onclick="navigateTo('routes')"
                    class="mt-2 text-xs font-medium text-qc-blue hover:underline"
                  >
                    Browse routes
                  </button>

                </div>
              `
          }

        </div>

      </div>

    </div>
  `,


  // ==================================================
  // ROUTES
  // ==================================================

  routes: () => `
    <div class="space-y-4 slide-in">

      <div>

        <h2 class="font-semibold text-gray-800">
          Bus Routes
        </h2>

        <p class="text-xs text-gray-500 mt-1">
          Routes, stops, and available buses.
        </p>

      </div>


      <div class="flex gap-2" role="group" aria-label="Filter routes">
        <button
          onclick="setRouteFilter('all')"
          class="rounded-full px-3 py-1.5 text-xs font-medium transition ${AppState.routeFilter === "all" ? "bg-qc-blue text-white" : "bg-white text-gray-500 border border-gray-200"}"
          aria-pressed="${AppState.routeFilter === "all"}"
        >All routes</button>
        <button
          onclick="setRouteFilter('favorites')"
          class="rounded-full px-3 py-1.5 text-xs font-medium transition ${AppState.routeFilter === "favorites" ? "bg-qc-blue text-white" : "bg-white text-gray-500 border border-gray-200"}"
          aria-pressed="${AppState.routeFilter === "favorites"}"
        >Favorites (${AppState.user.savedRoutes.length})</button>
      </div>


      ${
        getFilteredRoutes().length
          ? getFilteredRoutes()
              .map((route) => {

                const stops =
                  getStopsByRoute(route.id);

                const buses =
                  AppState.buses.filter(
                    (bus) =>
                      bus.routeId === route.id
                  );

                return `
                  <div
                    data-saved-route-id="${escapeHtml(route.id)}"
                    class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden scroll-mt-20 transition-shadow"
                  >

                    <div class="p-4">

                      <div class="flex items-start justify-between gap-3">

                        <div class="flex items-start gap-3 min-w-0">

                          <div
                            class="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                            style="background:${escapeHtml(route.color || "#1e40af")}"
                          >
                            ${escapeHtml(route.code || "BUS")}
                          </div>

                          <div class="min-w-0">

                            <h3 class="font-semibold text-gray-800">
                              ${escapeHtml(route.name || "Unnamed route")}
                            </h3>

                            <p class="text-xs text-gray-500 mt-0.5">
                              ${escapeHtml(route.code || "Route")}
                            </p>

                          </div>

                        </div>


                        <div class="flex items-center gap-2 flex-shrink-0">

                        <button
                          data-favorite-route-id="${escapeHtml(route.id)}"
                          onclick="toggleSavedRoute('${escapeHtml(route.id)}')"
                          class="w-9 h-9 rounded-full flex items-center justify-center transition ${
                            AppState.user.savedRoutes.includes(route.id)
                              ? "bg-yellow-50 text-yellow-500"
                              : "bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-qc-blue"
                          }"
                          title="${
                            AppState.user.savedRoutes.includes(route.id)
                              ? "Remove from saved routes"
                              : "Save route"
                          }"
                          aria-label="${AppState.user.savedRoutes.includes(route.id) ? "Remove from saved routes" : "Save route"}"
                        >

                          <svg
                            class="w-5 h-5"
                            fill="${
                              AppState.user.savedRoutes.includes(route.id)
                                ? "currentColor"
                                : "none"
                            }"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.344l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.344a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0l-4.725 2.885a.562.562 0 01-.84-.61l1.285-5.344a.563.563 0 00-.182-.557L2.821 10.384c-.38-.325-.178-.948.321-.988l5.518-.442a.563.563 0 00.475-.344L11.48 3.5z"
                            />
                          </svg>

                        </button>

                      </div>

                      </div>


                      ${
                        route.description
                          ? `
                            <p class="text-xs text-gray-500 mt-3">
                              ${escapeHtml(route.description)}
                            </p>
                          `
                          : ""
                      }


                      <div class="grid grid-cols-2 gap-2 mt-4">

                        <div class="bg-gray-50 rounded-lg p-2.5">

                          <p class="text-xs text-gray-400">
                            Stops
                          </p>

                          <p class="text-sm font-semibold text-gray-700 mt-0.5">
                            ${stops.length}
                          </p>

                        </div>


                        <div class="bg-gray-50 rounded-lg p-2.5">

                          <p class="text-xs text-gray-400">
                            Buses
                          </p>

                          <p class="text-sm font-semibold text-gray-700 mt-0.5">
                            ${buses.length}
                          </p>

                        </div>

                      </div>

                      <button
                        type="button"
                        onclick="openSavedRouteOnMap('${escapeHtml(route.id)}')"
                        class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs font-semibold text-qc-blue transition hover:bg-blue-100"
                      >
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.553 2.776A1 1 0 0022 18.882V7.118a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7" />
                        </svg>
                        View route on map
                      </button>

                    </div>


                    ${
                      stops.length
                        ? `
                          <div class="border-t border-gray-100 p-4">

                            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              Stops
                            </p>

                            <div class="space-y-2">

                              ${stops
                                .map(
                                  (stop, index) => `
                                    <div class="flex items-center gap-2">

                                      <span
                                        class="w-5 h-5 rounded-full bg-blue-50 text-qc-blue text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                                      >
                                        ${index + 1}
                                      </span>

                                      <span class="text-xs text-gray-600">
                                        ${escapeHtml(stop.name || "Unnamed stop")}
                                      </span>

                                    </div>
                                  `
                                )
                                .join("")}

                            </div>

                          </div>
                        `
                        : `
                          <div class="border-t border-gray-100 p-4">

                            <p class="text-xs text-gray-400">
                              No stops configured for this route.
                            </p>

                          </div>
                        `
                    }

                  </div>
                `;
              })
              .join("")
          : `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">

              <p class="text-sm text-gray-400">
                ${AppState.routeFilter === "favorites" ? "No favorite routes yet. Star a route to find it here." : "No routes available."}
              </p>

              <p class="text-xs text-gray-300 mt-1">
                ${AppState.routeFilter === "favorites" ? "Switch to All routes and star a route to add it here." : "Routes created by the administrator will appear here."}
              </p>

            </div>
          `
      }

    </div>
  `,


  // ==================================================
  // MAP
  // ==================================================

  map: () => `
    <div class="space-y-3 slide-in">
      <!-- Route Search Bar (Above Map) -->
      <div id="routePicker" class="relative z-30"></div>

      <div class="relative">
        <div
          id="mapContainer"
          class="w-full h-[55vh] rounded-xl shadow-sm border border-gray-100 overflow-hidden"
        ></div>
        <button
          id="centerMapButton"
          type="button"
          onclick="centerMapOnCommuter()"
          ${AppState.userLocation || AppState.nearbyLocation ? "" : "disabled"}
          class="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-qc-blue shadow-md transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Center map on my location"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          Center on me
        </button>
      </div>


      <div id="dropoffEtaCard" class="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
        ${renderCommuterDropoffEta()}
      </div>


      <div id="activeBusMapCard" class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">

        <div class="flex items-center justify-between mb-2">

          <h3 class="font-semibold text-gray-800 text-sm">
            Active Buses on Map
          </h3>

          <span class="text-xs text-gray-400">
            ${AppState.buses.filter((bus) => bus.tripActive).length} total
          </span>

        </div>


        <div
          class="flex gap-2 overflow-x-auto pb-1"
          id="busLegend"
        >

          ${
            AppState.buses.some((bus) => bus.tripActive)
              ? AppState.buses
                  .filter((bus) => bus.tripActive)
                  .map(
                    (bus) => `
                      <div class="flex-shrink-0 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">

                        <p class="text-xs font-medium text-gray-800">
                          ${escapeHtml(bus.code || bus.id)}
                        </p>

                        <p class="text-xs font-semibold text-qc-blue-accent">
                          ${escapeHtml(bus.directionLabel || bus.route || "No route")}
                        </p>

                        ${
                          bus.tripActive
                            ? `
                              <p class="text-xs text-green-600 mt-1">
                                ${bus.onboard}/${bus.capacity} onboard
                              </p>
                            `
                            : `
                              <p class="text-xs text-gray-400 mt-1">
                                ${escapeHtml(getStatusLabel(bus))}
                              </p>
                            `
                        }

                      </div>
                    `
                  )
                  .join("")
              : `
                <p class="text-xs text-gray-400">
                  No buses currently on an active trip.
                </p>
              `
          }

        </div>

      </div>

    </div>
  `,


  // ==================================================
  // NOTIFICATIONS
  // ==================================================

  notifications: () => `
    <div class="space-y-3 slide-in">

      <div class="flex items-center justify-between">

        <h2 class="font-semibold text-gray-800">
          Notifications
        </h2>

        <button
          onclick="markAllRead()"
          class="text-xs text-qc-blue font-medium"
        >
          Mark all read
        </button>

      </div>


      ${
        AppState.notifications.length
          ? AppState.notifications
              .map(
                (notif) => `
                  <div
                    class="bg-white rounded-xl shadow-sm border ${
                      notif.read
                        ? "border-gray-100"
                        : "border-blue-200 bg-blue-50/30"
                    } p-4 cursor-pointer"
                    role="button"
                    tabindex="0"
                    onclick="markNotificationAsRead('${escapeHtml(notif.id)}')"
                  >

                    <div class="flex items-start gap-3">

                      <div
                        class="w-8 h-8 ${
                          notif.read
                            ? "bg-gray-100"
                            : "bg-blue-100"
                        } rounded-full flex items-center justify-center flex-shrink-0"
                      >

                        <svg
                          class="w-4 h-4 ${
                            notif.read
                              ? "text-gray-500"
                              : "text-qc-blue"
                          }"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                          />
                        </svg>

                      </div>


                      <div class="flex-1">

                        <div class="flex items-center justify-between">

                          <h3 class="font-medium text-sm text-gray-800">
                            ${escapeHtml(notif.title)}
                          </h3>

                          ${
                            !notif.read
                              ? '<span class="w-2 h-2 bg-qc-blue rounded-full"></span>'
                              : ""
                          }

                        </div>


                        <p class="text-xs text-gray-500 mt-1">
                          ${escapeHtml(notif.message)}
                        </p>

                        <p class="text-xs text-gray-400 mt-1">
                          ${escapeHtml(notif.time)}
                        </p>

                      </div>

                    </div>

                  </div>
                `
              )
              .join("")
          : `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">

              <p class="text-sm text-gray-400">
                No notifications yet.
              </p>

            </div>
          `
      }

    </div>
  `,


  // ==================================================
  // REPORT AN ISSUE
  // ==================================================

  report: () => `
    <div class="space-y-4 slide-in">

      <div class="bg-gradient-to-r from-qc-blue to-qc-blue-accent text-white rounded-xl p-4 shadow-lg">
        <h2 class="text-lg font-bold">Report an Issue</h2>
        <p class="text-xs opacity-90 mt-1">
          Report a driver, conductor, or fellow passenger.
        </p>
      </div>


      <form id="reportForm" class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">

        <!-- Bus / Route -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            Bus or Route
          </label>
          <p class="mb-1.5 text-[11px] text-gray-400">Only buses on active trips are listed.</p>

          <select
            name="busRoute"
            required
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-blue focus:ring-2 focus:ring-blue-100 outline-none transition bg-white"
          >
            <option value="">Select a bus or route…</option>

            ${AppState.buses.filter(bus => bus.tripActive).map(bus => `
              <option value="${bus.code || bus.id} · ${bus.route}">
                ${bus.code || bus.id} · ${bus.route}
              </option>
            `).join("")}

            <option value="Unknown">Unknown / Not listed</option>
          </select>
        </div>


        <!-- Role -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            I want to report a
          </label>

          <div class="grid grid-cols-3 gap-2">
            <label class="cursor-pointer">
              <input
                type="radio"
                name="role"
                value="driver"
                required
                class="peer sr-only"
              >
              <span class="block text-center py-2.5 text-xs font-semibold rounded-xl border-2 border-gray-200 peer-checked:border-qc-blue peer-checked:bg-blue-50 peer-checked:text-qc-blue transition">
                Driver
              </span>
            </label>

            <label class="cursor-pointer">
              <input
                type="radio"
                name="role"
                value="conductor"
                required
                class="peer sr-only"
              >
              <span class="block text-center py-2.5 text-xs font-semibold rounded-xl border-2 border-gray-200 peer-checked:border-qc-blue peer-checked:bg-blue-50 peer-checked:text-qc-blue transition">
                Conductor
              </span>
            </label>

            <label class="cursor-pointer">
              <input
                type="radio"
                name="role"
                value="passenger"
                required
                class="peer sr-only"
              >
              <span class="block text-center py-2.5 text-xs font-semibold rounded-xl border-2 border-gray-200 peer-checked:border-qc-blue peer-checked:bg-blue-50 peer-checked:text-qc-blue transition">
                Passenger
              </span>
            </label>
          </div>
        </div>


        <!-- Category -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            Type of issue
          </label>

          <select
            name="category"
            required
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-blue focus:ring-2 focus:ring-blue-100 outline-none transition bg-white"
          >
            <option value="">Choose a category…</option>

            <optgroup label="Staff-related">
              <option value="rude">Rude behavior</option>
              <option value="reckless">Reckless driving</option>
              <option value="refused">Refused to stop / pick up</option>
              <option value="not-wearing-id">Not wearing ID / uniform</option>
            </optgroup>

            <optgroup label="Passenger-related">
              <option value="harassment">Harassment</option>
              <option value="unruly">Unruly behavior</option>
              <option value="smoking">Smoking / vaping inside bus</option>
              <option value="noise">Excessive noise</option>
              <option value="vandalism">Vandalism / damage</option>
              <option value="theft">Theft / pickpocketing</option>
            </optgroup>

            <option value="other">Other</option>
          </select>
        </div>


        <!-- Description -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            Description
          </label>

          <textarea
            name="description"
            rows="4"
            required
            placeholder="Describe what happened, when, and where…"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-blue focus:ring-2 focus:ring-blue-100 outline-none transition resize-none"
          ></textarea>
        </div>



        <!-- Submit -->
        <button
          type="submit"
          class="w-full py-3 bg-qc-blue hover:bg-qc-blue-accent active:scale-[0.98] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-200 transition"
        >
          Submit Report
        </button>

      </form>


      <div class="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p class="text-[11px] text-blue-800 leading-relaxed">
          <strong>Note:</strong> Reports are reviewed by QC Bus administration.
          False reports may lead to account suspension.
        </p>
      </div>

    </div>
  `,


  // ==================================================
  // SETTINGS
  // ==================================================

  settings: () => `
    <div class="space-y-4 slide-in">

      <h2 class="font-semibold text-gray-800">
        Settings
      </h2>


      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">

        <div class="p-4 flex items-center justify-between">

          <div>
            <p class="text-sm font-medium text-gray-800">
              Push Notifications
            </p>

          </div>


          <button
            onclick="toggleSetting('notifications')"
            class="relative w-12 h-6 ${
              AppState.settings.notifications
                ? "bg-qc-blue"
                : "bg-gray-300"
            } rounded-full transition"
          >

            <span
              class="absolute top-0.5 ${
                AppState.settings.notifications
                  ? "left-6"
                  : "left-0.5"
              } w-5 h-5 bg-white rounded-full shadow transition-all"
            ></span>

          </button>

        </div>


        <div class="p-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-800">Notification sound</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${AppState.settings.notificationSound !== false}"
            aria-label="Notification sound"
            onclick="toggleSetting('notificationSound')"
            class="relative w-12 h-6 ${AppState.settings.notificationSound !== false ? "bg-qc-blue" : "bg-gray-300"} rounded-full transition"
          >
            <span class="absolute top-0.5 ${AppState.settings.notificationSound !== false ? "left-6" : "left-0.5"} w-5 h-5 bg-white rounded-full shadow transition-all"></span>
          </button>
        </div>

        <div class="p-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-800">Vibration</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${AppState.settings.notificationVibration !== false}"
            aria-label="Notification vibration"
            onclick="toggleSetting('notificationVibration')"
            class="relative w-12 h-6 ${AppState.settings.notificationVibration !== false ? "bg-qc-blue" : "bg-gray-300"} rounded-full transition"
          >
            <span class="absolute top-0.5 ${AppState.settings.notificationVibration !== false ? "left-6" : "left-0.5"} w-5 h-5 bg-white rounded-full shadow transition-all"></span>
          </button>
        </div>


        <button
          onclick="sendTestNotification()"
          class="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition"
        >
          <span>
            <span class="block text-sm font-medium text-gray-800">Send Test Notification</span>
          </span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>


        <div class="p-4 flex items-center justify-between">

          <div>
            <p class="text-sm font-medium text-gray-800">
              Dark Mode
            </p>

          </div>


          <button
            onclick="toggleSetting('darkMode')"
            class="relative w-12 h-6 ${
              AppState.settings.darkMode
                ? "bg-qc-blue"
                : "bg-gray-300"
            } rounded-full transition"
          >

            <span
              class="absolute top-0.5 ${
                AppState.settings.darkMode
                  ? "left-6"
                  : "left-0.5"
              } w-5 h-5 bg-white rounded-full shadow transition-all"
            ></span>

          </button>

        </div>


      </div>


      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">

        <button
          onclick="openAboutModal()"
          class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
        >

          <span class="text-sm text-gray-700">
            About
          </span>

          <svg
            class="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>

        </button>

        <button
          onclick="openChangePassword()"
          class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
        >
          <span class="text-sm text-gray-700">Change Password</span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

      </div>

    </div>
  `,


  // ==================================================
  // ACCOUNT
  // ==================================================

  account: () => `
    <div class="space-y-4 slide-in">

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">

        <div class="w-20 h-20 bg-gradient-to-br from-qc-blue to-blue-500 rounded-full mx-auto flex items-center justify-center overflow-hidden text-white text-2xl font-bold shadow-lg">
          ${AppState.user.photoURL
            ? `<img src="${escapeHtml(AppState.user.photoURL)}" alt="Profile photo" class="w-full h-full object-cover" />`
            : escapeHtml(getInitials(AppState.user.name))}
        </div>


        <h2 class="font-semibold text-gray-800 mt-3">
          ${escapeHtml(AppState.user.name)}
        </h2>


        <p class="text-sm text-gray-500">
          ${escapeHtml(AppState.user.email)}
        </p>


        ${
          AppState.user.phone
            ? `
              <p class="text-xs text-gray-400 mt-1">
                ${escapeHtml(AppState.user.phone)}
              </p>
            `
            : ""
        }


        <button
          onclick="openEditProfile()"
          class="mt-3 px-4 py-1.5 bg-blue-50 text-qc-blue rounded-full text-xs font-medium hover:bg-blue-100 transition"
        >
          Edit Profile
        </button>

      </div>


      <div class="grid grid-cols-2 gap-3">

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">

          <p class="text-lg font-bold text-qc-blue">
            ${AppState.routes.length}
          </p>

          <p class="text-xs text-gray-500">
            Routes
          </p>

        </div>


        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">

          <p class="text-lg font-bold text-qc-blue">
            ${AppState.user.savedRoutes.length}
          </p>

          <p class="text-xs text-gray-500">
            Favorites
          </p>

        </div>

      </div>


      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-4" aria-labelledby="myReportsHeading">
        <div class="flex items-center justify-between mb-3">
          <h3 id="myReportsHeading" class="font-semibold text-gray-800">My Reports</h3>
          <div class="flex items-center gap-2">
            <span id="myReportsCount" class="text-xs text-gray-400">Latest 10</span>
            <button id="clearMyReportsButton" type="button" onclick="clearMyReports()" class="hidden rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50" aria-label="Clear all your reports">Clear all</button>
          </div>
        </div>
        <div id="myReportsList" class="space-y-3" aria-live="polite">
          <p class="py-3 text-center text-xs text-gray-400">Loading your reports…</p>
        </div>
      </section>


      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">

        <button
          onclick="navigateTo('routes')"
          class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left"
        >
          <span class="text-sm text-gray-700">
            Browse Routes
          </span>
        </button>


        <button
          onclick="openAboutModal()"
          class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left"
        >
          <span class="text-sm text-gray-700">
            Help & Support
          </span>
        </button>


        <button
          onclick="logout()"
          class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left"
        >
          <span class="text-sm text-red-600">
            Logout
          </span>
        </button>

      </div>

    </div>
  `,
};

function formatMyReportDate(value) {
  const date = value?.toDate
    ? value.toDate()
    : value instanceof Date
      ? value
      : value
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "Date unavailable";
}

async function loadMyReports() {
  const list = document.getElementById("myReportsList");
  const count = document.getElementById("myReportsCount");
  if (!list || !count) return;

  try {
    const reportsQuery = query(
      collection(db, "reports"),
      where("reporterId", "==", AppState.user.uid)
    );
    const snapshot = await getDocs(reportsQuery);
    if (!document.getElementById("myReportsList")) return;

    const reports = snapshot.docs.map((reportDoc) => ({
      id: reportDoc.id,
      ...reportDoc.data(),
    }));
    const getCreatedAtMillis = (value) => value?.toMillis?.()
      ?? (value instanceof Date ? value.getTime() : Date.parse(value || ""));
    reports.sort((a, b) => getCreatedAtMillis(b.createdAt) - getCreatedAtMillis(a.createdAt));
    const recentReports = reports.slice(0, 10);
    const clearButton = document.getElementById("clearMyReportsButton");
    if (clearButton) clearButton.classList.toggle("hidden", reports.length === 0);
    count.textContent = reports.length > 10
      ? `Latest 10 of ${reports.length}`
      : `${reports.length} ${reports.length === 1 ? "report" : "reports"}`;

    if (!recentReports.length) {
      list.innerHTML = '<p class="py-4 text-center text-xs text-gray-400">You have not submitted any reports yet.</p>';
      return;
    }

    const statusStyles = {
      pending: "bg-amber-50 text-amber-700",
      reviewing: "bg-blue-50 text-blue-700",
      resolved: "bg-green-50 text-green-700",
      dismissed: "bg-gray-100 text-gray-600",
    };
    list.innerHTML = recentReports.map((report) => {
      const status = String(report.status || "pending").toLowerCase();
      const statusClass = statusStyles[status] || "bg-gray-100 text-gray-600";
      return `
        <article class="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-gray-800">${escapeHtml(report.category || "Issue report")}</p>
              <p class="mt-0.5 truncate text-xs text-gray-500">${escapeHtml(report.busRoute || "Unknown route")} · ${escapeHtml(formatMyReportDate(report.createdAt))}</p>
            </div>
            <span class="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${statusClass}">${escapeHtml(status)}</span>
          </div>
          <p class="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">${escapeHtml(report.description || "No description")}</p>
        </article>
      `;
    }).join("");
  } catch (error) {
    console.error("Failed to load commuter reports:", error);
    const currentList = document.getElementById("myReportsList");
    if (currentList) {
      currentList.innerHTML = `
        <div class="py-3 text-center">
          <p class="text-xs text-gray-500">Unable to load your reports.</p>
          <button onclick="loadMyReports()" class="mt-2 text-xs font-semibold text-qc-blue hover:underline">Try again</button>
        </div>
      `;
    }
  }
}

async function clearMyReports() {
  if (!AppState.user?.uid) return;
  if (!confirm("Clear all your reports? This permanently deletes every report you submitted.")) return;

  const button = document.getElementById("clearMyReportsButton");
  if (button) {
    button.disabled = true;
    button.textContent = "Clearing…";
  }

  try {
    const reportsQuery = query(
      collection(db, "reports"),
      where("reporterId", "==", AppState.user.uid)
    );
    const snapshot = await getDocs(reportsQuery);

    for (let offset = 0; offset < snapshot.docs.length; offset += 450) {
      const batch = writeBatch(db);
      snapshot.docs.slice(offset, offset + 450).forEach((reportDoc) => {
        batch.delete(reportDoc.ref);
      });
      await batch.commit();
    }

    showSavedRouteToast("Your reports have been cleared");
    await loadMyReports();
  } catch (error) {
    console.error("Failed to clear commuter reports:", error);
    showSavedRouteToast("Unable to clear your reports", true);
  } finally {
    const currentButton = document.getElementById("clearMyReportsButton");
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = "Clear all";
    }
  }
}

window.clearMyReports = clearMyReports;


// ==================================================
// NAVIGATION
// ==================================================

function navigateTo(page, updateHash = true, options = {}) {

  if (!Pages[page]) {
    console.warn("Unknown page:", page);
    return;
  }

  if (page === "map" && AppState.currentPage === "map") {
    if (typeof window.initMap === "function") {
      window.initMap();
    }
    return;
  }

  if (
    AppState.currentPage === "map" &&
    page !== "map"
  ) {
    if (
      typeof window.destroyMap ===
      "function"
    ) {
      window.destroyMap();
    }
  }


  AppState.currentPage = page;
  document.body.classList.toggle("commuter-map-page", page === "map");

  const content =
    document.getElementById("content");

  if (!content) {
    console.error(
      "Content element not found."
    );

    return;
  }


  content.innerHTML =
    Pages[page]();

  if (page === "account") {
    loadMyReports();
  }


  // ==================================================
  // UPDATE NAV BUTTONS
  // ==================================================

  document
    .querySelectorAll(".nav-btn")
    .forEach((button) => {

      const isActive =
        button.dataset.page === page;

      button.classList.toggle(
        "text-qc-blue",
        isActive
      );

      button.classList.toggle(
        "text-gray-400",
        !isActive
      );
    });


  // ==================================================
  // PAGE TITLE
  // ==================================================

  const titles = {
    home: "QCommute",
    routes: "Bus Routes",
    map: "Live Map",
    notifications: "Notifications",
    report: "Report",
    settings: "Settings",
    account: "My Account",
  };


  const pageTitle =
    document.getElementById(
      "pageTitle"
    );

  if (pageTitle) {
    pageTitle.textContent =
      titles[page] ||
      "QC Bus Tracker";
  }



  // ==================================================
  // MAP
  // ==================================================

  if (page === "map") {

    setTimeout(() => {

      if (
        typeof window.initMap ===
        "function"
      ) {
        window.initMap();
      }

    }, 100);
  }

  if (page === "home" && nearbyLocationWatchId === null && !AppState.nearbyLocationError) {
    startNearbyBusDetection();
  }


  // ==================================================
  // SCROLL
  // ==================================================

  if (options.scrollToTop !== false) {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }


  // ==================================================
  // HASH
  // ==================================================

  if (updateHash) {
    const nextHash = `#${page}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState({ page }, "", nextHash);
    }
  }
}


// ==================================================
// SETTINGS
// ==================================================

async function toggleSetting(key) {

  if (!(key in AppState.settings)) {
    return;
  }

  if (key === "notifications") {
    const browserPermission = "Notification" in window
      ? Notification.permission
      : "unsupported";
    const needsPermission =
      !AppState.settings.notifications ||
      browserPermission !== "granted";

    if (needsPermission) {
      const granted = await window.requestNotificationPermission?.();
      if (!granted) {
        AppState.settings.notifications = false;
        localStorage.setItem("qcSettings", JSON.stringify(AppState.settings));
        showSavedRouteToast(
          browserPermission === "denied"
            ? "Allow notifications in your browser settings"
            : "Notification permission was not granted",
          true
        );
        navigateTo("settings");
        return;
      }

      AppState.settings.notifications = true;

      const pushSetup = await window.registerPushNotifications?.();
      if (!pushSetup?.ok) {
        AppState.settings.notifications = false;
        localStorage.setItem("qcSettings", JSON.stringify(AppState.settings));
        const message = pushSetup?.reason === "vapid"
          ? "Add the Firebase Web Push key before enabling PWA alerts"
          : "Push registration failed. Please try again.";
        showSavedRouteToast(message, true);
        navigateTo("settings");
        return;
      }
    } else {
      AppState.settings.notifications = false;
      await window.unregisterPushNotifications?.();
    }
  } else {
    AppState.settings[key] = !AppState.settings[key];
  }


  if (key === "darkMode") {

    document.body.classList.toggle(
      "dark-mode",
      AppState.settings.darkMode
    );
  }


  localStorage.setItem(
    "qcSettings",
    JSON.stringify(
      AppState.settings
    )
  );

  if (
    key === "notifications" ||
    key === "notificationSound" ||
    key === "notificationVibration"
  ) {
    await window.syncNotificationPreferences?.();
  }


  navigateTo("settings");
}

async function sendTestNotification() {
  const notificationId = await window.pushAppNotification?.(
    "QCommute Test Alert",
    "This is a test notification from QCommute.",
    { type: "test" }
  );

  if (!notificationId) {
    showSavedRouteToast("Could not add the test notification", true);
    return;
  }

  if ("Notification" in window) {
    let permission = Notification.permission;
    if (permission === "default") {
      const granted = await window.requestNotificationPermission?.();
      permission = granted ? "granted" : Notification.permission;
    }

    if (permission === "granted") {
      try {
        await window.showSystemNotification?.("QCommute Test Alert", {
          body: "Browser notifications are working on this device.",
          tag: `qcommute-test-${notificationId}`,
        });
      } catch (error) {
        console.warn("Could not display the browser test notification:", error);
      }
    }
  }

  showSavedRouteToast("Test notification added to your inbox");
}


// ==================================================
// NOTIFICATIONS
// ==================================================

function markAllRead() {
  if (window.markAllNotificationsAsRead) {
    window.markAllNotificationsAsRead();
    return;
  }

  AppState.notifications.forEach((notification) => {
    notification.read = true;
  });
  updateNotifBadge();
  navigateTo("notifications");
}


function updateNotifBadge() {

  const unread =
    AppState.notifications.filter(
      (notification) =>
        !notification.read
    ).length;

  const badge =
    document.getElementById(
      "notifBadge"
    );

  if (badge) {

    badge.classList.toggle(
      "hidden",
      unread === 0
    );
  }
}

// ==================================================
// REPORT FORM SUBMIT
// ==================================================

async function handleReportSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const submitButton =
    form.querySelector('button[type="submit"]');

  const data = new FormData(form);

  const report = {
    busRoute: data.get("busRoute"),
    role: data.get("role"),
    category: data.get("category"),
    description: data.get("description")?.trim(),
  };

  // ------------------------------------------
  // VALIDATION
  // ------------------------------------------

  if (
    !report.busRoute ||
    !report.role ||
    !report.category ||
    !report.description
  ) {
    showReportToast(
      "Please complete all required fields.",
      "error"
    );

    return;
  }

  // ------------------------------------------
  // LOADING STATE
  // ------------------------------------------

  const originalText =
    submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  submitButton.classList.add(
    "opacity-70",
    "cursor-not-allowed"
  );

  // ------------------------------------------
  // get user profile
  // ------------------------------------------

  const currentUser = auth.currentUser;

  if (!currentUser) {
    showReportToast(
      "You must be logged in to submit a report.",
      "error"
    );

    return;
  }

  const userProfile =
    await getUserProfile(currentUser.uid);

  if (!userProfile) {
    showReportToast(
      "Unable to load your user profile.",
      "error"
    );

    return;
  }

  report.reporterId = currentUser.uid;
  report.reporterName =
    userProfile.name ||
    currentUser.email ||
    "Unknown";



  try {

    // ------------------------------------------
    // SAVE REPORT
    // ------------------------------------------

    const createdReport =
      await createReport(report);

    console.log(
      "Report created:",
      createdReport
    );

    // ------------------------------------------
    // SUCCESS STATE
    // ------------------------------------------

    form.reset();

    submitButton.textContent =
      "Report Submitted ✓";

    submitButton.classList.remove(
      "bg-qc-blue",
      "hover:bg-qc-blue-accent",
      "opacity-70",
      "cursor-not-allowed"
    );

    submitButton.classList.add(
      "bg-green-500"
    );

    showReportToast(
      "Your report has been submitted successfully.",
      "success"
    );

    // ------------------------------------------
    // RESTORE BUTTON
    // ------------------------------------------

    setTimeout(() => {

      submitButton.disabled = false;

      submitButton.textContent =
        originalText;

      submitButton.classList.remove(
        "bg-green-500"
      );

      submitButton.classList.add(
        "bg-qc-blue",
        "hover:bg-qc-blue-accent"
      );

    }, 1800);

  } catch (error) {

    console.error(
      "Failed to submit report:",
      error
    );

    submitButton.disabled = false;

    submitButton.textContent =
      originalText;

    submitButton.classList.remove(
      "opacity-70",
      "cursor-not-allowed"
    );

    showReportToast(
      "Failed to submit report. Please try again.",
      "error"
    );
  }
}


function showReportToast(message, type) {

  const bg =
    type === "success"
      ? "bg-green-600"
      : "bg-qc-red";

  const toast =
    document.createElement("div");

  toast.className =
    `fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg text-white ${bg} z-[110] transition-all duration-300`;

  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {

    toast.style.opacity = "0";

    setTimeout(() => toast.remove(), 300);

  }, 2400);

}

// ==================================================
// FORM SUBMIT DELEGATION
// ==================================================

document.addEventListener("submit", event => {
  if (
    event.target &&
    event.target.id === "reportForm"
  ) {
    handleReportSubmit(event);
  }
});


document.addEventListener("submit", (event) => {
  if (
    event.target &&
    event.target.id === "editProfileForm"
  ) {
    handleEditProfileSubmit(event);
  }
});

document.addEventListener("submit", (event) => {
  if (event.target?.id === "changePasswordForm") {
    handleChangePasswordSubmit(event);
  }
});

// ==================================================
// LOGOUT
// ==================================================

async function logout() {

  if (
    !confirm(
      "Are you sure you want to log out?"
    )
  ) {
    return;
  }


  try {

    stopNearbyBusDetection();

    await window.unregisterPushNotifications?.();

    await signOutUser();

    window.location.replace(
      "auth.html"
    );

  } catch (error) {

    console.error(
      "Logout failed:",
      error
    );

    alert(
      "Unable to log out. Please try again."
    );
  }
}


// ==================================================
// ROUTE LISTENER
// ==================================================

function listenToRoutes() {

  if (unsubscribeRoutes) {
    unsubscribeRoutes();
    unsubscribeRoutes = null;
  }


  const routesRef =
    collection(db, "routes");


  unsubscribeRoutes =
    onSnapshot(
      routesRef,

      (snapshot) => {

        AppState.routes =
          snapshot.docs.map(
            (routeDoc) => ({
              id: routeDoc.id,
              ...routeDoc.data(),
            })
          );


        console.log(
          "Commuter routes:",
          AppState.routes
        );


        rebuildBuses();
        refreshCurrentPage();
      },

      (error) => {

        console.error(
          "Route listener failed:",
          error
        );
      }
    );
}


// ==================================================
// STOP LISTENER
// ==================================================

function listenToStops() {

  if (unsubscribeStops) {
    unsubscribeStops();
    unsubscribeStops = null;
  }


  const stopsRef =
    collection(db, "stops");


  unsubscribeStops =
    onSnapshot(
      stopsRef,

      (snapshot) => {

        AppState.stops =
          snapshot.docs.map(
            (stopDoc) => ({
              id: stopDoc.id,
              ...stopDoc.data(),
            })
          );


        console.log(
          "Commuter stops:",
          AppState.stops
        );


        refreshCurrentPage();
      },

      (error) => {

        console.error(
          "Stop listener failed:",
          error
        );
      }
    );
}


// ==================================================
// BUS LISTENER
// ==================================================

function listenToBuses() {

  if (unsubscribeBuses) {
    unsubscribeBuses();
    unsubscribeBuses = null;
  }


  const busesRef =
    collection(db, "buses");


  unsubscribeBuses =
    onSnapshot(
      busesRef,

      (snapshot) => {
        const previousHomeSignature = getHomeBusViewSignature();

        rawBuses =
          snapshot.docs.map(
            (busDoc) => {

              const data =
                busDoc.data();

              const lat =
                Number(data.lat);

              const lng =
                Number(data.lng);

              return {

                id: busDoc.id,

                code:
                  data.code ||
                  busDoc.id,

                routeId:
                  data.routeId ||
                  null,

                lat:
                  Number.isFinite(lat)
                    ? lat
                    : null,

                lng:
                  Number.isFinite(lng)
                    ? lng
                    : null,

                speedKmh:
                  getNumber(data.speedKmh, null),

                locationUpdatedAt:
                  data.locationUpdatedAt || null,

                status:
                  data.status ||
                  "idle",

                capacity:
                  getNumber(
                    data.capacity,
                    0
                  ),

                driverId:
                  data.driverId ||
                  null,

                conductorId:
                  data.conductorId ||
                  null,
              };
            }
          );


        rebuildBuses();


        console.log(
          "Commuter buses:",
          AppState.buses
        );


        refreshCurrentPage({
          refreshHome: previousHomeSignature !== getHomeBusViewSignature(),
          refreshRoutes: false,
        });
      },

      (error) => {

        console.error(
          "Bus listener failed:",
          error
        );
      }
    );
}


// ==================================================
// ACTIVE TRIP LISTENER
// ==================================================

function listenToActiveTrips() {

  if (unsubscribeTrips) {
    unsubscribeTrips();
    unsubscribeTrips = null;
  }


  const tripsRef =
    collection(db, "trips");


  const activeTripsQuery =
    query(
      tripsRef,
      where(
        "status",
        "==",
        "active"
      )
    );


  unsubscribeTrips =
    onSnapshot(
      activeTripsQuery,

      (snapshot) => {
        const previousHomeSignature = getHomeBusViewSignature();

        AppState.activeTrips =
          snapshot.docs.map(
            (tripDoc) => ({
              id: tripDoc.id,
              ...tripDoc.data(),
            })
          );

        if (
          AppState.dropoff.tripId &&
          !AppState.activeTrips.some(
            (trip) => trip.id === AppState.dropoff.tripId
          )
        ) {
          if (unsubscribeMyDropoff) {
            unsubscribeMyDropoff();
            unsubscribeMyDropoff = null;
          }
          AppState.dropoff = {
            tripId: null,
            stopId: null,
            stopName: "",
          };
        }


        rebuildBuses();


        console.log(
          "Active commuter trips:",
          AppState.activeTrips
        );


        refreshCurrentPage({
          refreshHome: previousHomeSignature !== getHomeBusViewSignature(),
          refreshRoutes: false,
        });
      },

      (error) => {

        console.error(
          "Active trip listener failed:",
          error
        );
      }
    );
}


// ==================================================
// CLEANUP
// ==================================================

function stopAllListeners() {

  if (unsubscribeRoutes) {
    unsubscribeRoutes();
    unsubscribeRoutes = null;
  }

  if (unsubscribeStops) {
    unsubscribeStops();
    unsubscribeStops = null;
  }

  if (unsubscribeBuses) {
    unsubscribeBuses();
    unsubscribeBuses = null;
  }

  if (unsubscribeTrips) {
    unsubscribeTrips();
    unsubscribeTrips = null;
  }

  if (unsubscribeMyDropoff) {
    unsubscribeMyDropoff();
    unsubscribeMyDropoff = null;
  }
}


// ==================================================
// INIT
// ==================================================

async function initApp() {

  showLoading();

  try {

    // ==============================================
    // LOAD SETTINGS
    // ==============================================

    const saved =
      localStorage.getItem(
        "qcSettings"
      );


    if (saved) {

      try {

        AppState.settings = {
          ...AppState.settings,
          ...JSON.parse(saved),
        };

        document.body.classList.toggle(
          "dark-mode",
          AppState.settings.darkMode
        );

      } catch (error) {

        console.error(
          "Failed to load settings:",
          error
        );
      }
    }

    window.syncNotificationPreferences?.();


    // ==============================================
    // START LIVE DATA
    // ==============================================

    listenToRoutes();
    listenToStops();
    listenToBuses();
    listenToActiveTrips();


    // ==============================================
    // LOAD NOTIFICATIONS
    // ==============================================

    if (
      typeof window.loadNotifications ===
      "function"
    ) {

      await window.loadNotifications();
    }

    if (
      AppState.settings.notifications &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const pushSetup = await window.registerPushNotifications?.();
      if (!pushSetup?.ok) {
        console.warn("PWA push registration is not ready:", pushSetup?.reason);
        AppState.settings.notifications = false;
        localStorage.setItem("qcSettings", JSON.stringify(AppState.settings));
      }
    }


    // ==============================================
    // NAVIGATION EVENT DELEGATION
    // ==============================================

    if (
      !window.__commuterNavigationBound
    ) {

      document.addEventListener(
        "click",

        (event) => {

          const navButton =
            event.target.closest(
              ".nav-btn"
            );


          if (!navButton) {
            return;
          }


          event.preventDefault();


          const page =
            navButton.dataset.page;


          if (page) {
            navigateTo(page);
          }

        }
      );


      window.__commuterNavigationBound =
        true;
    }

    if (!window.__commuterHistoryBound) {
      window.addEventListener("popstate", () => {
        const page = window.location.hash.replace("#", "");
        const validPages = [
          "home",
          "routes",
          "map",
          "notifications",
          "report",
          "settings",
          "account",
        ];

        navigateTo(
          validPages.includes(page) ? page : "home",
          false,
          { scrollToTop: false }
        );
      });

      window.__commuterHistoryBound = true;
    }


    // ==============================================
    // HEADER NOTIFICATION
    // ==============================================

    const notifBtn =
      document.getElementById(
        "notifBtn"
      );


    if (
      notifBtn &&
      !notifBtn.dataset.bound
    ) {

      notifBtn.addEventListener(
        "click",
        () =>
          navigateTo(
            "notifications"
          )
      );


      notifBtn.dataset.bound =
        "true";
    }


    // ==============================================
    // INITIAL PAGE
    // ==============================================

    const hash =
      window.location.hash.replace(
        "#",
        ""
      );


    const validPages = [
      "home",
      "routes",
      "map",
      "notifications",
      "report",
      "settings",
      "account",
    ];


    navigateTo(
      validPages.includes(hash)
        ? hash
        : "home"
    );


    // ==============================================
    // NOTIFICATION BADGE
    // ==============================================

    updateNotifBadge();


    // ==============================================
    // SERVICE WORKER
    // ==============================================

    if (
      "serviceWorker" in navigator
    ) {

      navigator.serviceWorker
        .register("./sw.js")
        .then(
          (registration) => {

            console.log(
              "SW registered:",
              registration.scope
            );

          }
        )
        .catch(
          (error) => {

            console.log(
              "SW failed:",
              error
            );

          }
        );
    }

  } catch (error) {

    console.error(
      "Commuter app initialization failed:",
      error
    );

  } finally {

    hideLoading();
  }
}


// ==================================================
// START APP
// ==================================================

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initApp,
    { once: true }
  );

} else {

  initApp();
}


// ==================================================
// GLOBAL EXPOSURE
// ==================================================

window.toggleSavedRoute = toggleSavedRoute;
window.setRouteFilter = setRouteFilter;
window.openChangePassword = openChangePassword;
window.closeChangePassword = closeChangePassword;

window.openSavedRoute = openSavedRoute;

window.navigateTo = navigateTo;

window.toggleSetting = toggleSetting;
window.sendTestNotification = sendTestNotification;
window.startNearbyBusDetection = startNearbyBusDetection;
window.stopNearbyBusDetection = stopNearbyBusDetection;

window.markAllRead = markAllRead;

window.logout = logout;

window.listenToBuses = listenToBuses;

window.listenToActiveTrips = listenToActiveTrips;

window.stopAllListeners = stopAllListeners;

window.selectDropoffTrip = selectDropoffTrip;

window.confirmDropoffStop = confirmDropoffStop;
window.isCommuterNearTripBus = isCommuterNearTripBus;
window.isDropoffStopAheadForTrip = isDropoffStopAheadForTrip;
window.getNextStopEtaForBus = getNextStopEtaForBus;
window.loadMyReports = loadMyReports;

window.openEditProfile = openEditProfile;
window.previewEditProfilePhoto = previewEditProfilePhoto;
window.sanitizeEditProfilePhone = sanitizeEditProfilePhone;

window.refreshCurrentPage = refreshCurrentPage;

window.closeEditProfile = closeEditProfile;

window.openAboutModal = openAboutModal;

window.closeAboutModal = closeAboutModal;

window.AppState = AppState;
