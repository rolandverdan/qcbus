// ==================================================
// ADMIN — LIVE MONITOR
// ==================================================

import {
  collection,
  getDocs,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../../shared/js/firebase.js";
import { endAllActiveTripsRepo, endTripRepo } from "../../shared/js/repositories/trips.repo.js";

import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";


// ==================================================
// MONITOR PAGE
// ==================================================

Pages.monitor = async function () {
  const allBuses = await Store.getBuses();

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

      const busKey = trip.busDocId || trip.busId;
      const bus = allBuses.find(b => b.id === busKey) ||
        allBuses.find(b => b.id === trip.busId || b.code === trip.busId || b.code === trip.busCode);

      return {
        ...bus,
        ...trip,

        // Keep the bus identity available
        id: bus?.id || trip.busDocId || trip.busId,
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

  const activeBusCount = new Set(
    activeTrips.map(bus => bus.id || bus.busId).filter(Boolean)
  ).size;

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
            <span id="monitorActiveBusCount">${activeBusCount}</span>
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
          -mx-3
          bg-white
          shadow-sm
          overflow-hidden
          sm:mx-0
          sm:rounded-2xl
          sm:border
          sm:border-gray-100
        "
      >

        <div
          id="monitorMap"
          class="
            w-full
            h-[68vh]
            min-h-[440px]
            max-h-[760px]
            bg-gray-100
          "
        ></div>

        <!-- Floating route search, matching the commuter map controls -->
        <div id="monitorRoutePicker" class="absolute top-3 left-3 right-3 z-20 sm:left-4 sm:right-auto sm:w-[min(420px,calc(100%-2rem))]">
          <div class="relative">
            <div class="relative flex items-center rounded-2xl border border-gray-200/90 bg-white/95 shadow-lg backdrop-blur-xl focus-within:border-qc-purple focus-within:ring-2 focus-within:ring-purple-100">
              <span class="pointer-events-none absolute left-3.5 text-gray-500" aria-hidden="true">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" stroke-width="2"/><path stroke-linecap="round" stroke-width="2" d="m16 16 4 4"/></svg>
              </span>
              <input id="monitorRouteSearch" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Search route (e.g. R1, City Hall)" class="w-full rounded-2xl bg-transparent py-3 pl-10 pr-20 text-sm text-gray-800 outline-none placeholder:text-gray-400" aria-label="Search map routes">
              <button id="monitorRouteClear" type="button" class="hidden absolute right-2.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-200" aria-label="Show all routes and buses">Clear</button>
            </div>
            <div id="monitorRouteList" class="absolute left-0 right-0 top-full z-30 mt-1.5 hidden max-h-60 space-y-1.5 overflow-y-auto rounded-2xl border border-gray-100 bg-white/95 p-2 shadow-2xl backdrop-blur-xl"></div>
          </div>
        </div>

        <!-- Map status -->
        <div
          class="
            absolute
            bottom-3
            left-3
            z-10
            bg-white/90
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
                Active buses across all routes
              </p>
            </div>

          </div>

        </div>

      </div>


      <!-- ==================================================
           ACTIVE BUS DETAILS
      ================================================== -->


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

          <button
            id="endAllActiveTripsBtn"
            type="button"
            onclick="endAllActiveTrips()"
            class="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            ${activeTrips.length === 0 ? "disabled" : ""}
          >
            End all trips
          </button>

          <div
            id="monitorActiveTripCount"
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


        <div id="monitorActiveTripsList">
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
                  <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7h18v11H3zM5 7l2-3h10l2 3M7 18v2m10-2v2M6 11h12"/></svg>
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
let monitorStaff = [];
let monitorBusInventory = [];
let monitorActiveTrips = [];

let selectedMonitorRouteId = null;

let monitorBusMarkers = [];
let monitorStopMarkers = [];
let unsubscribeMonitorBuses = null;
let unsubscribeMonitorTrips = null;


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

function renderMonitorLiveTrips() {
  const root = document.getElementById("monitorActiveTripsList");
  if (!root) return;

  if (!monitorBuses.length) {
    root.innerHTML = `
      <div class="rounded-xl bg-gray-50 py-7 text-center">
        <p class="text-xs font-medium text-gray-500">No active trips</p>
        <p class="mt-0.5 text-[10px] text-gray-400">Trips appear here when conductors start service.</p>
      </div>`;
    return;
  }

  root.innerHTML = `<div class="space-y-2">${monitorBuses.map((bus) => {
    const route = getMonitorRoute(bus.routeId);
    const conductor = monitorStaff.find((member) => member.id === bus.conductorId);
    const color = getMonitorRouteColor(route);
    const onboard = Number(bus.onboard) || 0;
    const capacity = Number(bus.capacity) || 0;
    const occupancy = capacity ? Math.min(100, Math.round(onboard / capacity * 100)) : 0;
    return `
      <div class="flex items-stretch gap-2">
      <button type="button" onclick="selectMonitorRoute('${escapeHtml(route?.id || "")}')" class="min-w-0 flex-1 rounded-xl border border-gray-100 p-3 text-left transition hover:bg-gray-50">
        <div class="flex items-center gap-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold text-white" style="background:${escapeHtml(color)}">${escapeHtml(String(bus.code || bus.id || "BUS").split("-").pop())}</span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="truncate text-xs font-semibold text-gray-800">${escapeHtml(bus.code || bus.id || "Bus")}</span>
              <span class="shrink-0 text-[9px] font-semibold text-green-600">● ON TRIP</span>
            </span>
            <span class="mt-0.5 block truncate text-[10px] text-gray-500">${escapeHtml(route ? `${route.code || ""}${route.name ? ` · ${route.name}` : ""}` : "No route assigned")}</span>
            <span class="mt-1 block truncate text-[9px] text-gray-400">${escapeHtml(conductor ? `Conductor: ${conductor.name}` : "Conductor not assigned")}</span>
          </span>
          <span class="w-16 shrink-0 text-right">
            <span class="block text-sm font-bold text-gray-800" data-monitor-occupancy>${onboard}/${capacity}</span>
            <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-gray-100"><span class="block h-full rounded-full" data-monitor-occupancy-bar style="width:${occupancy}%;background:${escapeHtml(color)}"></span></span>
          </span>
        </div>
      </button>
      <button type="button" data-end-trip-id="${escapeHtml(bus.tripDocumentId || "")}" data-bus-code="${escapeHtml(bus.code || bus.id || "Bus")}" class="shrink-0 self-center rounded-lg bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50" ${bus.tripDocumentId ? "" : "disabled"}>End trip</button>
      </div>`;
  }).join("")}</div>`;

  root.querySelectorAll("[data-end-trip-id]").forEach((button) => {
    button.addEventListener("click", () => {
      endSingleActiveTrip(button.dataset.endTripId, button.dataset.busCode, button);
    });
  });
}

async function endSingleActiveTrip(tripId, busCode, button) {
  if (!tripId) return;
  if (!confirm(`End the active trip for ${busCode || "this bus"}?`)) return;

  button.disabled = true;
  button.textContent = "Ending...";
  const trip = monitorActiveTrips.find((item) => item.id === tripId) || {};
  try {
    await endTripRepo(tripId, trip);
    window.showToast?.(`Trip for ${busCode || "bus"} ended.`, "success");
  } catch (error) {
    console.error("Failed to end bus trip:", error);
    window.showToast?.(`Could not end the trip for ${busCode || "bus"}. Please try again.`, "error");
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "End trip";
    }
  }
}

async function endAllActiveTrips() {
  const activeCount = monitorActiveTrips.length;
  if (activeCount === 0) {
    window.showToast?.("There are no active trips to end.", "info");
    return;
  }

  const confirmed = confirm(
    `End all ${activeCount} active ${activeCount === 1 ? "trip" : "trips"}? This will stop live tracking for those trips.`
  );
  if (!confirmed) return;

  const button = document.getElementById("endAllActiveTripsBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Ending trips...";
  }

  try {
    const endedCount = await endAllActiveTripsRepo();
    window.showToast?.(
      endedCount
        ? `Ended ${endedCount} active ${endedCount === 1 ? "trip" : "trips"}.`
        : "There are no active trips to end.",
      endedCount ? "success" : "info"
    );
  } catch (error) {
    console.error("Failed to end all active trips:", error);
    window.showToast?.("Could not end all active trips. Please try again.", "error");
  } finally {
    if (button?.isConnected) {
      button.textContent = "End all trips";
      button.disabled = monitorActiveTrips.length === 0;
    }
  }
}

window.endAllActiveTrips = endAllActiveTrips;

function updateMonitorLiveData({ fitNewBuses = false, renderTrips = true } = {}) {
  const previousIds = new Set(monitorBuses.map((bus) => bus.id));
  const previousLocatedIds = new Set(monitorBuses
    .filter((bus) => getMonitorGps(bus))
    .map((bus) => bus.id));
  const inventoryById = new Map();
  monitorBusInventory.forEach((bus) => {
    [bus.id, bus.code, bus.busCode].filter(Boolean).forEach((key) => inventoryById.set(String(key), bus));
  });
  const busesById = new Map();

  monitorActiveTrips.forEach((trip) => {
    const busId = trip.busDocId || trip.busId;
    if (!busId) return;
    // Older conductor builds save the bus code in trips.busId, while GPS is
    // written to the bus document. Resolve either identifier back to that doc.
    const inventory = inventoryById.get(String(trip.busDocId || "")) ||
      inventoryById.get(String(trip.busId || "")) ||
      inventoryById.get(String(trip.busCode || "")) || {};
    busesById.set(busId, {
      ...inventory,
      ...trip,
      id: inventory.id || busId,
      code: inventory.code || trip.busCode || busId,
      routeId: trip.routeId || inventory.routeId || null,
      lat: inventory.lat ?? trip.lat ?? null,
      lng: inventory.lng ?? trip.lng ?? null,
      speedKmh: inventory.speedKmh ?? trip.speedKmh ?? null,
      locationUpdatedAt: inventory.locationUpdatedAt ?? trip.locationUpdatedAt ?? null,
      onboard: trip.onboard ?? inventory.onboard ?? 0,
      capacity: trip.capacity ?? inventory.capacity ?? 0,
      driverId: trip.driverId || inventory.driverId || null,
      conductorId: trip.conductorId || inventory.conductorId || null,
      tripDocumentId: trip.id,
      tripActive: true,
    });
  });

  monitorBuses = [...busesById.values()];
  updateMonitorBusMarkers();
  if (renderTrips) renderMonitorLiveTrips();

  const busCount = document.getElementById("monitorActiveBusCount");
  if (busCount) busCount.textContent = String(monitorBuses.length);
  const tripCount = document.getElementById("monitorActiveTripCount");
  if (tripCount) tripCount.textContent = String(monitorBuses.length);
  updateMonitorMapHeader(getMonitorRoute(selectedMonitorRouteId));

  const hasNewActiveBus = monitorBuses.some((bus) => !previousIds.has(bus.id));
  const hasNewGpsLocation = monitorBuses.some((bus) =>
    getMonitorGps(bus) &&
    !previousLocatedIds.has(bus.id)
  );
  if ((fitNewBuses && hasNewActiveBus) || hasNewGpsLocation) {
    fitMonitorMapToBuses();
  }
}

function startMonitorRealtimeListeners() {
  unsubscribeMonitorBuses?.();
  unsubscribeMonitorTrips?.();

  unsubscribeMonitorBuses = onSnapshot(
    collection(db, "buses"),
    (snapshot) => {
      monitorBusInventory = snapshot.docs.map((busDoc) => ({ id: busDoc.id, ...busDoc.data() }));
      updateMonitorLiveData({ renderTrips: false });
    },
    (error) => console.error("Admin live bus location listener failed:", error)
  );

  unsubscribeMonitorTrips = onSnapshot(
    query(collection(db, "trips"), where("status", "==", "active")),
    (snapshot) => {
      monitorActiveTrips = snapshot.docs.map((tripDoc) => ({ id: tripDoc.id, ...tripDoc.data() }));
      updateMonitorLiveData({ fitNewBuses: true });
    },
    (error) => console.error("Admin active trip listener failed:", error)
  );
}

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


function getMonitorGps(bus) {
  const rawLat = bus?.lat;
  const rawLng = bus?.lng;
  if (rawLat === null || rawLat === undefined || rawLat === "" || rawLng === null || rawLng === undefined || rawLng === "") {
    return null;
  }

  const lat = Number(rawLat);
  const lng = Number(rawLng);
  // This monitor only covers Quezon City. Reject empty/default (0, 0) and
  // stale or malformed coordinates so they cannot move the default map away.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 14 || lat > 16 || lng < 120 || lng > 122) {
    return null;
  }

  return { lat, lng };
}

function getMonitorLocationAgeMs(bus, now = Date.now()) {
  const timestamp = bus?.locationUpdatedAt?.toMillis?.() ??
    (bus?.locationUpdatedAt?.toDate ? bus.locationUpdatedAt.toDate().getTime() :
      bus?.locationUpdatedAt instanceof Date ? bus.locationUpdatedAt.getTime() :
        typeof bus?.locationUpdatedAt === "number" ? bus.locationUpdatedAt : Date.parse(bus?.locationUpdatedAt || ""));
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : null;
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

  const clearButton = document.getElementById("monitorRouteClear");
  if (clearButton) {
    clearButton.classList.toggle("hidden", !search && !selectedMonitorRouteId);
  }

  if (!search) {
    list.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  list.classList.remove("hidden");

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


  selectedMonitorRouteId =
    routeId;

  const searchInput = document.getElementById("monitorRouteSearch");
  if (searchInput) {
    searchInput.value = route.code
      ? `${route.code}${route.name ? ` — ${route.name}` : ""}`
      : (route.name || "");
  }

  updateMonitorRoutePicker("");

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

  const searchInput = document.getElementById("monitorRouteSearch");
  if (searchInput) searchInput.value = "";

  updateMonitorRoutePicker("");

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

    const locatedCount = monitorBuses.filter((bus) => getMonitorGps(bus)).length;
    subtitle.textContent = monitorBuses.length
      ? `${locatedCount} of ${monitorBuses.length} active buses sharing GPS`
      : "No active trips right now";

    return;
  }


  title.textContent =
    route.code ||
    route.name ||
    "Selected route";

  const routeBuses = monitorBuses.filter((bus) => bus.routeId === route.id);
  const locatedCount = routeBuses.filter((bus) => getMonitorGps(bus)).length;
  subtitle.textContent = `${locatedCount} of ${routeBuses.length} active buses sharing GPS`;
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
                  Location: ${escapeHtml(stopPlace)}
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
  monitorBusMarkers.forEach(({ marker, popup }) => {
    popup.remove();
    marker.remove();
  });
  monitorBusMarkers = [];
}

function getMonitorBusPopupHtml(bus, route) {
  const capacity = Number(bus.capacity) || 0;
  const onboard = Number(bus.onboard) || 0;
  const speed = Number(bus.speedKmh);
  const conductor = monitorStaff.find((member) => member.id === bus.conductorId);
  const driver = monitorStaff.find((member) => member.id === bus.driverId);
  const updatedAt = bus.locationUpdatedAt?.toDate
    ? bus.locationUpdatedAt.toDate()
    : bus.locationUpdatedAt
      ? new Date(bus.locationUpdatedAt)
      : null;
  const updatedLabel = updatedAt && Number.isFinite(updatedAt.getTime())
    ? updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Unavailable';
  const routeLabel = route
    ? [route.code, route.name].filter(Boolean).join(' · ')
    : 'No route assigned';

  return `
    <div style="min-width:200px">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">${escapeHtml(bus.code || bus.id || 'Bus')}</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:7px">${escapeHtml(routeLabel)}</div>
      <div style="font-size:12px;color:#16a34a;font-weight:600">● ON TRIP</div>
      ${bus.directionLabel ? `<div style="margin-top:7px;font-size:12px;color:#555">Direction: <strong>${escapeHtml(bus.directionLabel)}</strong></div>` : ''}
      ${driver ? `<div style="margin-top:6px;font-size:12px;color:#555">Driver: <strong>${escapeHtml(driver.name)}</strong></div>` : ''}
      ${conductor ? `<div style="margin-top:4px;font-size:12px;color:#555">Conductor: <strong>${escapeHtml(conductor.name)}</strong></div>` : ''}
      <div style="margin-top:6px;font-size:12px;color:#555">Passengers: <strong>${onboard}/${capacity}</strong></div>
      <div style="margin-top:4px;font-size:12px;color:#555">Available seats: <strong>${Math.max(0, capacity - onboard)}</strong></div>
      <div style="margin-top:4px;font-size:12px;color:#555">Speed: <strong>${Number.isFinite(speed) ? `${speed} km/h` : 'Unavailable'}</strong></div>
      <div style="margin-top:4px;font-size:11px;color:#888">GPS updated: ${escapeHtml(updatedLabel)}</div>
    </div>`;
}

function getMonitorBusMarkerHtml(bus, color) {
  const shortCode = String(bus.code || bus.id || 'BUS').split('-').pop();
  return `
    <div style="position:relative;display:inline-flex;align-items:center;gap:6px;background:${escapeHtml(color)};color:#fff;padding:4px 10px 4px 6px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)">
      <img src="../images/bus (1).png" alt="" style="width:20px;height:20px;object-fit:contain;flex-shrink:0;filter:brightness(0) invert(1)">
      <span>${escapeHtml(shortCode)}</span>
      <span style="position:absolute;top:-4px;right:-4px;width:9px;height:9px;border-radius:50%;background:#22c55e;border:2px solid #fff"></span>
    </div>`;
}

function updateMonitorBusMarkers() {
  if (!monitorMap) return;

  const buses = selectedMonitorRouteId
    ? monitorBuses.filter((bus) => bus.routeId === selectedMonitorRouteId)
    : monitorBuses;
  const busesWithLocation = buses.flatMap((bus) => {
    const location = getMonitorGps(bus);
    return bus.tripActive && bus.id && location
      ? [{ bus, ...location }]
      : [];
  });
  const visibleBusIds = new Set(busesWithLocation.map(({ bus }) => bus.id));

  monitorBusMarkers = monitorBusMarkers.filter((record) => {
    if (visibleBusIds.has(record.busId)) return true;
    record.popup.remove();
    record.marker.remove();
    return false;
  });

  busesWithLocation.forEach(({ bus, lat, lng }) => {
    const route = getMonitorRoute(bus.routeId);
    const color = getMonitorRouteColor(route);
    const popupHtml = getMonitorBusPopupHtml(bus, route);
    const markerHtml = getMonitorBusMarkerHtml(bus, color);
    const existing = monitorBusMarkers.find((record) => record.busId === bus.id);

    if (existing) {
      existing.marker.setLngLat([lng, lat]);
      if (existing.popupHtml !== popupHtml) {
        existing.popup.setHTML(popupHtml);
        existing.popupHtml = popupHtml;
      }
      if (existing.markerHtml !== markerHtml) {
        existing.element.innerHTML = markerHtml;
        existing.markerHtml = markerHtml;
      }
      existing.element.setAttribute('aria-label', `Show details for bus ${bus.code || bus.id || 'bus'}`);
      const locationAge = getMonitorLocationAgeMs(bus);
      existing.element.style.opacity = locationAge === null || locationAge > 30000 ? "0.55" : "1";
      return;
    }

    const element = document.createElement('div');
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    element.setAttribute('aria-label', `Show details for bus ${bus.code || bus.id || 'bus'}`);
    element.style.cursor = 'pointer';
    const locationAge = getMonitorLocationAgeMs(bus);
    element.style.opacity = locationAge === null || locationAge > 30000 ? "0.55" : "1";
    element.innerHTML = markerHtml;

    const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setHTML(popupHtml);
    const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(monitorMap);

    monitorBusMarkers.push({ busId: bus.id, marker, popup, element, popupHtml, markerHtml });
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

  fitMonitorMapToBuses();
}


function fitMonitorMapToBuses() {
  if (!monitorMap) return;

  const coordinates = monitorBuses.flatMap((bus) => {
    const location = getMonitorGps(bus);
    return location ? [[location.lng, location.lat]] : [];
  });

  if (!coordinates.length) {
    monitorMap.flyTo({ center: QC_CIRCLE_CENTER, zoom: QC_CIRCLE_ZOOM, duration: 500 });
    return;
  }

  if (coordinates.length === 1) {
    monitorMap.flyTo({ center: coordinates[0], zoom: 13, duration: 600 });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  coordinates.forEach((coordinate) => bounds.extend(coordinate));
  monitorMap.fitBounds(bounds, {
    padding: { top: 100, right: 55, bottom: 75, left: 55 },
    maxZoom: 12.5,
    duration: 650,
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

  // Start the admin map with the full fleet in view every time it opens.
  selectedMonitorRouteId = null;

  const [routes, buses, stops, staff, activeTripsSnapshot] = await Promise.all([
    Store.getRoutes(),
    Store.getBuses(),
    Store.getStops(),
    Store.getStaff(),
    getDocs(query(collection(db, "trips"), where("status", "==", "active"))),
  ]);

  monitorRoutes = routes;
  monitorStops = stops;
  monitorStaff = staff;
  monitorBusInventory = buses;
  monitorActiveTrips = activeTripsSnapshot.docs.map((tripDoc) => ({
    id: tripDoc.id,
    ...tripDoc.data(),
  }));
  updateMonitorLiveData();


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

    searchInput.addEventListener("focus", () => {
      if (searchInput.value.trim()) {
        updateMonitorRoutePicker(searchInput.value);
      }
    });

  }

  const clearRouteButton = document.getElementById("monitorRouteClear");
  clearRouteButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearMonitorRoute();
  });

  updateMonitorRoutePicker("");


  // ================================================
  // MAP
  // ================================================

  monitorMap =
    new maplibregl.Map({

      container:
        "monitorMap",

      // Use a raster basemap here so the monitor remains readable when the
      // remote vector style fails to load (which otherwise leaves a flat blue
      // background while markers and controls still appear).
      style: {
        version: 8,
        sources: {
          "monitor-basemap": {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "monitor-basemap",
            type: "raster",
            source: "monitor-basemap",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },

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
  fitMonitorMapToBuses();
  startMonitorRealtimeListeners();


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
  unsubscribeMonitorBuses?.();
  unsubscribeMonitorTrips?.();
  unsubscribeMonitorBuses = null;
  unsubscribeMonitorTrips = null;

  removeMonitorBusMarkers();


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
  monitorStaff = [];
  monitorBusInventory = [];
  monitorActiveTrips = [];

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
