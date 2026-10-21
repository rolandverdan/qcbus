import { listenToTripsRepo } from "../../shared/js/repositories/trips.repo.js";

let tripLogData = {
  trips: [],
  routes: [],
  buses: [],
};

let tripLogFilters = {
  routeId: "",
  busId: "",
  status: "all",
  from: "",
  to: "",
  search: "",
};
let unsubscribeTripLogs = null;
let tripLogsLoadGeneration = 0;
let tripLogsPage = 1;
const TRIP_LOGS_PAGE_SIZE = 10;

function escapeHtml(value) {
  return window.escapeHtml(value);
}

function getTimestampDate(value) {
  if (value?.toDate) {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (value && Number.isFinite(value.seconds)) {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getTripDate(trip) {
  return getTimestampDate(trip.startedAt) || getTimestampDate(trip.endedAt);
}

function getTripRouteLabel(trip) {
  const route = tripLogData.routes.find(item => item.id === trip.routeId);
  if (route) {
    return [route.code, route.name].filter(Boolean).join(" · ");
  }

  return (
    trip.routeName ||
    (trip.routeId ? "Deleted route" : "Unassigned route")
  );
}

function getTripBusLabel(trip) {
  const bus = tripLogData.buses.find(item => item.id === trip.busId);
  return bus?.code || trip.busCode || trip.busId || "Unknown bus";
}

function getTripStatus(trip) {
  return String(trip.status || "unknown").toLowerCase();
}

function getFilteredTrips() {
  const fromDate = tripLogFilters.from
    ? new Date(`${tripLogFilters.from}T00:00:00`)
    : null;
  const toDate = tripLogFilters.to
    ? new Date(`${tripLogFilters.to}T23:59:59.999`)
    : null;
  const search = tripLogFilters.search.trim().toLowerCase();

  return tripLogData.trips
    .filter(trip => {
      const tripDate = getTripDate(trip);
      const status = getTripStatus(trip);

      if (tripLogFilters.routeId && trip.routeId !== tripLogFilters.routeId) {
        return false;
      }
      if (tripLogFilters.busId && trip.busId !== tripLogFilters.busId) {
        return false;
      }
      if (tripLogFilters.status !== "all" && status !== tripLogFilters.status) {
        return false;
      }
      if (fromDate && (!tripDate || tripDate < fromDate)) {
        return false;
      }
      if (toDate && (!tripDate || tripDate > toDate)) {
        return false;
      }
      if (
        search &&
        ![
          getTripBusLabel(trip),
          getTripRouteLabel(trip),
          trip.conductorName,
          trip.conductorId,
          trip.id,
        ].some(value => String(value || "").toLowerCase().includes(search))
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) =>
      (getTripDate(b)?.getTime() || 0) - (getTripDate(a)?.getTime() || 0)
    );
}

function formatDuration(startedAt, endedAt, isActive) {
  const start = getTimestampDate(startedAt);
  if (!start) return "Not recorded";

  const end = getTimestampDate(endedAt) || (isActive ? new Date() : null);
  if (!end) return "Not recorded";
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (!hours) return `${remainingMinutes} min`;
  return `${hours} hr ${remainingMinutes} min`;
}

function renderTripCard(trip) {
  const startedAt = getTimestampDate(trip.startedAt);
  const endedAt = getTimestampDate(trip.endedAt);
  const isActive = getTripStatus(trip) === "active";
  const statusLabel = isActive
    ? "Active"
    : getTripStatus(trip).charAt(0).toUpperCase() +
      getTripStatus(trip).slice(1);
  const statusClass = isActive
    ? "bg-green-100 text-green-700"
    : "bg-gray-100 text-gray-600";
  const passengerCount = Number(trip.totalIn) || 0;
  const totalOut = Number(trip.totalOut) || 0;
  const onboard = Number(trip.onboard) || 0;

  return `
    <article class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate font-semibold text-gray-800">
            ${escapeHtml(getTripBusLabel(trip))}
            <span class="font-normal text-gray-400">·</span>
            ${escapeHtml(getTripRouteLabel(trip))}
          </p>
          <p class="mt-1 text-xs text-gray-500">
            ${escapeHtml(trip.conductorName || "Conductor not recorded")}
            <span class="text-gray-300">·</span>
            Trip ${escapeHtml(trip.id)}
          </p>
        </div>
        <span class="rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}">
          ${escapeHtml(statusLabel)}
        </span>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-100 pt-3 sm:grid-cols-4">
        <div>
          <p class="text-[11px] text-gray-400">Started</p>
          <p class="mt-0.5 text-xs font-medium text-gray-700">
            ${startedAt ? escapeHtml(startedAt.toLocaleString()) : "Not recorded"}
          </p>
        </div>
        <div>
          <p class="text-[11px] text-gray-400">Ended</p>
          <p class="mt-0.5 text-xs font-medium text-gray-700">
            ${endedAt ? escapeHtml(endedAt.toLocaleString()) : isActive ? "In progress" : "Not recorded"}
          </p>
        </div>
        <div>
          <p class="text-[11px] text-gray-400">Duration</p>
          <p class="mt-0.5 text-xs font-medium text-gray-700">
            ${escapeHtml(formatDuration(trip.startedAt, trip.endedAt, isActive))}
          </p>
        </div>
        <div>
          <p class="text-[11px] text-gray-400">Passenger counts</p>
          <p class="mt-0.5 text-xs font-medium text-gray-700">
            ${passengerCount} boarded · ${totalOut} got off · ${onboard} onboard
          </p>
        </div>
      </div>
    </article>
  `;
}

function renderTripResults() {
  const trips = getFilteredTrips();
  const list = document.getElementById("tripLogResults");
  const count = document.getElementById("tripLogResultCount");

  if (!list || !count) return;

  const pageCount = Math.max(1, Math.ceil(trips.length / TRIP_LOGS_PAGE_SIZE));
  tripLogsPage = Math.min(tripLogsPage, pageCount);
  const visibleTrips = trips.slice(
    (tripLogsPage - 1) * TRIP_LOGS_PAGE_SIZE,
    tripLogsPage * TRIP_LOGS_PAGE_SIZE
  );

  count.textContent = `${trips.length} ${trips.length === 1 ? "trip" : "trips"}`;
  document.getElementById("tripLogMetricCount").textContent = String(trips.length);
  document.getElementById("tripLogMetricActive").textContent = String(
    trips.filter(trip => getTripStatus(trip) === "active").length
  );
  document.getElementById("tripLogMetricEnded").textContent = String(
    trips.filter(trip => getTripStatus(trip) === "ended").length
  );
  document.getElementById("tripLogMetricBoarded").textContent = String(
    trips.reduce((total, trip) => total + (Number(trip.totalIn) || 0), 0)
  );
  list.innerHTML = trips.length
    ? `${visibleTrips.map(renderTripCard).join("")}${window.renderAdminPagination(tripLogsPage, trips.length, "setTripLogsPage")}`
    : `
      <div class="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <p class="text-sm font-medium text-gray-700">No trips match these filters</p>
        <p class="mt-1 text-xs text-gray-400">Try changing or clearing your filters.</p>
      </div>
    `;
}

window.setTripLogsPage = function (page) {
  tripLogsPage = page;
  renderTripResults();
};

function renderFilterOptions() {
  const routes = new Map(
    tripLogData.routes.map(route => [
      route.id,
      `${route.code || "Route"}${route.name ? ` · ${route.name}` : ""}`,
    ])
  );
  const buses = new Map(
    tripLogData.buses.map(bus => [bus.id, bus.code || bus.id])
  );

  tripLogData.trips.forEach(trip => {
    if (trip.routeId && !routes.has(trip.routeId)) {
      routes.set(trip.routeId, trip.routeName || "Deleted route");
    }
    if (trip.busId && !buses.has(trip.busId)) {
      buses.set(trip.busId, trip.busCode || trip.busId);
    }
  });

  return {
    routes: [...routes.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => `
        <option value="${escapeHtml(id)}" ${tripLogFilters.routeId === id ? "selected" : ""}>
          ${escapeHtml(label)}
        </option>
      `)
      .join(""),
    buses: [...buses.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => `
        <option value="${escapeHtml(id)}" ${tripLogFilters.busId === id ? "selected" : ""}>
          ${escapeHtml(label)}
        </option>
      `)
      .join(""),
  };
}

function renderTripLogsPage() {
  const options = renderFilterOptions();
  const filtered = getFilteredTrips();

  return `
    <div class="space-y-4 slide-in">
      <section class="rounded-2xl bg-gradient-to-br from-qc-blue to-qc-blue-accent p-5 text-white shadow-lg">
        <p class="text-xs uppercase tracking-wider opacity-80">Trip history</p>
        <h2 class="mt-1 text-2xl font-bold">Trip Logs</h2>
        <p class="mt-1 text-xs opacity-80">Review bus activity, routes, timing, and passenger counts.</p>
      </section>

      <section class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <p id="tripLogMetricCount" class="text-xl font-bold text-gray-800">${filtered.length}</p>
          <p class="text-[11px] text-gray-500">Matching trips</p>
        </div>
        <div class="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <p id="tripLogMetricActive" class="text-xl font-bold text-green-600">${filtered.filter(trip => getTripStatus(trip) === "active").length}</p>
          <p class="text-[11px] text-gray-500">Active</p>
        </div>
        <div class="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <p id="tripLogMetricEnded" class="text-xl font-bold text-qc-blue">${filtered.filter(trip => getTripStatus(trip) === "ended").length}</p>
          <p class="text-[11px] text-gray-500">Ended</p>
        </div>
        <div class="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <p id="tripLogMetricBoarded" class="text-xl font-bold text-qc-blue">${filtered.reduce((total, trip) => total + (Number(trip.totalIn) || 0), 0)}</p>
          <p class="text-[11px] text-gray-500">Boarded</p>
        </div>
      </section>

      <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Filter trips</h3>
            <p class="mt-0.5 text-xs text-gray-400">Filter by route, bus, status, date, or search.</p>
          </div>
          <button type="button" id="tripLogClearFilters" class="shrink-0 text-xs font-semibold text-qc-blue-accent hover:underline">
            Clear
          </button>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label class="text-xs font-medium text-gray-600">
            Route
            <select id="tripLogRoute" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">All routes</option>
              ${options.routes}
            </select>
          </label>
          <label class="text-xs font-medium text-gray-600">
            Bus
            <select id="tripLogBus" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">All buses</option>
              ${options.buses}
            </select>
          </label>
          <label class="text-xs font-medium text-gray-600">
            Status
            <select id="tripLogStatus" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="all" ${tripLogFilters.status === "all" ? "selected" : ""}>All statuses</option>
              <option value="active" ${tripLogFilters.status === "active" ? "selected" : ""}>Active</option>
              <option value="ended" ${tripLogFilters.status === "ended" ? "selected" : ""}>Ended</option>
            </select>
          </label>
          <label class="text-xs font-medium text-gray-600">
            From
            <input id="tripLogFrom" type="date" value="${escapeHtml(tripLogFilters.from)}" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          </label>
          <label class="text-xs font-medium text-gray-600">
            To
            <input id="tripLogTo" type="date" value="${escapeHtml(tripLogFilters.to)}" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          </label>
          <label class="text-xs font-medium text-gray-600">
            Search
            <input id="tripLogSearch" type="search" value="${escapeHtml(tripLogFilters.search)}" placeholder="Bus, route, conductor, trip ID" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          </label>
        </div>
      </section>

      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-800">Trip records</h3>
        <span id="tripLogResultCount" class="text-xs text-gray-500">${filtered.length} trips</span>
      </div>
      <div id="tripLogResults" class="space-y-3"></div>
    </div>
  `;
}

function applyTripLogFilters() {
  tripLogsPage = 1;
  tripLogFilters = {
    routeId: document.getElementById("tripLogRoute")?.value || "",
    busId: document.getElementById("tripLogBus")?.value || "",
    status: document.getElementById("tripLogStatus")?.value || "all",
    from: document.getElementById("tripLogFrom")?.value || "",
    to: document.getElementById("tripLogTo")?.value || "",
    search: document.getElementById("tripLogSearch")?.value || "",
  };
  renderTripResults();
}

async function initTripLogsPage() {
  stopTripLogsListener();
  const loadGeneration = tripLogsLoadGeneration;

  try {
    const [routes, buses] = await Promise.all([
      window.Store.getRoutes(),
      window.Store.getBuses(),
    ]);

    if (
      loadGeneration !== tripLogsLoadGeneration ||
      window.AppState.currentPage !== "tripLogs"
    ) {
      return;
    }

    tripLogData = { trips: [], routes, buses };
    document.getElementById("content").innerHTML = renderTripLogsPage();
    document.getElementById("tripLogResults").innerHTML = `
      <div class="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <p class="text-sm font-medium text-gray-700">Loading trip history…</p>
      </div>
    `;
    initTripLogFilterListeners();

    unsubscribeTripLogs = listenToTripsRepo(
      (trips) => {
        if (
          loadGeneration !== tripLogsLoadGeneration ||
          window.AppState.currentPage !== "tripLogs"
        ) {
          return;
        }

        tripLogData.trips = trips;
        renderTripResults();
      },
      (error) => {
        console.error("Trip log listener failed:", error);
        window.showToast("Failed to keep trip logs up to date.", "error");
      }
    );
  } catch (error) {
    console.error("Failed to load trip logs:", error);
    if (
      loadGeneration === tripLogsLoadGeneration &&
      window.AppState.currentPage === "tripLogs"
    ) {
      document.getElementById("content").innerHTML = `
        <div class="rounded-2xl border border-red-100 bg-white p-8 text-center">
          <p class="text-sm font-semibold text-red-700">Unable to load trip logs</p>
          <p class="mt-1 text-xs text-gray-500">Please check your connection and try again.</p>
          <button type="button" onclick="window.initTripLogsPage()" class="mt-4 rounded-lg bg-qc-blue-accent px-4 py-2 text-xs font-semibold text-white">
            Retry
          </button>
        </div>
      `;
    }
  }
}

function stopTripLogsListener() {
  tripLogsLoadGeneration += 1;
  if (unsubscribeTripLogs) {
    unsubscribeTripLogs();
    unsubscribeTripLogs = null;
  }
}

function initTripLogFilterListeners() {
  ["tripLogRoute", "tripLogBus", "tripLogStatus", "tripLogFrom", "tripLogTo"]
    .forEach(id => {
      document.getElementById(id)?.addEventListener("change", applyTripLogFilters);
    });
  document.getElementById("tripLogSearch")
    ?.addEventListener("input", applyTripLogFilters);
  document.getElementById("tripLogClearFilters")
    ?.addEventListener("click", () => {
      tripLogFilters = {
        routeId: "",
        busId: "",
        status: "all",
        from: "",
        to: "",
        search: "",
      };
      tripLogsPage = 1;
      document.getElementById("content").innerHTML = renderTripLogsPage();
      initTripLogFilterListeners();
      renderTripResults();
    });
}

window.Pages = window.Pages || {};
window.Pages.tripLogs = function () {
  return `
    <div class="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
      <p class="text-sm font-medium text-gray-700">Loading trip history…</p>
    </div>
  `;
};
window.initTripLogsPage = initTripLogsPage;
window.stopTripLogsListener = stopTripLogsListener;
