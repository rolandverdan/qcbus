import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../../shared/js/firebase.js";


import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";

// ==================================================
// DASHBOARD
// ==================================================

Pages.dashboard = async function () {
  const routes = await Store.getRoutes();
  const buses = await Store.getBuses();
  const staff = await Store.getStaff();
  const stops = await Store.getStops();

  const activeBuses =
    buses.filter(b => b.status === "active").length;

  const idleBuses =
    buses.filter(b => b.status === "idle").length;

  const maintenanceBuses =
    buses.filter(b => b.status === "maintenance").length;

  const conductors =
    staff.filter(s => s.role === "conductor").length;

  const drivers =
    staff.filter(s => s.role === "driver").length;

  return `
    <div class="space-y-4 slide-in">

      <!-- Welcome -->
      <div class="bg-gradient-to-br from-qc-blue to-qc-blue-accent text-white rounded-2xl p-5 shadow-lg">
        <p class="text-xs opacity-90">Welcome back,</p>

        <h2 class="text-xl font-bold mt-0.5">
          ${escapeHtml(AppState.admin.name)}
        </h2>

        <p class="text-xs opacity-80 mt-1">
          Quezon City Bus Operations
        </p>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-3">

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
              </svg>
            </div>

            <span class="text-xs text-gray-400">
              routes
            </span>
          </div>

          <p class="text-2xl font-bold text-gray-800">
            ${routes.length}
          </p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
              </svg>
            </div>

            <span class="text-xs text-gray-400">
              buses
            </span>
          </div>

          <p class="text-2xl font-bold text-gray-800">
            ${buses.length}
          </p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>

            <span class="text-xs text-gray-400">
              stops
            </span>
          </div>

          <p class="text-2xl font-bold text-gray-800">
            ${stops.length}
          </p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 bg-yellow-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>

            <span class="text-xs text-gray-400">
              staff
            </span>
          </div>

          <p class="text-2xl font-bold text-gray-800">
            ${staff.length}
          </p>
        </div>

      </div>

      <!-- Fleet status -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">
          Fleet Status
        </h3>

        <div class="space-y-2">
          ${statusRow(
            "Active",
            activeBuses,
            "bg-qc-green",
            buses.length
          )}

          ${statusRow(
            "Idle",
            idleBuses,
            "bg-yellow-400",
            buses.length
          )}

          ${statusRow(
            "Maintenance",
            maintenanceBuses,
            "bg-qc-red",
            buses.length
          )}
        </div>
      </div>

      <!-- Staff -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">
          Staff Breakdown
        </h3>

        <div class="grid grid-cols-2 gap-3">

          <div class="p-3 bg-blue-50 rounded-xl">
            <p class="text-xs text-gray-500">
              Drivers
            </p>

            <p class="text-xl font-bold text-qc-blue">
              ${drivers}
            </p>
          </div>

          <div class="p-3 bg-green-50 rounded-xl">
            <p class="text-xs text-gray-500">
              Conductors
            </p>

            <p class="text-xl font-bold text-qc-green">
              ${conductors}
            </p>
          </div>

        </div>
      </div>

      <!-- Quick actions -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">
          Quick Actions
        </h3>

        <div class="grid grid-cols-2 gap-3">

          <button
            onclick="openRouteModal()"
            class="p-3 rounded-xl border border-gray-100 hover:border-qc-purple hover:bg-purple-50 transition text-left"
          >
            <p class="text-sm font-semibold text-gray-800">
              + Add Route
            </p>

            <p class="text-xs text-gray-500 mt-0.5">
              Create a new bus route
            </p>
          </button>

          <button
            onclick="openBusModal()"
            class="p-3 rounded-xl border border-gray-100 hover:border-qc-purple hover:bg-purple-50 transition text-left"
          >
            <p class="text-sm font-semibold text-gray-800">
              + Add Bus
            </p>

            <p class="text-xs text-gray-500 mt-0.5">
              Register a new bus
            </p>
          </button>

          <button
            onclick="openStaffModal()"
            class="p-3 rounded-xl border border-gray-100 hover:border-qc-purple hover:bg-purple-50 transition text-left"
          >
            <p class="text-sm font-semibold text-gray-800">
              + Add Staff
            </p>

            <p class="text-xs text-gray-500 mt-0.5">
              Driver or conductor
            </p>
          </button>

          <button
            onclick="navigateTo('monitor')"
            class="p-3 rounded-xl border border-gray-100 hover:border-qc-purple hover:bg-purple-50 transition text-left"
          >
            <p class="text-sm font-semibold text-gray-800">
              Live Monitor
            </p>

            <p class="text-xs text-gray-500 mt-0.5">
              See fleet in real time
            </p>
          </button>

        </div>
      </div>

    </div>
  `;
};


// ==================================================
// STATUS ROW
// ==================================================

function statusRow(
  label,
  value,
  colorClass,
  total
) {
  const pct =
    total
      ? Math.round((value / total) * 100)
      : 0;

  return `
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-gray-600">
          ${label}
        </span>

        <span class="text-xs font-semibold text-gray-700">
          ${value}
        </span>
      </div>

      <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          class="h-full ${colorClass} transition-all"
          style="width:${pct}%"
        ></div>
      </div>
    </div>
  `;
}

// ==================================================
// MONITOR PAGE
// ==================================================

