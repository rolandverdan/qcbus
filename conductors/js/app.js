import { requireRole } from "../../shared/js/auth.js";
import { signOutUser } from "../../shared/js/repositories/auth.repo.js";
import "../../shared/js/loading.js";

import {
  getBusByConductorIdRepo,
} from "../../shared/js/repositories/buses.repo.js";

import {
  getRoutesRepo,
} from "../../shared/js/repositories/routes.repo.js";

import {
  getStopsRepo,
} from "../../shared/js/repositories/stops.repo.js";

import { getEta } from "../../shared/js/eta.js";

const session = await requireRole("conductor");

if (!session) {
  throw new Error("Conductor authentication required.");
}

const { user, profile } = session;

// ==================================================
// APP STATE — CONDUCTOR
// ==================================================
const AppState = {
  currentPage: 'trip',
  conductor: {
    name: profile.name || user.displayName || 'Conductor',
    id: profile.uid || user.uid,
    email: user.email || '',
  },
  bus: {
    id: null,
    documentId: null,
    route: 'No route assigned',
    routeId: null,
    routeGeometry: null,
    plateNumber: '',
    capacity: 45,
    staffId: null,
    lat: null,
    lng: null,
    speedKmh: null,
    locationUpdatedAt: null,
  },
  trip: {
    active: false,
    startedAt: null,
    endedAt: null,
    tripId: null,
  },
  occupancy: {
    onboard: 0,     // currently inside
    totalIn: 0,     // total boarded this trip
    totalOut: 0,    // total alighted this trip
    capacity: 45,
  },
  dropoffRequests: [],
  routeStops: [],
  currentAlightStopId: null,
  history: [], // events: { type: 'in'|'out', time, source }
  sos: {
    active: false,
    lastTriggered: null,
    type: null,
  },
};

// ==================================================
// PAGE TEMPLATES
// ==================================================
function getDropoffCounts() {
  return Object.values(
    AppState.dropoffRequests.reduce((counts, request) => {
      if (request.status === "alighted") return counts;

      const key = request.stopId || request.stopName;
      if (!key) return counts;

      if (!counts[key]) {
        counts[key] = {
          id: request.stopId || "",
          name: request.stopName || "Selected stop",
          order: Number(request.stopOrder) || 0,
          count: 0,
        };
      }

      counts[key].count += 1;
      return counts;
    }, {})
  ).sort((a, b) => a.order - b.order);
}

function renderConductorEta() {
  const stop = AppState.routeStops.find(
    (routeStop) => routeStop.id === AppState.currentAlightStopId
  );

  if (!stop) {
    return `
      <span class="text-sm font-semibold text-gray-700">Waiting for location</span>
      <span class="text-xs text-gray-500">Nearest stop and ETA appear when GPS is available</span>
    `;
  }

  const eta = getEta(AppState.bus, stop);
  return `
    <span class="text-sm font-semibold text-gray-800">${escapeTripText(eta.label)}</span>
    <span class="text-xs text-gray-500">${escapeTripText(eta.detail)}</span>
  `;
}

function updateConductorEta() {
  const stop = AppState.routeStops.find(
    (routeStop) => routeStop.id === AppState.currentAlightStopId
  );
  const expected = AppState.dropoffRequests.filter(
    (request) =>
      request.stopId === AppState.currentAlightStopId &&
      request.status !== "alighted"
  ).length;
  const nameElement = document.getElementById("currentStopName");
  const countElement = document.getElementById("currentStopExpected");
  const etaElement = document.getElementById("currentStopEta");

  if (nameElement) {
    nameElement.textContent = stop?.name || "Waiting for location";
  }
  if (countElement) {
    countElement.textContent = `${expected} expected`;
  }
  if (etaElement) etaElement.innerHTML = renderConductorEta();
}

