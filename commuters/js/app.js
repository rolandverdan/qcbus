import {
  requireRole,
} from "../../shared/js/auth.js";

import { auth } from "../../shared/js/firebase.js";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../../shared/js/firebase.js";

import {
  getUserProfile,
} from "../../shared/js/repositories/users.repo.js";

import {
  signOutUser,
} from "../../shared/js/repositories/auth.repo.js";

import "../../shared/js/loading.js";

import {
  createReport,
} from "../../shared/js/repositories/reports.repo.js";

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

  user: {
    uid: user.uid,
    name: profile?.name || user.displayName || "Commuter",
    email: profile?.email || user.email || "",
    phone: profile?.phone || user.phoneNumber || "",
    savedRoutes: Array.isArray(profile?.savedRoutes)
      ? profile.savedRoutes
      : [],
  },

  notifications: [],

  settings: {
    notifications: true,
    darkMode: false,
    language: "en",
    autoRefresh: true,
    refreshInterval: 30,
  },

  routes: [],
  stops: [],
  buses: [],
  activeTrips: [],
};

window.AppState = AppState;


// ==================================================
// FIRESTORE LISTENERS
// ==================================================

let unsubscribeRoutes = null;
let unsubscribeStops = null;
let unsubscribeBuses = null;
let unsubscribeTrips = null;

let rawBuses = [];


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
        trip.busId === busId ||
        trip.busCode === busCode
    ) || null
  );
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
        activeTrip?.routeName
          ? activeTrip.routeName
          : getRouteLabel(route),

      routeCode:
        route?.code ||
        "",

      routeName:
        route?.name ||
        activeTrip?.routeName ||
        "",

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