Pages.monitor = async function () {
  const allBuses = await Store.getBuses();

const buses =
  allBuses.filter(
    b => b.status === "active"
  );

  const routes =
    await Store.getRoutes();

  const staff =
    await Store.getStaff();

  const liveData = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("qcBusOccupancy") || "null"
      );
    } catch {
      return null;
    }
  })();

    // Load actual active trips from Firestore
  const tripsSnapshot = await getDocs(
    query(
      collection(db, "trips"),
      where("status", "==", "active")
    )
  );

  const activeTrips = tripsSnapshot.docs
    .map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    .map(trip => {

      const bus =
        allBuses.find(
          b => b.id === trip.busId
        );

      return {
        ...bus,
        ...trip,

        // Keep the bus identity available
        id: bus?.id || trip.busId,
        code: bus?.code || trip.busCode,

        // Trip data takes priority
        routeId:
          trip.routeId ||
          bus?.routeId ||
          null,

        onboard:
          trip.onboard ??
          bus?.onboard ??
          0,

        capacity:
          trip.capacity ??
          bus?.capacity ??
          0,

        driverId:
          trip.driverId ||
          bus?.driverId ||
          null,

        conductorId:
          trip.conductorId ||
          bus?.conductorId ||
          null,

        tripActive: true
      };
    });

  return `
    <div class="space-y-3 slide-in">

      <!-- ==================================================
           HEADER
      ================================================== -->

      <div class="flex items-center justify-between gap-3">

        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-gray-800">
              Live Monitor
            </h2>

            <span
              class="
                inline-flex
                items-center
                gap-1.5
                px-2
                py-1
                rounded-full
                bg-green-50
                text-green-700
                text-[9px]
                font-bold
              "
            >
              <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              LIVE
            </span>
          </div>

          <p class="text-[11px] text-gray-400 mt-0.5">
            Fleet activity across Quezon City
          </p>
        </div>

        <div class="text-right flex-shrink-0">
          <p class="text-lg font-bold text-gray-800">
            ${buses.length}
          </p>

          <p class="text-[9px] text-gray-400 uppercase tracking-wide">
            active buses
          </p>
        </div>

      </div>


      <!-- ==================================================
           DOCKED MAP
      ================================================== -->

      <div
        class="
          relative
          bg-white
          rounded-2xl
          border
          border-gray-100
          shadow-sm
          overflow-hidden
        "
      >

        <div
          id="monitorMap"
          class="
            w-full
            h-[360px]
            bg-gray-100
          "
        ></div>

        <!-- Map status -->
        <div
          class="
            absolute
            top-3
            left-3
            z-10
            bg-white/95
            backdrop-blur-sm
            rounded-xl
            shadow-md
            border
            border-gray-100
            px-3
            py-2
          "
        >

          <div class="flex items-center gap-2">

            <span
              class="
                w-2.5
                h-2.5
                rounded-full
                bg-qc-purple
              "
            ></span>

            <div>
              <p
                id="monitorMapTitle"
                class="text-xs font-semibold text-gray-800"
              >
                All routes
              </p>

              <p
                id="monitorMapSubtitle"
                class="text-[9px] text-gray-400"
              >
                Tap a route to focus
              </p>
            </div>

          </div>

        </div>

        <!-- Map hint -->
        <div
          class="
            absolute
            bottom-3
            left-1/2
            -translate-x-1/2
            z-10
            pointer-events-none
          "
        >
          <div
            class="
              bg-gray-900/75
              text-white
              px-3
              py-1.5
              rounded-full
              text-[9px]
              font-medium
              backdrop-blur-sm
            "
          >
            Tap a colored route
          </div>
        </div>

      </div>


      <!-- ==================================================
           ROUTE DOCK
      ================================================== -->

      <div
        class="
          bg-white
          rounded-2xl
          border
          border-gray-100
          shadow-sm
          p-3
        "
      >

        <div
          class="
            flex
            items-center
            justify-between
            gap-3
            mb-2.5
          "
        >

          

          ${
            selectedMonitorRouteId
              ? `
                <button
                  type="button"
                  onclick="clearMonitorRoute()"
                  class="
                    text-[10px]
                    font-semibold
                    text-qc-purple
                    px-2.5
                    py-1.5
                    rounded-lg
                    bg-purple-50
                    hover:bg-purple-100
                    transition
                  "
                >
                  All routes
                </button>
              `
              : `
                <span
                  class="
                    text-[10px]
                    text-gray-400
                  "
                >
                  
                </span>
              `
          }

        </div>


        <!-- Search -->
        <div class="relative mb-2.5">

          <input
            id="monitorRouteSearch"
            type="search"
            placeholder="Search route..."
            class="
              w-full
              px-3
              py-2
              pl-8
              text-xs
              bg-gray-50
              border
              border-gray-200
              rounded-xl
              outline-none
              focus:border-qc-purple
            "
          />

          <span
            class="
              absolute
              left-2.5
              top-1/2
              -translate-y-1/2
              text-gray-400
              text-xs
            "
          >
            🔍
          </span>

        </div>


        <!-- Fixed-height route list -->
        <div
          id="monitorRouteList"
          class="
            space-y-1.5
            max-h-40
            overflow-y-auto
            pr-1
          "
        ></div>

      </div>


      <!-- ==================================================
           ACTIVE TRIPS
      ================================================== -->

      <div
        class="
          bg-white
          rounded-2xl
          border
          border-gray-100
          shadow-sm
          p-4
        "
      >

        <div
          class="
            flex
            items-center
            justify-between
            mb-3
          "
        >

          <div>
            <h3 class="text-sm font-semibold text-gray-800">
              Active Trips
            </h3>

            <p class="text-[10px] text-gray-400 mt-0.5">
              Buses currently running a trip
            </p>
          </div>

          <div
            class="
              px-2
              py-1
              rounded-lg
              bg-green-50
              text-green-700
              text-[10px]
              font-bold
            "
          >
            ${activeTrips.length}
          </div>

        </div>


        ${
          activeTrips.length === 0
            ? `
              <div
                class="
                  py-7
                  text-center
                  bg-gray-50
                  rounded-xl
                "
              >

                <div
                  class="
                    w-10
                    h-10
                    mx-auto
                    rounded-full
                    bg-white
                    shadow-sm
                    flex
                    items-center
                    justify-center
                    text-lg
                  "
                >
                  🚌
                </div>

                <p class="text-xs font-medium text-gray-500 mt-2">
                  No active trips
                </p>

                <p class="text-[10px] text-gray-400 mt-0.5">
                  Trips appear when conductors start service.
                </p>

              </div>
            `
            : `
              <div class="space-y-2">

                ${activeTrips
                  .map(bus => {

                    const route =
                      routes.find(
                        r =>
                          r.id ===
                          bus.routeId
                      );

                    const driver =
                      staff.find(
                        s =>
                          s.id ===
                          bus.driverId
                      );

                    const conductor =
                      staff.find(
                        s =>
                          s.id ===
                          bus.conductorId
                      );

                    const color =
                      route?.color ||
                      "#7c3aed";

                    const onboard =
                      Number(
                        bus.onboard
                      ) || 0;

                    const capacity =
                      Number(
                        bus.capacity
                      ) || 0;

                    const occupancy =
                      capacity
                        ? Math.min(
                            100,
                            Math.round(
                              (onboard /
                                capacity) *
                                100
                            )
                          )
                        : 0;

                    return `
                      <button
                        type="button"
                        onclick="selectMonitorRoute('${escapeHtml(route?.id || "")}')"
                        class="
                          w-full
                          text-left
                          rounded-xl
                          border
                          border-gray-100
                          p-3
                          hover:bg-gray-50
                          transition
                        "
                      >

                        <div
                          class="
                            flex
                            items-center
                            gap-3
                          "
                        >

                          <!-- Bus indicator -->
                          <div
                            class="
                              w-9
                              h-9
                              rounded-xl
                              flex
                              items-center
                              justify-center
                              text-white
                              text-[10px]
                              font-bold
                              flex-shrink-0
                            "
                            style="
                              background:${escapeHtml(color)};
                            "
                          >
                            ${escapeHtml(
                              String(
                                bus.code ||
                                bus.id ||
                                "BUS"
                              )
                              .split("-")
                              .pop()
                            )}
                          </div>


                          <!-- Main -->
                          <div class="flex-1 min-w-0">

                            <div
                              class="
                                flex
                                items-center
                                gap-2
                              "
                            >

                              <p
                                class="
                                  text-xs
                                  font-semibold
                                  text-gray-800
                                "
                              >
                                ${escapeHtml(
                                  bus.code ||
                                  bus.id ||
                                  "Bus"
                                )}
                              </p>

                              <span
                                class="
                                  inline-flex
                                  items-center
                                  gap-1
                                  text-[9px]
                                  font-semibold
                                  text-green-600
                                "
                              >
                                <span
                                  class="
                                    w-1.5
                                    h-1.5
                                    rounded-full
                                    bg-green-500
                                    animate-pulse
                                  "
                                ></span>
                                ON TRIP
                              </span>

                            </div>

                            <p
                              class="
                                text-[10px]
                                text-gray-500
                                truncate
                                mt-0.5
                              "
                            >
                              ${
                                route
                                  ? `
                                    ${escapeHtml(route.code || "")}
                                    ·
                                    ${escapeHtml(route.name || "")}
                                  `
                                  : "No route assigned"
                              }
                            </p>

                            <p
                              class="
                                text-[9px]
                                text-gray-400
                                truncate
                                mt-1
                              "
                            >
                              ${
                                conductor
                                  ? `Conductor: ${escapeHtml(conductor.name)}`
                                  : "Conductor not assigned"
                              }
                            </p>

                          </div>


                          <!-- Occupancy -->
                          <div
                            class="
                              w-16
                              flex-shrink-0
                              text-right
                            "
                          >

                            <p
                              class="
                                text-sm
                                font-bold
                                text-gray-800
                              "
                            >
                              ${onboard}/${capacity}
                            </p>

                            <p
                              class="
                                text-[9px]
                                text-gray-400
                              "
                            >
                              onboard
                            </p>

                            <div
                              class="
                                mt-1.5
                                h-1
                                bg-gray-100
                                rounded-full
                                overflow-hidden
                              "
                            >
                              <div
                                class="
                                  h-full
                                  rounded-full
                                "
                                style="
                                  width:${occupancy}%;
                                  background:${escapeHtml(color)};
                                "
                              ></div>
                            </div>

                          </div>

                        </div>


                        <!-- Driver -->
                        ${
                          driver
                            ? `
                              <div
                                class="
                                  mt-2
                                  pt-2
                                  border-t
                                  border-gray-50
                                  flex
                                  items-center
                                  justify-between
                                "
                              >

                                <span class="text-[9px] text-gray-400">
                                  Driver
                                </span>

                                <span
                                  class="
                                    text-[10px]
                                    font-medium
                                    text-gray-600
                                  "
                                >
                                  ${escapeHtml(
                                    driver.name
                                  )}
                                </span>

                              </div>
                            `
                            : ""
                        }

                      </button>
                    `;
                  })
                  .join("")}

              </div>
            `
        }

      </div>


      <!-- ==================================================
           SOS
      ================================================== -->

      <div id="sosSection"></div>

    </div>
  `;
};