const Pages = {

  // ---------- TRIP PAGE ----------
  trip: () => {
    const t = AppState.trip;
    const active = t.active;

    return `
    <div class="space-y-4 slide-in">

      <!-- Trip status card -->
      <div class="rounded-2xl p-5 shadow-lg text-white ${
        active
          ? 'bg-gradient-to-br from-qc-green to-emerald-600'
          : 'bg-gradient-to-br from-qc-blue to-qc-blue-accent'
      }">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${active ? 'bg-white animate-pulse' : 'bg-white/50'}"></span>
            <span class="text-xs font-medium tracking-wide uppercase">${active ? 'Trip in progress' : 'No active trip'}</span>
          </div>
          <span class="text-xs opacity-80">${AppState.bus.id}</span>
        </div>

        <h2 class="text-2xl font-bold mb-1">${AppState.bus.route}</h2>
        <p class="text-sm opacity-90">${AppState.bus.plateNumber} · Capacity ${AppState.bus.capacity}</p>

        ${active ? `
          <div class="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-xs opacity-75">Started</p>
              <p class="font-semibold">${new Date(t.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>
            </div>
            <div>
              <p class="text-xs opacity-75">Duration</p>
              <p class="font-semibold" id="tripDuration">00:00:00</p>
            </div>
          </div>
        ` : `
          <p class="mt-4 text-xs opacity-80">Press Start Trip to begin counting passengers.</p>
        `}
      </div>

      <!-- Big action button -->
      ${active ? `
        <button onclick="endTrip()" class="w-full py-5 rounded-2xl bg-qc-blue-accent hover:bg-qc-blue text-white font-bold text-lg shadow-lg shadow-blue-200 active:scale-[0.98] transition flex items-center justify-center gap-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/>
          </svg>
          END TRIP
        </button>
      ` : `
        <button onclick="startTrip()" class="w-full py-5 rounded-2xl bg-qc-blue hover:bg-[#082a3d] text-white font-bold text-lg shadow-lg shadow-blue-300  active:scale-[0.98] transition flex items-center justify-center gap-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          START TRIP
        </button>
      `}

      <!-- Live occupancy mini-card -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-800 text-sm">Current Occupancy</h3>
          <span class="text-xs text-gray-400">live</span>
        </div>
        <div class="flex items-end justify-between mb-2">
          <div>
            <p class="text-3xl font-bold text-qc-green leading-none">${AppState.occupancy.onboard}</p>
            <p class="text-xs text-gray-500 mt-1">of ${AppState.bus.capacity} seats</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-500">Load</p>
            <p class="text-sm font-semibold ${loadColor()}">${loadPercent()}%</p>
          </div>
        </div>
        <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div class="h-full ${loadBarColor()} transition-all duration-500" style="width:${loadPercent()}%"></div>
        </div>
      </div>

      <!-- Trip stats -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
          <p class="text-lg font-bold text-qc-green">${AppState.occupancy.totalIn}</p>
          <p class="text-[10px] text-gray-500 uppercase tracking-wide">Boarded</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
          <p class="text-lg font-bold text-qc-blue-accent">${AppState.occupancy.totalOut}</p>
          <p class="text-[10px] text-gray-500 uppercase tracking-wide">Alighted</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
          <p class="text-lg font-bold text-gray-700">${AppState.occupancy.onboard}</p>
          <p class="text-[10px] text-gray-500 uppercase tracking-wide">Onboard</p>
        </div>
      </div>

      <!-- Quick jump to counter -->
      <button onclick="navigateTo('counter')" class="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <svg class="w-5 h-5 text-qc-blue-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
          </div>
          <div class="text-left">
            <p class="font-semibold text-sm text-gray-800">Passenger Counter</p>
            <p class="text-xs text-gray-500">Tap to add or remove passengers</p>
          </div>
        </div>
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
    `;
  },

  // ---------- COUNTER PAGE ----------
  counter: () => {
    if (!AppState.trip.active) {
      return `
        <div class="slide-in flex flex-col items-center justify-center py-16 text-center">
          <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h3 class="font-semibold text-gray-800 mb-1">No active trip</h3>
          <p class="text-sm text-gray-500 mb-4 max-w-[240px]">Start a trip first to begin counting passengers.</p>
          <button onclick="navigateTo('trip')" class="px-6 py-2.5 bg-qc-blue-accent text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-200">
            Go to Trip
          </button>
        </div>
      `;
    }

    const { onboard, capacity, totalIn, totalOut } = AppState.occupancy;
    const pct = Math.min(100, Math.round((onboard / capacity) * 100));
    const isFull = onboard >= capacity;
    const dropoffCounts = getDropoffCounts();
    const nearestStop = AppState.routeStops.find(
      (stop) => stop.id === AppState.currentAlightStopId
    );
    const nearestStopExpected = dropoffCounts.find(
      (stop) => stop.id === AppState.currentAlightStopId
    )?.count || 0;
    const expectedDropoffs = dropoffCounts.reduce(
      (total, stop) => total + stop.count,
      0
    );

    return `
    <div class="space-y-4 slide-in">

      <!-- Big counter display -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
        <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Passengers Onboard</p>
        <div class="flex items-baseline justify-center gap-2">
          <span id="bigCount" class="text-6xl font-bold ${isFull ? 'text-qc-red' : 'text-qc-green'} leading-none">${onboard}</span>
          <span class="text-lg text-gray-400 font-medium">/ ${capacity}</span>
        </div>
        <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-4">
          <div class="h-full ${loadBarColor()} transition-all duration-500" style="width:${pct}%"></div>
        </div>
        <p class="text-xs ${loadColor()} font-semibold mt-2">${loadPercent()}% full ${isFull ? '· BUS FULL' : ''}</p>
      </div>

      <div class="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-blue-800">Expected remaining to alight</p>
            <p class="mt-1 text-xs text-blue-700">${expectedDropoffs ? `Across ${dropoffCounts.length} ${dropoffCounts.length === 1 ? "stop" : "stops"}` : "No passengers remaining"}</p>
          </div>
          <span class="text-3xl font-bold leading-none text-qc-blue-accent">${expectedDropoffs}</span>
        </div>
        ${dropoffCounts.length ? `
          <div class="mt-3 divide-y divide-blue-100 border-t border-blue-100">
            ${dropoffCounts.map((stop) => `
              <div class="flex items-center justify-between gap-3 py-2.5 last:pb-0">
                <span class="text-sm text-gray-800">${escapeTripText(stop.name)}</span>
                <span class="shrink-0 text-sm font-bold text-blue-800">${stop.count} ${stop.count === 1 ? "person" : "people"}</span>
              </div>
            `).join("")}
          </div>
        ` : `
          <p class="mt-3 border-t border-blue-100 pt-3 text-xs text-blue-700">Commuter selections will appear here during this trip.</p>
        `}
      </div>

      <div class="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-qc-blue-accent">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21s7-4.35 7-11a7 7 0 10-14 0c0 6.65 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.5" stroke-width="2" />
            </svg>
          </div>
          <div>
            <div class="text-sm font-semibold text-gray-800">Nearest stop</div>
            <p id="currentStopName" class="text-xs text-gray-500">${escapeTripText(nearestStop?.name || "Waiting for location")}</p>
          </div>
          <span id="currentStopExpected" class="ml-auto shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">${nearestStopExpected} expected</span>
        </div>
        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Stop ETA</span>
          <div id="currentStopEta" class="flex flex-col items-end text-right">${renderConductorEta()}</div>
        </div>
      </div>

      <!-- IN / OUT buttons -->
      <div class="grid grid-cols-2 gap-3">
        <button onclick="addPassenger('in')" ${isFull ? 'disabled' : ''} class="aspect-square rounded-2xl bg-qc-green hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-95 text-white shadow-lg shadow-green-200 transition flex flex-col items-center justify-center gap-1">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
          </svg>
          <span class="font-bold text-sm">BOARD +1</span>
          <span class="text-[10px] opacity-80">Entering bus</span>
        </button>

        <button onclick="addPassenger('out')" ${onboard === 0 ? 'disabled' : ''} class="aspect-square rounded-2xl bg-qc-blue-accent hover:bg-qc-blue disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-95 text-white shadow-lg shadow-blue-200 transition flex flex-col items-center justify-center gap-1">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/>
          </svg>
          <span class="font-bold text-sm">EXIT −1</span>
          <span class="text-[10px] opacity-80">Leaving bus</span>
        </button>
      </div>

      <!-- Correction & reset -->
      <div class="grid grid-cols-3 gap-3">
        <button onclick="addPassenger('in', 5)" class="py-2.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition">+5 in</button>
        <button onclick="addPassenger('out', 5)" class="py-2.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition">−5 out</button>
        <button onclick="resetCounter()" class="py-2.5 rounded-xl bg-white border border-red-200 text-xs font-semibold text-qc-red hover:bg-red-50 transition">Reset</button>
      </div>

      <!-- Trip totals -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs text-gray-500 mb-1">Total Boarded</p>
          <p class="text-2xl font-bold text-qc-green">${totalIn}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs text-gray-500 mb-1">Total Alighted</p>
          <p class="text-2xl font-bold text-qc-blue-accent">${totalOut}</p>
        </div>
      </div>

      <!-- Recent activity -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">Recent Activity</h3>
        <div id="activityList" class="space-y-2 max-h-48 overflow-y-auto">
          ${renderActivityList()}
        </div>
      </div>
    </div>
    `;
  },

  // ---------- ALERTS PAGE ----------
  alerts: () => {
    const alerts = AppState.history.slice(0, 20);
    return `
    <div class="space-y-4 slide-in">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-gray-800">Activity Log</h2>
        <button onclick="clearHistory()" class="text-xs text-qc-red font-medium">Clear</button>
      </div>

      ${alerts.length === 0 ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <div class="w-14 h-14 bg-gray-100 rounded-full mx-auto flex items-center justify-center mb-3">
            <svg class="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <p class="text-sm text-gray-500">No activity yet</p>
        </div>
      ` : alerts.map(a => `
        <div class="bg-white rounded-xl border ${a.kind === 'sos' ? 'border-red-200 bg-red-50/40' : 'border-gray-100'} shadow-sm p-3 flex items-center gap-3">
          <div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
            a.kind === 'in' ? 'bg-green-100' :
            a.kind === 'out' ? 'bg-blue-100' :
            a.kind === 'trip' ? 'bg-gray-100' :
            a.kind === 'sos' ? 'bg-red-100' : 'bg-gray-100'
          }">
            ${a.kind === 'in' ? '➕' : ''}
            ${a.kind === 'out' ? '➖' : ''}
            ${a.kind === 'trip' ? '🚌' : ''}
            ${a.kind === 'sos' ? '🚨' : ''}
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium text-gray-800">${a.label}</p>
            <p class="text-xs text-gray-500">${new Date(a.time).toLocaleTimeString()}</p>
          </div>
        </div>
      `).join('')}
    </div>
    `;
  },

  // ---------- ACCOUNT PAGE ----------
  account: () => `
    <div class="space-y-4 slide-in">
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <div class="w-20 h-20 bg-gradient-to-br from-qc-blue to-qc-blue-accent rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              ${(AppState.conductor.name || 'Conductor')
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()}
        </div>
        <h2 class="font-semibold text-gray-800 mt-3">${AppState.conductor.name}</h2>
        <p class="text-xs text-gray-500">${AppState.conductor.id}</p>
        <span class="inline-block mt-2 px-3 py-1 bg-blue-50 text-qc-blue-accent rounded-full text-xs font-semibold">Conductor · On Duty</span>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">Assigned Bus</h3>
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-qc-blue-accent rounded-lg flex items-center justify-center text-white text-xs font-bold">
              ${(AppState.bus.id || 'BUS').split('-')[1] || AppState.bus.id || 'BUS'}
            </div>
            <div>
              <p class="font-medium text-sm text-gray-800">${AppState.bus.id}</p>
              <p class="text-xs text-gray-500">${AppState.bus.route} · ${AppState.bus.plateNumber}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        <button class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="text-sm text-gray-700">Trip History</span>
        </button>
        <button class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="text-sm text-gray-700">Help & Support</span>
        </button>
        <button onclick="logout()" class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          <span class="text-sm text-red-600">End Shift & Logout</span>
        </button>
      </div>
    </div>
  `,
};

function escapeTripText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ==================================================
// HELPERS
// ==================================================
function loadPercent() {
  const { onboard, capacity } = AppState.occupancy;
  return Math.min(100, Math.round((onboard / capacity) * 100));
}
function loadColor() {
  const p = loadPercent();
  if (p >= 100) return 'text-qc-red';
  if (p >= 75) return 'text-yellow-500';
  return 'text-qc-green';
}
function loadBarColor() {
  const p = loadPercent();
  if (p >= 100) return 'bg-qc-red';
  if (p >= 75) return 'bg-yellow-400';
  return 'bg-qc-green';
}

function renderActivityList() {
  const recent = AppState.history.slice(0, 8);
  if (recent.length === 0) {
    return `<p class="text-xs text-gray-400 text-center py-4">No activity yet</p>`;
  }
  return recent.map(a => `
    <div class="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
      <span class="text-gray-700">${a.label}</span>
      <span class="text-gray-400">${new Date(a.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
    </div>
  `).join('');
}

// ==================================================
// NAVIGATION
// ==================================================
async function navigateTo(page) {
  AppState.currentPage = page;
  document.getElementById('content').innerHTML =
    Pages[page] ? await Pages[page]() : '';

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const active = btn.dataset.page === page;
    btn.className = `nav-btn flex flex-col items-center justify-center gap-1 text-xs transition ${
      active ? 'text-qc-blue-accent' : 'text-gray-400'
    }`;
  });

  const titles = {
    trip: 'Conductor Dashboard',
    counter: 'Passenger Counter',
    alerts: 'Activity Log',
    account: 'My Account',
  };
  document.getElementById('pageTitle').textContent = titles[page] || 'Conductor';

  const subTitles = {
    trip:    AppState.trip.active ? 'Trip in progress' : 'Quezon City · No active trip',
    counter: 'Quezon City · Passenger Counter',
    alerts:  'Quezon City · Activity Log',
    account: 'Quezon City · My Account',
  };
  const subEl = document.getElementById('tripStatus');
  if (subEl) subEl.textContent = subTitles[page] || 'Quezon City';

  if (page === 'counter') startCounterTimer();
  else stopCounterTimer();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================================================
// TOAST
// ==================================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  // Reset to base classes (always include opacity-0 so it starts hidden)
  const base =
    "fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg text-white opacity-0 pointer-events-none transition-all duration-300 z-[110]";

  const color =
    type === 'success' ? 'bg-qc-green' :
    type === 'error'   ? 'bg-qc-red' :
    type === 'warn'    ? 'bg-yellow-500' : 'bg-qc-blue-accent';

  // Apply base + color
  toast.className = `${base} ${color}`;
  toast.textContent = message;

  // Force reflow so the transition triggers
  void toast.offsetWidth;

  // Add 'show' class to animate in
  toast.classList.add('show');

  // Clear any previous timer to avoid overlaps
  if (window.__toastTimer) clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

// ==================================================
// LOGOUT
// ==================================================
async function logout() {
  if (AppState.trip.active) {
    if (!confirm('A trip is still active. End it before logging out?')) return;
    endTrip();
  }

  try {
    await signOutUser();
    window.location.replace('/commuters/auth.html');
  } catch (error) {
    console.error('Logout failed:', error);
    showToast('Logout failed', 'error');
  }
}

async function loadConductorData() {
  const staff = await import(
    "../../shared/js/repositories/staff.repo.js"
  );

  const staffMember =
    await staff.getStaffByUidRepo(user.uid);

  if (!staffMember) {
    throw new Error(
      "Your account is not linked to a conductor staff record."
    );
  }

  const bus =
    await getBusByConductorIdRepo(staffMember.id);

  if (!bus) {
    AppState.conductor.name =
      staffMember.name || profile.name || 'Conductor';

    AppState.conductor.id =
      staffMember.id;

    AppState.conductor.email =
      staffMember.email || user.email || '';

    return;
  }

  const routes = await getRoutesRepo();
  const stops = await getStopsRepo();

  const route = bus.routeId
    ? routes.find(r => r.id === bus.routeId)
    : null;

  AppState.conductor.name =
    staffMember.name || profile.name || 'Conductor';

  AppState.conductor.id =
    staffMember.id;

  AppState.conductor.email =
    staffMember.email || user.email || '';

  AppState.bus = {
    id: bus.code || bus.id,
    documentId: bus.id,
    staffId: staffMember.id,
    routeId: bus.routeId || null,
    routeGeometry: route?.geometry || null,
    route: route
      ? `${route.code} · ${route.name}`
      : 'No route assigned',
    plateNumber: bus.plateNumber || '',
    capacity: Number(bus.capacity) || 45,
    lat: bus.lat !== null && bus.lat !== undefined && Number.isFinite(Number(bus.lat))
      ? Number(bus.lat)
      : null,
    lng: bus.lng !== null && bus.lng !== undefined && Number.isFinite(Number(bus.lng))
      ? Number(bus.lng)
      : null,
    speedKmh: bus.speedKmh !== null && bus.speedKmh !== undefined && Number.isFinite(Number(bus.speedKmh))
      ? Number(bus.speedKmh)
      : null,
    locationUpdatedAt: bus.locationUpdatedAt || null,
  };

  AppState.routeStops = stops
    .filter((stop) => stop.routeId === AppState.bus.routeId)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  AppState.occupancy.capacity =
    AppState.bus.capacity;
}

// ==================================================
// INIT
// ==================================================
async function initApp() {
  showLoading();
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.page);
    });
  });

  const sosButton = document.getElementById('sosHeaderBtn');

  if (sosButton) {
    sosButton.addEventListener('click', openSOS);
  }


  try {
    await loadConductorData();
    await restoreActiveTrip();
    await navigateTo('trip');
  } catch (error) {
    console.error('Conductor data load failed:', error);
    showToast(
      error.message || 'Failed to load conductor data',
      'error'
    );
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .catch(err => console.log('SW:', err));
  }
  hideLoading();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}

// Expose globally
window.navigateTo = navigateTo;
window.showToast = showToast;
window.logout = logout;
window.AppState = AppState;
window.Pages = Pages;
window.loadPercent = loadPercent;
window.loadColor = loadColor;
window.loadBarColor = loadBarColor;
window.renderActivityList = renderActivityList;
window.setNearestAlightStop = (stopId) => {
  AppState.currentAlightStopId = stopId || null;
  updateConductorEta();
  window.updateFloatingLiveMap?.();
};
window.updateConductorEta = updateConductorEta;