function refreshCurrentPage() {
  if (
    !document.getElementById("content")
  ) {
    return;
  }

  if (
    AppState.currentPage === "home" ||
    AppState.currentPage === "routes"
  ) {
    navigateTo(
      AppState.currentPage,
      false
    );

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
  }
}




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

      <div class="bg-gradient-to-r from-qc-blue to-blue-700 text-white rounded-xl p-4 shadow-lg">

        <p class="text-sm opacity-90">
          Good day,
        </p>

        <h2 class="text-xl font-bold">
          ${escapeHtml(AppState.user.name)}
        </h2>

        <p class="text-xs opacity-75 mt-1">
          Track your bus in real-time
        </p>

      </div>


      <!-- Quick Actions -->

      <div class="grid grid-cols-2 gap-3">

        <button
          onclick="navigateTo('map')"
          class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition"
        >

          <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">

            <svg
              class="w-5 h-5 text-qc-blue"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />

              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 11a3 3 0 11-6 0"
              />
            </svg>

          </div>

          <span class="text-sm font-medium text-gray-700">
            Live Map
          </span>

        </button>


        <button
          onclick="navigateTo('routes')"
          class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition"
        >

          <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">

            <svg
              class="w-5 h-5 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>

          </div>

          <span class="text-sm font-medium text-gray-700">
            Routes
          </span>

        </button>

      </div>


      <!-- ============================================== -->
      <!-- REPORT AN ISSUE — quick action                 -->
      <!-- ============================================== -->

      <button
        onclick="navigateTo('report')"
        class="w-full bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 hover:shadow-md transition text-left"
      >

        <div class="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">

          <svg
            class="w-5 h-5 text-qc-red"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
            />
          </svg>

        </div>

        <div class="flex-1 min-w-0">

          <p class="font-semibold text-sm text-gray-800">
            Report an Issue
          </p>

          <p class="text-xs text-gray-500">
            Report a driver, conductor, or passenger
          </p>

        </div>

        <svg
          class="w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 5l7 7-7 7"
          />
        </svg>

      </button>

      <!-- Nearby Buses -->

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">

        <div class="flex items-center justify-between mb-3">

          <h3 class="font-semibold text-gray-800">
            Nearby Buses
          </h3>

          <span class="text-xs text-qc-blue font-medium flex items-center gap-1">
            <span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            Live
          </span>

        </div>


        <div class="space-y-3">

          ${
            AppState.buses.length
              ? AppState.buses
                  .map((bus) => `
                    <div
                      class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >

                      <div class="flex items-center gap-3 min-w-0">

                        <div
                          class="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                          style="background:${escapeHtml(bus.routeColor)}"
                        >
                          ${escapeHtml(bus.code || "BUS")}
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

                        <p class="text-xs font-medium ${getStatusClass(bus)}">
                          ${escapeHtml(getStatusLabel(bus))}
                        </p>

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
                    No buses available right now.
                  </p>

                  <p class="text-xs text-gray-300 mt-1">
                    Live bus data will appear here.
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

        <h3 class="font-semibold text-gray-800 mb-3">
          Your Saved Routes
        </h3>

        <div class="flex flex-wrap gap-2">

          ${
            AppState.user.savedRoutes.length
              ? AppState.user.savedRoutes
                  .map(
                    (route) => `
                      <span class="px-3 py-1.5 bg-blue-50 text-qc-blue rounded-full text-xs font-medium">
                        ${escapeHtml(route)}
                      </span>
                    `
                  )
                  .join("")
              : `
                <span class="text-xs text-gray-400">
                  No saved routes yet.
                </span>
              `
          }

          <button
            onclick="navigateTo('routes')"
            class="px-3 py-1.5 border border-dashed border-gray-300 text-gray-400 rounded-full text-xs font-medium hover:border-qc-blue hover:text-qc-blue transition"
          >
            + Browse Routes
          </button>

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


      ${
        AppState.routes.length
          ? AppState.routes
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
                    class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
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
                No routes available.
              </p>

              <p class="text-xs text-gray-300 mt-1">
                Routes created by the administrator will appear here.
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

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3">

        <div class="flex items-center gap-2">

          <svg
            class="w-5 h-5 text-qc-blue"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
            id="mapSearchInput"
            type="text"
            placeholder="Search route or destination..."
            class="flex-1 text-sm outline-none bg-transparent"
          />

        </div>

      </div>


      <div
        id="mapContainer"
        class="w-full h-[55vh] rounded-xl shadow-sm border border-gray-100 overflow-hidden"
      ></div>


      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">

        <div class="flex items-center justify-between mb-2">

          <h3 class="font-semibold text-gray-800 text-sm">
            Active Buses on Map
          </h3>

          <span class="text-xs text-gray-400">
            ${AppState.buses.length} total
          </span>

        </div>


        <div
          class="flex gap-2 overflow-x-auto pb-1"
          id="busLegend"
        >

          ${
            AppState.buses.length
              ? AppState.buses
                  .map(
                    (bus) => `
                      <div class="flex-shrink-0 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">

                        <p class="text-xs font-medium text-gray-800">
                          ${escapeHtml(bus.code || bus.id)}
                        </p>

                        <p class="text-xs text-gray-500">
                          ${escapeHtml(bus.route || "No route")}
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
                  No buses available.
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
                    } p-4"
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

          <select
            name="busRoute"
            required
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-blue focus:ring-2 focus:ring-blue-100 outline-none transition bg-white"
          >
            <option value="">Select a bus or route…</option>

            ${AppState.buses.map(bus => `
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

            <p class="text-xs text-gray-500">
              Get bus arrival alerts
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
            <p class="text-sm font-medium text-gray-800">
              Dark Mode
            </p>

            <p class="text-xs text-gray-500">
              Easy on the eyes at night
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


        <div class="p-4 flex items-center justify-between">

          <div>
            <p class="text-sm font-medium text-gray-800">
              Auto Refresh
            </p>

            <p class="text-xs text-gray-500">
              Update bus locations automatically
            </p>
          </div>


          <button
            onclick="toggleSetting('autoRefresh')"
            class="relative w-12 h-6 ${
              AppState.settings.autoRefresh
                ? "bg-qc-blue"
                : "bg-gray-300"
            } rounded-full transition"
          >

            <span
              class="absolute top-0.5 ${
                AppState.settings.autoRefresh
                  ? "left-6"
                  : "left-0.5"
              } w-5 h-5 bg-white rounded-full shadow transition-all"
            ></span>

          </button>

        </div>

      </div>


      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">

        <button
          class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
        >

          <span class="text-sm text-gray-700">
            Language
          </span>

          <div class="flex items-center gap-2">

            <span class="text-sm text-gray-500">
              English
            </span>

            <svg
              class="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>

          </div>

        </button>


        <button
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

      </div>

    </div>
  `,


  // ==================================================
  // ACCOUNT
  // ==================================================

  account: () => `
    <div class="space-y-4 slide-in">

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">

        <div class="w-20 h-20 bg-gradient-to-br from-qc-blue to-blue-500 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg">

          ${escapeHtml(
            getInitials(
              AppState.user.name
            )
          )}

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
          class="mt-3 px-4 py-1.5 bg-blue-50 text-qc-blue rounded-full text-xs font-medium hover:bg-blue-100 transition"
        >
          Edit Profile
        </button>

      </div>


      <div class="grid grid-cols-3 gap-3">

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
          <p class="text-lg font-bold text-qc-blue">
            0
          </p>

          <p class="text-xs text-gray-500">
            Rides
          </p>
        </div>


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


// ==================================================
// NAVIGATION
// ==================================================

function navigateTo(page, updateHash = true) {

  if (!Pages[page]) {
    console.warn("Unknown page:", page);
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
    home: "QC Bus Tracker",
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


  // ==================================================
  // SCROLL
  // ==================================================

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });


  // ==================================================
  // HASH
  // ==================================================

  if (updateHash) {
    window.location.hash = page;
  }
}


// ==================================================
// SETTINGS
// ==================================================

function toggleSetting(key) {

  if (!(key in AppState.settings)) {
    return;
  }

  AppState.settings[key] =
    !AppState.settings[key];


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


  navigateTo("settings");
}


// ==================================================
// NOTIFICATIONS
// ==================================================

function markAllRead() {

  AppState.notifications.forEach(
    (notification) => {
      notification.read = true;
    }
  );

  updateNotifBadge();

  navigateTo(
    "notifications"
  );
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

const user = auth.currentUser;

if (!user) {
  showReportToast(
    "You must be logged in to submit a report.",
    "error"
  );

  return;
}

const userProfile =
  await getUserProfile(user.uid);

if (!userProfile) {
  showReportToast(
    "Unable to load your user profile.",
    "error"
  );

  return;
}

report.reporterId = user.uid;
report.reporterName =
  userProfile.name ||
  user.email ||
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
// REPORT FORM SUBMIT DELEGATION
// ==================================================

document.addEventListener("submit", event => {
  if (
    event.target &&
    event.target.id === "reportForm"
  ) {
    handleReportSubmit(event);
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


        refreshCurrentPage();
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

        AppState.activeTrips =
          snapshot.docs.map(
            (tripDoc) => ({
              id: tripDoc.id,
              ...tripDoc.data(),
            })
          );


        rebuildBuses();


        console.log(
          "Active commuter trips:",
          AppState.activeTrips
        );


        refreshCurrentPage();
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


 

  // ==================================================
  // HEADER NOTIFICATION
  // ==================================================
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

  const validPages = [
    "home",
    "map",
    "notifications",
    "report",
    "settings",
    "account"
  ];
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

window.navigateTo =
  navigateTo;

window.toggleSetting =
  toggleSetting;

window.markAllRead =
  markAllRead;

window.logout =
  logout;

window.listenToBuses =
  listenToBuses;

window.listenToActiveTrips =
  listenToActiveTrips;

window.stopAllListeners =
  stopAllListeners;

window.AppState =
  AppState;