// ==================================================
// MONITOR MAP STATE
// ==================================================

let monitorMap = null;

let monitorRoutes = [];
let monitorBuses = [];
let monitorStops = [];

let selectedMonitorRouteId = null;

let monitorBusMarkers = [];
let monitorStopMarkers = [];


// ==================================================
// MONITOR MAP CONSTANTS
// ==================================================

const QC_CIRCLE_CENTER = [
  121.0494,
  14.6517
];

const QC_CIRCLE_ZOOM = 13;


// ==================================================
// HELPERS
// ==================================================

function parseMonitorGeometry(route) {
  if (!route?.geometry) {
    return null;
  }

  try {

    const geometry =
      typeof route.geometry === "string"
        ? JSON.parse(route.geometry)
        : route.geometry;

    if (
      geometry?.type === "Feature" &&
      geometry.geometry
    ) {
      return geometry.geometry;
    }

    if (
      geometry?.type &&
      geometry?.coordinates
    ) {
      return geometry;
    }

    return null;

  } catch (error) {

    console.error(
      "Invalid monitor route geometry:",
      error
    );

    return null;
  }
}


function getMonitorRoute(routeId) {
  return (
    monitorRoutes.find(
      route =>
        route.id === routeId
    ) || null
  );
}


function getMonitorRouteColor(route) {
  return (
    route?.color ||
    "#7c3aed"
  );
}


function getMonitorStops(routeId) {
  return (
    monitorStops || []
  )
    .filter(
      stop =>
        stop.routeId === routeId
    )
    .sort(
      (a, b) =>
        Number(a.order || 0) -
        Number(b.order || 0)
    );
}


function getMonitorGeometryCoordinates(
  geometry
) {
  if (!geometry) {
    return [];
  }

  if (
    geometry.type === "LineString"
  ) {
    return geometry.coordinates || [];
  }

  if (
    geometry.type === "MultiLineString"
  ) {
    return (
      geometry.coordinates?.flat(1) ||
      []
    );
  }

  return [];
}


// ==================================================
// ROUTE PICKER
// ==================================================

function updateMonitorRoutePicker(
  searchTerm = ""
) {
  const list =
    document.getElementById(
      "monitorRouteList"
    );

  if (!list) {
    return;
  }

  const search =
    String(searchTerm || "")
      .trim()
      .toLowerCase();

  const filtered =
    monitorRoutes.filter(route => {

      if (!search) {
        return true;
      }

      const text = `
        ${route.code || ""}
        ${route.name || ""}
        ${route.description || ""}
      `.toLowerCase();

      return text.includes(search);
    });


  if (filtered.length === 0) {

    list.innerHTML = `
      <div
        class="
          py-5
          text-center
          text-xs
          text-gray-400
        "
      >
        No routes found.
      </div>
    `;

    return;
  }


  list.innerHTML =
    filtered
      .map(route => {

        const selected =
          route.id ===
          selectedMonitorRouteId;

        const color =
          getMonitorRouteColor(
            route
          );

        return `
          <button
            type="button"
            data-monitor-route-id="${escapeHtml(route.id)}"
            class="
              w-full
              text-left
              rounded-xl
              px-3
              py-2.5
              transition
              border
              ${
                selected
                  ? "border-gray-300 bg-gray-50 shadow-sm"
                  : "border-gray-100 bg-white hover:bg-gray-50"
              }
            "
          >

            <div
              class="
                flex
                items-center
                gap-3
              "
            >

              <!-- Route color -->
              <span
                class="
                  w-3
                  h-3
                  rounded-full
                  flex-shrink-0
                  border-2
                  border-white
                  shadow-sm
                "
                style="
                  background:${escapeHtml(color)};
                "
              ></span>


              <!-- Route name -->
              <div
                class="
                  flex-1
                  min-w-0
                "
              >

                <div
                  class="
                    flex
                    items-center
                    gap-2
                  "
                >

                  <p
                    class="
                      text-xs
                      font-bold
                      text-gray-800
                    "
                  >
                    ${escapeHtml(
                      route.code ||
                      route.name ||
                      "Route"
                    )}
                  </p>

                  ${
                    route.code &&
                    route.name
                      ? `
                        <span
                          class="
                            text-[10px]
                            text-gray-400
                            truncate
                          "
                        >
                          ${escapeHtml(
                            route.name
                          )}
                        </span>
                      `
                      : ""
                  }

                </div>

              </div>


              <!-- Selected -->
              ${
                selected
                  ? `
                    <span
                      class="
                        w-5
                        h-5
                        rounded-full
                        bg-qc-purple
                        text-white
                        flex
                        items-center
                        justify-center
                        text-[10px]
                        font-bold
                      "
                    >
                      ✓
                    </span>
                  `
                  : `
                    <span
                      class="
                        text-gray-300
                        text-base
                      "
                    >
                      ›
                    </span>
                  `
              }

            </div>

          </button>
        `;
      })
      .join("");


  list
    .querySelectorAll(
      "[data-monitor-route-id]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          selectMonitorRoute(
            button.dataset
              .monitorRouteId
          );

        }
      );

    });
}


// ==================================================
// SELECT / DESELECT
// ==================================================

function selectMonitorRoute(
  routeId
) {
  const route =
    getMonitorRoute(
      routeId
    );

  if (!route) {
    return;
  }


  // Clicking selected route again
  // deselects it.
  if (
    selectedMonitorRouteId ===
    routeId
  ) {

    clearMonitorRoute();

    return;
  }


  selectedMonitorRouteId =
    routeId;


  updateMonitorRoutePicker();

  updateMonitorRouteLayers();

  updateMonitorStopMarkers();

  updateMonitorBusMarkers();

  updateMonitorMapHeader(
    route
  );

  fitMonitorMapToRoute(
    route
  );
}


function clearMonitorRoute() {

  selectedMonitorRouteId =
    null;

  updateMonitorRoutePicker();

  updateMonitorRouteLayers();

  updateMonitorStopMarkers();

  updateMonitorBusMarkers();

  updateMonitorMapHeader();

  resetMonitorMapView();
}


// ==================================================
// MAP HEADER
// ==================================================

function updateMonitorMapHeader(
  route = null
) {
  const title =
    document.getElementById(
      "monitorMapTitle"
    );

  const subtitle =
    document.getElementById(
      "monitorMapSubtitle"
    );

  if (!title || !subtitle) {
    return;
  }


  if (!route) {

    title.textContent =
      "All routes";

    subtitle.textContent =
      "Tap a route to focus";

    return;
  }


  title.textContent =
    route.code ||
    route.name ||
    "Selected route";

  subtitle.textContent =
    route.name &&
    route.code
      ? route.name
      : "Focused route";
}


// ==================================================
// REMOVE ROUTE LAYERS
// ==================================================

function removeMonitorRouteLayers() {

  if (!monitorMap) {
    return;
  }


  [
    "monitor-selected-route-line",
    "monitor-selected-route-casing",
    "monitor-all-routes-line"
  ].forEach(
    layerId => {

      if (
        monitorMap.getLayer(
          layerId
        )
      ) {

        monitorMap.removeLayer(
          layerId
        );

      }

    }
  );


  [
    "monitor-selected-route",
    "monitor-all-routes"
  ].forEach(
    sourceId => {

      if (
        monitorMap.getSource(
          sourceId
        )
      ) {

        monitorMap.removeSource(
          sourceId
        );

      }

    }
  );
}


// ==================================================
// DRAW ROUTES
// ==================================================

function updateMonitorRouteLayers() {

  if (!monitorMap) {
    return;
  }

  if (
    !monitorMap.isStyleLoaded()
  ) {
    return;
  }


  removeMonitorRouteLayers();


  const features =
    monitorRoutes
      .map(route => {

        const geometry =
          parseMonitorGeometry(
            route
          );

        if (!geometry) {
          return null;
        }

        return {
          type: "Feature",

          properties: {
            routeId:
              route.id,

            routeCode:
              route.code || "",

            routeName:
              route.name || "",

            color:
              getMonitorRouteColor(
                route
              )
          },

          geometry
        };

      })
      .filter(Boolean);


  if (
    features.length === 0
  ) {
    return;
  }


  // ==================================================
  // ALL ROUTES
  // ==================================================

  monitorMap.addSource(
    "monitor-all-routes",
    {
      type: "geojson",

      data: {
        type: "FeatureCollection",
        features
      }
    }
  );


  monitorMap.addLayer({

    id:
      "monitor-all-routes-line",

    type:
      "line",

    source:
      "monitor-all-routes",

    layout: {
      "line-cap":
        "round",

      "line-join":
        "round"
    },

    paint: {

      "line-color": [
        "coalesce",

        [
          "get",
          "color"
        ],

        "#7c3aed"
      ],

      "line-width":
        selectedMonitorRouteId
          ? 4
          : 5,

      "line-opacity":
        selectedMonitorRouteId
          ? [
              "case",

              [
                "==",

                [
                  "get",
                  "routeId"
                ],

                selectedMonitorRouteId
              ],

              1,

              0.2
            ]
          : 0.9
    }

  });


  // ==================================================
  // SELECTED ROUTE
  // ==================================================

  if (
    selectedMonitorRouteId
  ) {

    const route =
      getMonitorRoute(
        selectedMonitorRouteId
      );

    const geometry =
      parseMonitorGeometry(
        route
      );

    if (!geometry) {
      return;
    }


    const color =
      getMonitorRouteColor(
        route
      );


    monitorMap.addSource(
      "monitor-selected-route",
      {
        type: "geojson",

        data: {
          type: "Feature",

          properties: {
            routeId:
              selectedMonitorRouteId
          },

          geometry
        }
      }
    );


    monitorMap.addLayer({

      id:
        "monitor-selected-route-casing",

      type:
        "line",

      source:
        "monitor-selected-route",

      layout: {
        "line-cap":
          "round",

        "line-join":
          "round"
      },

      paint: {

        "line-color":
          "#ffffff",

        "line-width":
          10,

        "line-opacity":
          0.9
      }

    });


    monitorMap.addLayer({

      id:
        "monitor-selected-route-line",

      type:
        "line",

      source:
        "monitor-selected-route",

      layout: {
        "line-cap":
          "round",

        "line-join":
          "round"
      },

      paint: {

        "line-color":
          color,

        "line-width":
          6,

        "line-opacity":
          1
      }

    });

  }
}


// ==================================================
// STOP MARKERS
// ==================================================
function updateMonitorStopMarkers() {

  if (!monitorMap) {
    return;
  }

  // Remove existing stop markers
  monitorStopMarkers.forEach(
    marker => marker.remove()
  );

  monitorStopMarkers = [];

  // Stops only appear when a route is selected
  if (!selectedMonitorRouteId) {
    return;
  }

  const stops =
    getMonitorStops(
      selectedMonitorRouteId
    );

  stops.forEach(
    (stop, index) => {

      const lat =
        Number(stop.lat);

      const lng =
        Number(stop.lng);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return;
      }

      const stopName =
        stop.name ||
        stop.stopName ||
        `Stop ${index + 1}`;

      const stopPlace =
        stop.location ||
        stop.address ||
        stop.place ||
        "";

      // ==============================================
      // NUMBERED STOP MARKER
      // ==============================================

      const element =
        document.createElement("div");

      element.className =
        "route-stop-marker";

      element.textContent =
        index + 1;

      element.title =
        stopName;

      element.style.cssText = `
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #2563eb;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        border: 3px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        cursor: pointer;
        user-select: none;
        z-index: 20;
      `;

      // ==============================================
      // STOP POPUP
      // ==============================================

      const popup =
        new maplibregl.Popup({
          offset: 22,
          closeButton: true,
          closeOnClick: true,
          maxWidth: "280px"
        });

      popup.setHTML(`
        <div
          style="
            min-width:180px;
            padding:2px;
          "
        >

          <div
            style="
              display:flex;
              align-items:center;
              gap:9px;
              margin-bottom:8px;
            "
          >

            <div
              style="
                width:30px;
                height:30px;
                border-radius:50%;
                background:#2563eb;
                color:#ffffff;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:700;
                font-size:12px;
                flex-shrink:0;
              "
            >
              ${index + 1}
            </div>

            <div>

              <div
                style="
                  font-size:14px;
                  font-weight:700;
                  color:#111827;
                  line-height:1.2;
                "
              >
                ${escapeHtml(stopName)}
              </div>

              <div
                style="
                  font-size:11px;
                  color:#6b7280;
                  margin-top:2px;
                "
              >
                Bus Stop ${index + 1}
              </div>

            </div>

          </div>

          ${
            stopPlace
              ? `
                <div
                  style="
                    border-top:1px solid #e5e7eb;
                    padding-top:8px;
                    font-size:12px;
                    color:#4b5563;
                  "
                >
                  📍 ${escapeHtml(stopPlace)}
                </div>
              `
              : ""
          }

        </div>
      `);

      // ==============================================
      // PREVENT MAP BACKGROUND CLICK
      // ==============================================

      element.addEventListener(
        "pointerdown",
        event => {
          event.preventDefault();
          event.stopPropagation();
        }
      );

      element.addEventListener(
        "mousedown",
        event => {
          event.preventDefault();
          event.stopPropagation();
        }
      );

      // ==============================================
      // CLICK STOP
      // ==============================================

      let tooltipTimer = null;

      element.addEventListener(
        "click",
        event => {

          event.preventDefault();
          event.stopPropagation();

          clearTimeout(
            tooltipTimer
          );

          popup
            .setLngLat([
              lng,
              lat
            ])
            .addTo(
              monitorMap
            );

          tooltipTimer =
            setTimeout(
              () => {

                if (
                  popup.isOpen()
                ) {
                  popup.remove();
                }

              },
              2500
            );
        }
      );

      // ==============================================
      // CREATE MARKER
      // ==============================================

      const marker =
        new maplibregl.Marker({
          element,
          anchor: "center"
        })
        .setLngLat([
          lng,
          lat
        ])
        .addTo(
          monitorMap
        );

      monitorStopMarkers.push(
        marker
      );

    }
  );
}



// ==================================================
// BUS MARKERS
// ==================================================

function removeMonitorBusMarkers() {

  monitorBusMarkers.forEach(
    marker =>
      marker.remove()
  );

  monitorBusMarkers = [];
}


function updateMonitorBusMarkers() {

  if (!monitorMap) {
    return;
  }


  removeMonitorBusMarkers();


  const buses =
    selectedMonitorRouteId
      ? monitorBuses.filter(
          bus =>
            bus.routeId ===
            selectedMonitorRouteId
        )
      : monitorBuses;


  buses.forEach(bus => {

    const route =
      getMonitorRoute(
        bus.routeId
      );


    const color =
      getMonitorRouteColor(
        route
      );


    let lat =
      Number(bus.lat);

    let lng =
      Number(bus.lng);


    // Fallback to first stop.
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {

      const firstStop =
        getMonitorStops(
          bus.routeId
        )[0];

      if (!firstStop) {
        return;
      }

      lat =
        Number(firstStop.lat);

      lng =
        Number(firstStop.lng);
    }


    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return;
    }


    const element =
      document.createElement(
        "div"
      );

      element.addEventListener(
  "pointerdown",
  event => {
    event.preventDefault();
    event.stopPropagation();
  }
);

element.addEventListener(
  "mousedown",
  event => {
    event.preventDefault();
    event.stopPropagation();
  }
);

element.addEventListener(
  "click",
  event => {
    event.preventDefault();
    event.stopPropagation();
  }
);


    const shortCode =
      String(
        bus.code ||
        bus.id ||
        "BUS"
      )
      .split("-")
      .pop();


    element.innerHTML = `
      <div
        style="
          position:relative;
          background:${escapeHtml(color)};
          color:#fff;
          padding:5px 9px;
          border-radius:8px;
          font-size:10px;
          font-weight:700;
          white-space:nowrap;
          border:2px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,.25);
        "
      >
        ${escapeHtml(shortCode)}

        ${
          bus.tripActive
            ? `
              <span
                style="
                  position:absolute;
                  top:-4px;
                  right:-4px;
                  width:8px;
                  height:8px;
                  border-radius:50%;
                  background:#22c55e;
                  border:1px solid #fff;
                "
              ></span>
            `
            : ""
        }

      </div>
    `;


    const popup =
      new maplibregl.Popup({
        offset: 12,
        closeButton: true
      })
      .setHTML(`
        <div
          style="
            min-width:190px;
          "
        >

          <div
            style="
              font-size:14px;
              font-weight:700;
              margin-bottom:4px;
            "
          >
            ${escapeHtml(
              bus.code ||
              bus.id ||
              "Bus"
            )}
          </div>

          <div
            style="
              font-size:12px;
              color:#6b7280;
              margin-bottom:7px;
            "
          >
            ${
              route
                ? `
                  ${escapeHtml(
                    route.code ||
                    ""
                  )}
                  ·
                  ${escapeHtml(
                    route.name ||
                    ""
                  )}
                `
                : "No route"
            }
          </div>

          <div
            style="
              font-size:12px;
              color:#16a34a;
              font-weight:600;
            "
          >
            ● ${escapeHtml(
              bus.status ||
              "Active"
            )}
          </div>

          ${
            bus.tripActive
              ? `
                <div
                  style="
                    margin-top:8px;
                    font-size:12px;
                    color:#555;
                  "
                >
                  Passengers:
                  <strong>
                    ${Number(bus.onboard) || 0}/${Number(bus.capacity) || 0}
                  </strong>
                </div>
              `
              : ""
          }

        </div>
      `);


    const marker =
      new maplibregl.Marker({
        element,
        anchor: "bottom"
      })
      .setLngLat([
        lng,
        lat
      ])
      .setPopup(
        popup
      )
      .addTo(
        monitorMap
      );


    monitorBusMarkers.push(
      marker
    );

  });
}


// ==================================================
// FIT ROUTE
// ==================================================

function fitMonitorMapToRoute(
  route
) {

  if (!monitorMap) {
    return;
  }


  const geometry =
    parseMonitorGeometry(
      route
    );


  let coordinates =
    getMonitorGeometryCoordinates(
      geometry
    );


  if (
    coordinates.length === 0
  ) {

    coordinates =
      getMonitorStops(
        route.id
      )
      .map(stop => [
        Number(stop.lng),
        Number(stop.lat)
      ])
      .filter(
        ([lng, lat]) =>
          Number.isFinite(lng) &&
          Number.isFinite(lat)
      );

  }


  if (
    coordinates.length === 0
  ) {
    return;
  }


  const bounds =
    new maplibregl.LngLatBounds();


  coordinates.forEach(
    coordinate => {

      if (
        Array.isArray(
          coordinate
        ) &&
        coordinate.length >= 2
      ) {

        bounds.extend([
          Number(
            coordinate[0]
          ),

          Number(
            coordinate[1]
          )
        ]);

      }

    }
  );


  if (
    bounds.isEmpty()
  ) {
    return;
  }


  monitorMap.fitBounds(
    bounds,
    {
      padding: {
        top: 80,
        bottom: 80,
        left: 45,
        right: 45
      },

      maxZoom: 15,

      duration: 700
    }
  );
}


// ==================================================
// RESET MAP
// ==================================================

function resetMonitorMapView() {

  if (!monitorMap) {
    return;
  }


  monitorMap.flyTo({

    center:
      QC_CIRCLE_CENTER,

    zoom:
      QC_CIRCLE_ZOOM,

    duration:
      700

  });
}


// ==================================================
// MAP ROUTE INTERACTION
// ==================================================
function bindMonitorRouteInteraction() {

  if (!monitorMap) {
    return;
  }

  // ==============================================
  // MAP CLICK
  // ==============================================

  monitorMap.on(
    "click",
    event => {

      const layers = [];

      if (
        monitorMap.getLayer(
          "monitor-selected-route-line"
        )
      ) {
        layers.push(
          "monitor-selected-route-line"
        );
      }

      if (
        monitorMap.getLayer(
          "monitor-all-routes-line"
        )
      ) {
        layers.push(
          "monitor-all-routes-line"
        );
      }

      const features =
        layers.length > 0
          ? monitorMap.queryRenderedFeatures(
              event.point,
              {
                layers
              }
            )
          : [];

      const feature =
        features.find(
          item =>
            item.properties?.routeId
        );

      // ==========================================
      // CLICKED A ROUTE
      // ==========================================

      if (
        feature?.properties?.routeId
      ) {

        selectMonitorRoute(
          String(
            feature.properties.routeId
          )
        );

        return;
      }

      // ==========================================
      // CLICKED EMPTY MAP
      // ==========================================

      if (
        selectedMonitorRouteId
      ) {

        clearMonitorRoute();

      }

    }
  );


  // ==============================================
  // ROUTE HOVER
  // ==============================================

  monitorMap.on(
    "mousemove",
    event => {

      const layers = [];

      if (
        monitorMap.getLayer(
          "monitor-selected-route-line"
        )
      ) {
        layers.push(
          "monitor-selected-route-line"
        );
      }

      if (
        monitorMap.getLayer(
          "monitor-all-routes-line"
        )
      ) {
        layers.push(
          "monitor-all-routes-line"
        );
      }

      if (
        layers.length === 0
      ) {

        monitorMap
          .getCanvas()
          .style.cursor = "";

        return;
      }

      const features =
        monitorMap.queryRenderedFeatures(
          event.point,
          {
            layers
          }
        );

      monitorMap
        .getCanvas()
        .style.cursor =
          features.length
            ? "pointer"
            : "";

    }
  );


  monitorMap.on(
    "mouseleave",
    () => {

      if (monitorMap) {

        monitorMap
          .getCanvas()
          .style.cursor = "";

      }

    }
  );
}


// ==================================================
// INIT MONITOR
// ==================================================

async function initMonitorPage() {

  const container =
    document.getElementById(
      "monitorMap"
    );


  if (!container) {
    return;
  }


  // ================================================
  // EXISTING MAP
  // ================================================

  if (monitorMap) {

    const oldContainer =
      monitorMap.getContainer();


    if (
      oldContainer !==
      container
    ) {

      monitorMap.remove();

      monitorMap = null;

      AppState.map =
        null;

    } else {

      monitorMap.resize();

      return;

    }
  }


  // ================================================
  // MAPLIBRE CSS
  // ================================================

  if (
    !document.getElementById(
      "maplibre-css"
    )
  ) {

    const link =
      document.createElement(
        "link"
      );

    link.id =
      "maplibre-css";

    link.rel =
      "stylesheet";

    link.href =
      "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css";

    document.head.appendChild(
      link
    );

  }


  // ================================================
  // LOAD DATA
  // ================================================

  monitorRoutes =
    await Store.getRoutes();

  monitorBuses =
    (await Store.getBuses())
      .filter(
        bus =>
          bus.status === "active"
      );

  monitorStops =
    await Store.getStops();


  // ================================================
  // ROUTE SEARCH
  // ================================================

  const searchInput =
    document.getElementById(
      "monitorRouteSearch"
    );


  if (searchInput) {

    searchInput.addEventListener(
      "input",
      () => {

        updateMonitorRoutePicker(
          searchInput.value
        );

      }
    );

  }


  updateMonitorRoutePicker();


  // ================================================
  // MAP
  // ================================================

  monitorMap =
    new maplibregl.Map({

      container:
        "monitorMap",

      style:
        "https://tiles.openfreemap.org/styles/liberty",

      center:
        QC_CIRCLE_CENTER,

      zoom:
        QC_CIRCLE_ZOOM,

      attributionControl:
        true

    });


  AppState.map =
    monitorMap;


  await new Promise(
    resolve => {

      monitorMap.once(
        "load",
        resolve
      );

    }
  );


  if (
    AppState.map !==
    monitorMap
  ) {
    return;
  }


  monitorMap.addControl(

    new maplibregl.NavigationControl({
      showCompass:
        false
    }),

    "bottom-right"

  );


  // ================================================
  // DRAW ROUTES
  // ================================================

  updateMonitorRouteLayers();


  // ================================================
  // INTERACTION
  // ================================================

  bindMonitorRouteInteraction();


  // ================================================
  // BUS MARKERS
  // ================================================

  updateMonitorBusMarkers();


  // ================================================
  // MAP HEADER
  // ================================================

  updateMonitorMapHeader();


  // ================================================
  // SOS
  // ================================================

  if (
    typeof renderSOSSection ===
    "function"
  ) {

    renderSOSSection();

  }


  setTimeout(
    () => {

      if (monitorMap) {

        monitorMap.resize();

      }

    },
    100
  );
}


// ==================================================
// DESTROY MONITOR MAP
// ==================================================

function destroyMonitorMap() {

  monitorBusMarkers.forEach(
    marker =>
      marker.remove()
  );

  monitorBusMarkers = [];


  monitorStopMarkers.forEach(
    marker =>
      marker.remove()
  );

  monitorStopMarkers = [];


  if (monitorMap) {

    monitorMap.remove();

    monitorMap = null;

  }


  AppState.map =
    null;


  monitorRoutes = [];
  monitorBuses = [];
  monitorStops = [];

  selectedMonitorRouteId =
    null;
}


// ==================================================
// GLOBALS
// ==================================================

window.Pages.monitor =
  Pages.monitor;

window.initMonitorPage =
  initMonitorPage;

window.destroyMonitorMap =
  destroyMonitorMap;

window.selectMonitorRoute =
  selectMonitorRoute;

window.clearMonitorRoute =
  clearMonitorRoute;