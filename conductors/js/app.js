import { requireRole } from "../../shared/js/auth.js";
import { signOutUser } from "../../shared/js/repositories/auth.repo.js";
import "../../shared/js/loading.js";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "../../shared/js/firebase.js";

import {
  getBusByConductorIdRepo,
} from "../../shared/js/repositories/buses.repo.js";

import {
  getRoutesRepo,
} from "../../shared/js/repositories/routes.repo.js";

import {
  getStopsRepo,
} from "../../shared/js/repositories/stops.repo.js";

import {
  listenToTripsRepo,
} from "../../shared/js/repositories/trips.repo.js";

import { getEta } from "../../shared/js/eta.js";

const session = await requireRole("conductor");

if (!session) {
  throw new Error("Conductor authentication required.");
}

const { user, profile } = session;
const ACTIVITY_STORAGE_KEY = `qc_conductor_activity_${profile.uid || user.uid}`;

function loadSavedActivity() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.slice(0, 50) : [];
  } catch (error) {
    console.warn("Could not load saved conductor activity:", error);
    return [];
  }
}

function getLocalDateString(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayDateString() {
  return getLocalDateString(new Date());
}

function getYesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

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
  tripDirection: null,
  currentAlightStopId: null,
  history: loadSavedActivity(), // events: { type: 'in'|'out', time, source }
  sos: {
    active: false,
    lastTriggered: null,
    type: null,
  },
  tripHistory: [],
  tripHistoryLoading: true,
  tripHistoryDateFilter: getYesterdayDateString(),
  tripHistoryFilterPreset: 'yesterday',
  tripHistoryPage: 1,
  tripHistoryPageSize: 10,
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

function formatTripDuration(startedAt) {
  if (!startedAt) return "00:00:00";
  const startTime = typeof startedAt === "number" ? startedAt : new Date(startedAt).getTime();
  if (!startTime || isNaN(startTime)) return "00:00:00";
  const ms = Math.max(0, Date.now() - startTime);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function addHistory(kind, label) {
  const item = {
    kind,
    label,
    time: Date.now(),
  };
  if (!Array.isArray(AppState.history)) {
    AppState.history = [];
  }
  AppState.history.unshift(item);
  if (AppState.history.length > 50) {
    AppState.history.length = 50;
  }
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(AppState.history));
  } catch (error) {
    console.warn("Could not save conductor activity:", error);
  }
  return item;
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
          <p class="text-sm font-semibold mt-2 trip-direction-display">${escapeTripText(AppState.trip.directionLabel || `Heading to ${AppState.trip.directionTo || 'destination not set'}`)}</p>
          <div class="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-xs opacity-75">Started</p>
              <p class="font-semibold">${new Date(t.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>
            </div>
            <div>
              <p class="text-xs opacity-75">Duration</p>
              <p class="font-semibold" id="tripDuration">${formatTripDuration(t.startedAt)}</p>
            </div>
          </div>
        ` : `
          <label class="block mt-4 text-xs font-semibold opacity-90" for="tripDirectionSelect">Choose which way this bus is going</label>
          <select id="tripDirectionSelect" class="w-full mt-1 rounded-xl border border-white/30 bg-white text-gray-800 px-3 py-3 text-sm font-semibold" ${AppState.routeStops.length < 2 ? 'disabled' : ''}>
            <option value="">Select destination</option>
            ${AppState.routeStops.length >= 2 ? [
              { from: AppState.routeStops[0], to: AppState.routeStops[AppState.routeStops.length - 1] },
              { from: AppState.routeStops[AppState.routeStops.length - 1], to: AppState.routeStops[0] },
            ].map((direction) => {
              const value = `${direction.from.id}|${direction.to.id}`;
              const label = `${direction.from.name} → ${direction.to.name}`;
              return `<option value="${escapeTripText(value)}" ${AppState.tripDirection && `${AppState.tripDirection.fromId}|${AppState.tripDirection.toId}` === value ? 'selected' : ''}>${escapeTripText(label)}</option>`;
            }).join('') : ''}
          </select>
          ${AppState.routeStops.length < 2 ? '<p class="mt-2 text-xs text-amber-100">This route needs at least two ordered stops before a trip can start.</p>' : ''}
          <p class="mt-3 text-xs opacity-80">Choose the destination so commuters can see which way the bus is heading.</p>
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
            <p id="tripOnboardCount" class="text-3xl font-bold text-qc-green leading-none">${AppState.occupancy.onboard}</p>
            <p class="text-xs text-gray-500 mt-1">of ${AppState.bus.capacity} seats</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-500">Load</p>
            <p id="tripLoadPercent" class="text-sm font-semibold ${loadColor()}">${loadPercent()}%</p>
          </div>
        </div>
        <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div id="tripOccupancyProgress" class="h-full ${loadBarColor()} transition-all duration-500" style="width:${loadPercent()}%"></div>
        </div>
      </div>

      <!-- Trip stats -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
          <p id="tripBoardedCount" class="text-lg font-bold text-qc-green">${AppState.occupancy.totalIn}</p>
          <p class="text-[10px] text-gray-500 uppercase tracking-wide">Boarded</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
          <p id="tripAlightedCount" class="text-lg font-bold text-qc-blue-accent">${AppState.occupancy.totalOut}</p>
          <p class="text-[10px] text-gray-500 uppercase tracking-wide">Alighted</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
          <p id="tripOnboardTotal" class="text-lg font-bold text-gray-700">${AppState.occupancy.onboard}</p>
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
// ---------- SCANNER PAGE ----------
  scanner: () => {
    if (!AppState.trip.active) {
      return `
        <div class="slide-in flex flex-col items-center justify-center py-16 text-center">
          <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg class="w-9 h-9 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M14 5h2l1.5 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.5L8 5h2m2 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>
          </div>
          <h3 class="font-semibold text-gray-800 mb-1">No active trip</h3>
          <p class="text-sm text-gray-500 mb-4 max-w-[240px]">Start a trip first to use the AI Scanner.</p>
          <button onclick="navigateTo('trip')" class="px-6 py-2.5 bg-qc-blue-accent text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-200">
            Go to Trip
          </button>
        </div>
      `;
    }

    return `
    <div class="space-y-4 slide-in flex flex-col items-center mt-2">
        
        <div class="bg-white w-full rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Passengers Onboard</p>
            <p id="scannerCount" class="text-4xl font-bold text-qc-blue-accent">${AppState.occupancy.onboard}</p>
        </div>

        <div class="relative w-full max-w-sm aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-xl flex items-center justify-center border-4 border-slate-800">
            
            <div id="scannerOverlay" class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                <button onclick="startAICamera()" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-8 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] transition active:scale-95">
                    <svg class="w-5 h-5 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5h2l1.5 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.5L8 5h2m2 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>Start Camera
                </button>
                <p class="text-slate-400 mt-4 text-xs">Mount phone before starting</p>
            </div>

            <video id="aiVideo" autoplay playsinline muted class="absolute inset-0 w-full h-full object-cover hidden"></video>
            <canvas id="aiCanvas" class="absolute inset-0 w-full h-full object-cover hidden z-10"></canvas>
        </div>

        <div class="flex items-center gap-2">
            <div id="aiStatus" class="bg-slate-800 text-slate-300 px-5 py-2 rounded-full text-xs font-bold shadow-lg border border-slate-700">
                Camera Off
            </div>
            <button id="switchCamBtn" onclick="switchAICamera()" class="hidden bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-full text-xs font-bold shadow-lg border border-slate-700 transition active:scale-95" title="Switch Camera">
                <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7v5h-5M4 17v-5h5m-3.5-3A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3"/></svg>Switch Camera
            </button>
        </div>

        <!-- Scanner Line Adjustment Controls -->
        <div class="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            <div>
                <span class="text-xs font-bold text-gray-700 uppercase tracking-wider">Detection Line</span>
            </div>
            <div class="flex items-center justify-between gap-2">
                <!-- Quick Orientation Presets -->
                <div class="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold gap-1">
                    <button type="button" id="btnLineVert" onclick="setScannerLineOrientation('vertical')" class="px-2.5 py-1 rounded-lg transition text-gray-600 hover:text-gray-900">
                        Vertical (|)
                    </button>
                    <button type="button" id="btnLineHoriz" onclick="setScannerLineOrientation('horizontal')" class="px-2.5 py-1 rounded-lg transition text-gray-600 hover:text-gray-900">
                        Horizontal (—)
                    </button>
                </div>
                <button type="button" onclick="resetScannerLine()" class="shrink-0 px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 font-semibold text-[11px] transition active:scale-95">
                    Reset to default
                </button>
            </div>

            <!-- Angle Adjustment Slider Bar -->
            <div class="space-y-1">
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <span>Line Angle</span>
                    <span id="lineAngleLabel" class="font-bold text-qc-blue-accent">90° (Vertical)</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-gray-400 font-medium">0°</span>
                    <input type="range" id="lineAngleSlider" min="0" max="180" value="90" step="1" 
                           oninput="onScannerAngleChange(this.value)"
                           class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-qc-blue-accent">
                    <span class="text-[10px] text-gray-400 font-medium">180°</span>
                </div>
            </div>

            <!-- Position Adjustment Slider Bar -->
            <div class="space-y-1">
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <span>Line Position</span>
                    <span id="lineOffsetLabel" class="font-bold text-qc-blue-accent">Center</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-gray-400 font-medium">-50%</span>
                    <input type="range" id="lineOffsetSlider" min="-50" max="50" value="0" step="1" 
                           oninput="onScannerOffsetChange(this.value)"
                           class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-qc-blue-accent">
                    <span class="text-[10px] text-gray-400 font-medium">+50%</span>
                </div>
            </div>
            
            <!-- Invert Direction Button -->
            <div class="pt-2 flex items-center justify-between border-t border-gray-100 text-xs">
                <span class="text-gray-500">Boarding Direction:</span>
                <button type="button" id="btnInvertDir" onclick="toggleScannerDirection()" class="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold rounded-lg border border-gray-200 transition text-[11px] flex items-center gap-1 active:scale-95">
                    <span id="directionLabel">Normal</span> ⇄
                </button>
            </div>
        </div>
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
          <span id="counterCapacity" class="text-lg text-gray-400 font-medium">/ ${capacity}</span>
        </div>
        <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-4">
          <div id="counterOccupancyProgress" class="h-full ${loadBarColor()} transition-all duration-500" style="width:${pct}%"></div>
        </div>
        <p id="counterLoadLabel" class="text-xs ${loadColor()} font-semibold mt-2">${loadPercent()}% full ${isFull ? '· BUS FULL' : ''}</p>
      </div>

      <div class="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-blue-800">Expected remaining to alight</p>
            <p class="mt-1 text-xs text-blue-700">${expectedDropoffs ? `Across ${dropoffCounts.length} ${dropoffCounts.length === 1 ? "stop" : "stops"}` : "No passengers remaining"}</p>
          </div>
        <span id="expectedDropoffTotal" class="text-3xl font-bold leading-none text-qc-blue-accent">${expectedDropoffs}</span>
        </div>
        ${dropoffCounts.length ? `
          <div id="dropoffRequestsList" class="mt-3 divide-y divide-blue-100 border-t border-blue-100">
            ${dropoffCounts.map((stop) => `
              <div class="flex items-center justify-between gap-3 py-2.5 last:pb-0">
                <span class="text-sm text-gray-800">${escapeTripText(stop.name)}</span>
                <span class="shrink-0 text-sm font-bold text-blue-800">${stop.count} ${stop.count === 1 ? "person" : "people"}</span>
              </div>
            `).join("")}
          </div>
        ` : `
          <p id="dropoffRequestsList" class="mt-3 border-t border-blue-100 pt-3 text-xs text-blue-700">Commuter selections will appear here during this trip.</p>
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
          <p id="counterTotalIn" class="text-2xl font-bold text-qc-green">${totalIn}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs text-gray-500 mb-1">Total Alighted</p>
          <p id="counterTotalOut" class="text-2xl font-bold text-qc-blue-accent">${totalOut}</p>
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
        <h2 class="font-semibold text-gray-800">Logs</h2>
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
            ${a.kind === 'in' ? '<svg class="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14m-7-7h14"/></svg>' : ''}
            ${a.kind === 'out' ? '<svg class="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14"/></svg>' : ''}
            ${a.kind === 'trip' ? '<svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 13V6a1 1 0 0 1 1-1h9l3 4h4a1 1 0 0 1 1 1v8h-2m-12 0H5a2 2 0 1 1-4 0m4 0h9m3 0a2 2 0 1 1-4 0m-5-7h4m-4 3h4"/></svg>' : ''}
            ${a.kind === 'sos' ? '<svg class="w-5 h-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>' : ''}
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
        <button onclick="navigateTo('tripHistory')" class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition text-left group">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-gray-400 group-hover:text-qc-blue-accent transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div>
              <span class="text-sm font-medium text-gray-700 block">Trip History</span>
              <span class="text-[11px] text-gray-400 block">View official archived trip logs</span>
            </div>
          </div>
          <svg class="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
        <button onclick="openHelpSupportModal()" class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition text-left group">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-gray-400 group-hover:text-qc-blue-accent transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div>
              <span class="text-sm font-medium text-gray-700 block">Help & Support</span>
              <span class="text-[11px] text-gray-400 block">App guide, hotlines & QC E-Services</span>
            </div>
          </div>
          <svg class="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
        <button onclick="logout()" class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          <span class="text-sm text-red-600 font-medium">End Shift & Logout</span>
        </button>
      </div>
    </div>
  `,

  // ---------- TRIP HISTORY PAGE ----------
  tripHistory: () => {
    const filtered = getFilteredTripHistory();
    const preset = AppState.tripHistoryFilterPreset || "yesterday";

    return `
    <div class="space-y-4 slide-in">
      <!-- Audit lock indicator -->
      <div class="flex items-center justify-end">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          Permanent Records
        </div>
      </div>

      <!-- Filter Controls Card -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-qc-blue-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
              </svg>
              My Trip Records
            </h3>
            <p class="text-[11px] text-gray-500 mt-0.5">Your official trips and passenger counts</p>
          </div>
          <span class="text-xs text-qc-blue-accent font-semibold px-2.5 py-1 bg-blue-50 rounded-lg" id="tripHistoryResultCount">
            ${filtered.length} ${filtered.length === 1 ? "trip" : "trips"}
          </span>
        </div>

        <!-- Quick filter preset pills -->
        <div class="flex items-center gap-2 overflow-x-auto pb-1">
          <button onclick="setTripHistoryFilterPreset('all')"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              preset === "all"
                ? "bg-qc-blue-accent text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }">
            All Dates
          </button>
          <button onclick="setTripHistoryFilterPreset('today')"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              preset === "today"
                ? "bg-qc-blue-accent text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }">
            Today
          </button>
          <button onclick="setTripHistoryFilterPreset('yesterday')"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              preset === "yesterday"
                ? "bg-qc-blue-accent text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }">
            Yesterday
          </button>
        </div>

        <!-- Date input picker -->
        <div>
          <label class="block text-[11px] font-medium text-gray-400 mb-1">Pick a specific date</label>
          <div class="relative">
            <input
              type="date"
              id="tripHistoryDateInput"
              value="${AppState.tripHistoryDateFilter || ""}"
              onchange="onTripHistoryDateInputChange(this.value)"
              class="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-qc-blue-accent/20 focus:border-qc-blue-accent transition"
            />
            ${
              AppState.tripHistoryDateFilter
                ? `
              <button onclick="setTripHistoryFilterPreset('all')" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 p-1" title="Clear date filter">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 6 12 12M18 6 6 18"/></svg>
              </button>
            `
                : ""
            }
          </div>
        </div>
      </div>

      <!-- Trips List Container -->
      <div id="tripHistoryListContainer" class="space-y-3">
        ${renderTripHistoryList(filtered)}
      </div>
    </div>
    `;
  },
};

function escapeTripText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseTripDate(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val.toMillis === "function") return new Date(val.toMillis());
  if (typeof val.seconds === "number") return new Date(val.seconds * 1000);
  if (typeof val === "number") return new Date(val);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatTripDurationBetween(startDate, endDate) {
  if (!startDate) return "—";
  const start = startDate.getTime();
  const end = endDate ? endDate.getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

function isConductorTrip(trip) {
  if (!trip) return false;
  const myConductorId = AppState.conductor.id;
  const userUid = user?.uid;
  const profileUid = profile?.uid;
  const myName = (AppState.conductor.name || "").trim().toLowerCase();
  const myBusId = AppState.bus.id;
  const myBusDocId = AppState.bus.documentId;
  const myStaffId = AppState.bus.staffId;

  if (myConductorId && trip.conductorId === myConductorId) return true;
  if (userUid && trip.conductorId === userUid) return true;
  if (profileUid && trip.conductorId === profileUid) return true;
  if (myStaffId && trip.conductorId === myStaffId) return true;
  if (myName && trip.conductorName && trip.conductorName.trim().toLowerCase() === myName) return true;
  if (myBusId && (trip.busId === myBusId || trip.busCode === myBusId)) return true;
  if (myBusDocId && (trip.busId === myBusDocId || trip.busCode === myBusDocId)) return true;

  return false;
}

function getFilteredTripHistory() {
  const allTrips = Array.isArray(AppState.tripHistory) ? AppState.tripHistory : [];

  // Exclusively show the conductor's own trips
  let list = allTrips.filter(isConductorTrip);

  if (AppState.tripHistoryDateFilter) {
    list = list.filter((t) => {
      const d =
        parseTripDate(t.startedAt) ||
        parseTripDate(t.endedAt) ||
        parseTripDate(t.updatedAt);
      if (!d) return false;
      return getLocalDateString(d) === AppState.tripHistoryDateFilter;
    });
  }

  list.sort((a, b) => {
    const dateA =
      parseTripDate(a.startedAt) ||
      parseTripDate(a.endedAt) ||
      parseTripDate(a.updatedAt) ||
      new Date(0);
    const dateB =
      parseTripDate(b.startedAt) ||
      parseTripDate(b.endedAt) ||
      parseTripDate(b.updatedAt) ||
      new Date(0);
    return dateB.getTime() - dateA.getTime();
  });

  return list;
}

function renderTripHistoryCard(trip) {
  const startDate = parseTripDate(trip.startedAt);
  const endDate = parseTripDate(trip.endedAt);
  const isActive = trip.status === "active" && !trip.endedAt;

  const dateLabel = startDate
    ? startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown Date";

  const startTimeStr = startDate
    ? startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
  const endTimeStr = endDate
    ? endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : isActive
    ? "Ongoing"
    : "—";
  const timeRange = `${startTimeStr} – ${endTimeStr}`;

  const durationText = formatTripDurationBetween(startDate, endDate);

  const routeName = escapeTripText(
    trip.routeName || trip.route || "Quezon City Bus Route"
  );
  const directionDisplay = escapeTripText(
    trip.directionLabel ||
      (trip.directionFromName && trip.directionToName
        ? `${trip.directionFromName} to ${trip.directionToName}`
        : "Standard Direction")
  );

  const busBadge = escapeTripText(trip.busCode || trip.busId || "BUS");
  const conductorName = escapeTripText(
    trip.conductorName || trip.conductorId || AppState.conductor.name || "Conductor"
  );

  const totalIn = Number(trip.totalIn) || 0;
  const totalOut = Number(trip.totalOut) || 0;
  const onboard = Number(trip.onboard) || 0;
  const capacity = Number(trip.capacity) || 45;

  return `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div class="space-y-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
              isActive
                ? "bg-green-100 text-green-700 animate-pulse"
                : "bg-gray-100 text-gray-700"
            }">
              ${isActive
                ? '<svg class="w-3 h-3" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="currentColor"/></svg>Active Trip'
                : '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="m5 12 4 4L19 6"/></svg>Completed'}
            </span>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-qc-blue-accent border border-blue-100">
              ${busBadge}
            </span>
          </div>
          <h4 class="font-bold text-sm text-gray-900 leading-snug">${routeName}</h4>
          <p class="text-xs text-gray-500 flex items-center gap-1">
            <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
            </svg>
            <span>${directionDisplay}</span>
          </p>
        </div>
        <div class="text-right shrink-0">
          <span class="text-xs font-medium text-gray-500 block">${dateLabel}</span>
          <span class="text-xs font-semibold text-gray-700 block">${durationText}</span>
        </div>
      </div>

      <div class="bg-gray-50 rounded-xl p-2.5 flex items-center justify-between text-xs text-gray-600 gap-2">
        <div class="flex items-center gap-1.5 truncate">
          <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="font-medium">${timeRange}</span>
        </div>
        <div class="text-gray-500 text-[11px] truncate shrink-0 flex items-center gap-1">
          <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          <span>${conductorName}</span>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center pt-1 border-t border-gray-100">
        <div class="p-2 rounded-xl bg-green-50/70 border border-green-100/60">
          <p class="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Boarded</p>
          <p class="text-base font-bold text-qc-green">${totalIn}</p>
        </div>
        <div class="p-2 rounded-xl bg-blue-50/70 border border-blue-100/60">
          <p class="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Alighted</p>
          <p class="text-base font-bold text-qc-blue-accent">${totalOut}</p>
        </div>
        <div class="p-2 rounded-xl bg-purple-50/70 border border-purple-100/60">
          <p class="text-[10px] text-gray-500 font-medium uppercase tracking-wider">${
            isActive ? "Onboard" : "Max Cap"
          }</p>
          <p class="text-base font-bold text-purple-700">${
            isActive ? `${onboard}/${capacity}` : capacity
          }</p>
        </div>
      </div>
    </div>
  `;
}

function renderTripHistoryList(trips) {
  if (AppState.tripHistoryLoading && trips.length === 0) {
    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <div class="w-8 h-8 border-2 border-qc-blue-accent border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p class="text-xs text-gray-500 font-medium">Loading your trip history from database...</p>
      </div>
    `;
  }

  if (trips.length === 0) {
    const isFiltered = Boolean(AppState.tripHistoryDateFilter);
    const filterLabel =
      AppState.tripHistoryFilterPreset === "yesterday"
        ? `yesterday (${AppState.tripHistoryDateFilter})`
        : AppState.tripHistoryFilterPreset === "today"
        ? `today (${AppState.tripHistoryDateFilter})`
        : AppState.tripHistoryDateFilter;

    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <div class="w-14 h-14 bg-blue-50 text-qc-blue-accent rounded-full mx-auto flex items-center justify-center">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
        <div>
          <h4 class="font-bold text-gray-800 text-sm">No trips found</h4>
          <p class="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
            ${
              isFiltered
                ? `No trips recorded for ${filterLabel}. Tap "All Dates" to view all your trips.`
                : "You have no recorded trips yet. Completed and active trips will appear here."
            }
          </p>
        </div>
        ${
          isFiltered
            ? `
          <button onclick="setTripHistoryFilterPreset('all')" class="mt-2 px-4 py-2 bg-qc-blue-accent text-white text-xs font-semibold rounded-xl hover:bg-qc-blue transition">
            View All Dates
          </button>
        `
            : ""
        }
      </div>
    `;
  }

  const totalCount = trips.length;
  const pageSize = AppState.tripHistoryPageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (AppState.tripHistoryPage > totalPages) {
    AppState.tripHistoryPage = totalPages;
  }
  if (AppState.tripHistoryPage < 1) {
    AppState.tripHistoryPage = 1;
  }
  const currentPage = AppState.tripHistoryPage;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const pageTrips = trips.slice(startIndex, endIndex);

  const cardsHtml = pageTrips.map((trip) => renderTripHistoryCard(trip)).join("");

  if (totalCount <= pageSize) {
    return cardsHtml;
  }

  const paginationHtml = `
    <div class="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm mt-3">
      <div class="text-xs text-gray-500 font-medium">
        Showing <span class="font-bold text-gray-800">${startIndex + 1}–${endIndex}</span> of <span class="font-bold text-gray-800">${totalCount}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          onclick="setTripHistoryPage(${currentPage - 1})"
          ${currentPage <= 1 ? "disabled" : ""}
          class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 transition ${
            currentPage <= 1
              ? "opacity-35 cursor-not-allowed bg-gray-50 text-gray-400"
              : "bg-white hover:bg-gray-50 text-gray-700 shadow-sm active:scale-95"
          }"
          aria-label="Previous page"
        >
          ← Prev
        </button>
        <span class="text-xs font-bold text-qc-blue-accent px-2.5 py-1 bg-blue-50 rounded-lg">
          ${currentPage} / ${totalPages}
        </span>
        <button
          onclick="setTripHistoryPage(${currentPage + 1})"
          ${currentPage >= totalPages ? "disabled" : ""}
          class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 transition ${
            currentPage >= totalPages
              ? "opacity-35 cursor-not-allowed bg-gray-50 text-gray-400"
              : "bg-white hover:bg-gray-50 text-gray-700 shadow-sm active:scale-95"
          }"
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  `;

  return `${cardsHtml}${paginationHtml}`;
}

function setTripHistoryPage(page) {
  const filtered = getFilteredTripHistory();
  const pageSize = AppState.tripHistoryPageSize || 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  AppState.tripHistoryPage = Math.max(1, Math.min(Number(page) || 1, totalPages));
  navigateTo("tripHistory");
}

function renderTripHistoryPageDynamic() {
  const container = document.getElementById("tripHistoryListContainer");
  const countEl = document.getElementById("tripHistoryResultCount");
  const filtered = getFilteredTripHistory();

  if (container) {
    container.innerHTML = renderTripHistoryList(filtered);
  }
  if (countEl) {
    countEl.textContent = `${filtered.length} ${
      filtered.length === 1 ? "trip" : "trips"
    }`;
  }
}

function setTripHistoryFilterPreset(preset) {
  AppState.tripHistoryFilterPreset = preset;
  AppState.tripHistoryPage = 1;
  if (preset === "today") {
    AppState.tripHistoryDateFilter = getTodayDateString();
  } else if (preset === "yesterday") {
    AppState.tripHistoryDateFilter = getYesterdayDateString();
  } else if (preset === "all") {
    AppState.tripHistoryDateFilter = "";
  }
  navigateTo("tripHistory");
}

function onTripHistoryDateInputChange(dateStr) {
  AppState.tripHistoryDateFilter = dateStr || "";
  AppState.tripHistoryPage = 1;
  if (!dateStr) {
    AppState.tripHistoryFilterPreset = "all";
  } else if (dateStr === getTodayDateString()) {
    AppState.tripHistoryFilterPreset = "today";
  } else if (dateStr === getYesterdayDateString()) {
    AppState.tripHistoryFilterPreset = "yesterday";
  } else {
    AppState.tripHistoryFilterPreset = "custom";
  }
  navigateTo("tripHistory");
}

function openHelpSupportModal() {
  const modal = document.getElementById("helpSupportModal");
  if (modal) {
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
}

function closeHelpSupportModal() {
  const modal = document.getElementById("helpSupportModal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }
}

function initTripHistoryListener() {
  try {
    listenToTripsRepo(
      (trips) => {
        AppState.tripHistory = Array.isArray(trips) ? trips : [];
        AppState.tripHistoryLoading = false;
        if (AppState.currentPage === "tripHistory") {
          renderTripHistoryPageDynamic();
        }
      },
      (error) => {
        console.error("Trip history listener error:", error);
        AppState.tripHistoryLoading = false;
        if (AppState.currentPage === "tripHistory") {
          renderTripHistoryPageDynamic();
        }
      }
    );
  } catch (error) {
    console.error("Failed to init trip history listener:", error);
    AppState.tripHistoryLoading = false;
  }
}

document.addEventListener("change", (event) => {
  if (event.target?.id !== "tripDirectionSelect") return;
  const [fromId, toId] = event.target.value.split("|");
  AppState.tripDirection = fromId && toId ? { fromId, toId } : null;
});

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
  if (window.stopAICamera) window.stopAICamera();
  AppState.currentPage = page;
  const earlyTitles = {
    trip: 'Conductor Dashboard',
    scanner: 'AI Passenger Scanner',
    counter: 'Passenger Counter',
    alerts: 'Logs',
    account: 'Account',
    tripHistory: 'Trip History',
  };
  const earlySubTitles = {
    trip: 'Quezon City',
    counter: 'Quezon City',
    alerts: 'Quezon City',
    account: 'Quezon City',
    tripHistory: 'Quezon City',
  };
  document.getElementById('pageTitle').textContent = earlyTitles[page] || 'Conductor';
  const earlySubEl = document.getElementById('tripStatus');
  if (earlySubEl) earlySubEl.textContent = earlySubTitles[page] || 'Quezon City';

  document.getElementById('content').innerHTML =
    Pages[page] ? await Pages[page]() : '';

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const active = btn.dataset.page === page;
    btn.className = `nav-btn flex flex-col items-center justify-center gap-1 text-xs transition ${
      active ? 'text-qc-blue-accent font-semibold' : 'text-gray-400'
    }`;
    const label = btn.querySelector('span');
    if (btn.dataset.page === 'trip') {
      btn.classList.add('trip-nav-active');
      label.className = active ? 'font-bold' : '';
    }
  });

  const titles = {
    trip: 'Conductor Dashboard',
    scanner: 'AI Passenger Scanner',
    counter: 'Passenger Counter',
    alerts: 'Logs',
    account: 'Account',
    tripHistory: 'Trip History',
  };
  document.getElementById('pageTitle').textContent = titles[page] || 'Conductor';

  const subTitles = {
    trip: 'Quezon City',
    counter: 'Quezon City',
    alerts: 'Quezon City',
    account: 'Quezon City',
    tripHistory: 'Quezon City',
  };
  const subEl = document.getElementById('tripStatus');
  if (subEl) subEl.textContent = subTitles[page] || 'Quezon City';

  if (page === 'trip' && AppState.trip.active) {
    if (window.startTripTimer) window.startTripTimer();
  }

  if (page === 'scanner') {
    if (window.initScannerControlsUI) window.initScannerControlsUI();
  }

  if (page === 'counter') startCounterTimer();
  else stopCounterTimer();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function refreshCurrentPage() {
  const content = document.getElementById("content");
  const page = AppState.currentPage;
  if (!content || !Pages[page]) return;

  if (page === "tripHistory") {
    renderTripHistoryPageDynamic();
    return;
  }

  if (page === "trip") {
    const active = AppState.trip.active;
    const direction = content.querySelector("#tripDirectionSelect");
    if (direction && !active) return;

    const heading = content.querySelector(".trip-direction-display");
    if (heading) heading.textContent = AppState.trip.directionLabel || "";
  }

  if (page === "counter") {
    const total = content.querySelector("#expectedDropoffTotal");
    const counts = getDropoffCounts();
    const requestList = content.querySelector("#dropoffRequestsList");
    const onboard = content.querySelector("#bigCount");
    const capacity = content.querySelector("#counterCapacity");
    const progress = content.querySelector("#counterOccupancyProgress");
    const loadLabel = content.querySelector("#counterLoadLabel");
    const totalIn = content.querySelector("#counterTotalIn");
    const totalOut = content.querySelector("#counterTotalOut");
    const primaryBoard = content.querySelector('button[onclick="addPassenger(\'in\')"]');
    const primaryExit = content.querySelector('button[onclick="addPassenger(\'out\')"]');
    const isFull = AppState.occupancy.onboard >= AppState.occupancy.capacity;
    if (onboard) {
      onboard.textContent = AppState.occupancy.onboard;
      onboard.classList.toggle("text-qc-red", isFull);
      onboard.classList.toggle("text-qc-green", !isFull);
    }
    if (capacity) capacity.textContent = `/ ${AppState.occupancy.capacity}`;
    if (progress) {
      progress.style.width = `${loadPercent()}%`;
      progress.classList.toggle("bg-qc-red", isFull);
      progress.classList.toggle("bg-qc-green", !isFull && loadPercent() < 75);
      progress.classList.toggle("bg-yellow-400", !isFull && loadPercent() >= 75);
    }
    if (loadLabel) loadLabel.textContent = `${loadPercent()}% full${isFull ? " · BUS FULL" : ""}`;
    if (totalIn) totalIn.textContent = AppState.occupancy.totalIn;
    if (totalOut) totalOut.textContent = AppState.occupancy.totalOut;
    if (primaryBoard) primaryBoard.disabled = isFull;
    if (primaryExit) primaryExit.disabled = AppState.occupancy.onboard === 0;
    if (total) total.textContent = counts.reduce((sum, stop) => sum + stop.count, 0);
    if (requestList) requestList.innerHTML = counts.length ? renderDropoffRequests() : "Commuter selections will appear here during this trip.";
    updateConductorEta();
    return;
  }

  if (page === "trip") {
    const count = content.querySelector("#tripOnboardCount");
    if (count) count.textContent = AppState.occupancy.onboard;
    const boarded = content.querySelector("#tripBoardedCount");
    if (boarded) boarded.textContent = AppState.occupancy.totalIn;
    const alighted = content.querySelector("#tripAlightedCount");
    if (alighted) alighted.textContent = AppState.occupancy.totalOut;
    const onboardTotal = content.querySelector("#tripOnboardTotal");
    if (onboardTotal) onboardTotal.textContent = AppState.occupancy.onboard;
    const progress = content.querySelector("#tripOccupancyProgress");
    if (progress) progress.style.width = `${loadPercent()}%`;
    const load = content.querySelector("#tripLoadPercent");
    if (load) load.textContent = `${loadPercent()}%`;
    const duration = content.querySelector("#tripDuration");
    if (duration && AppState.trip.active) duration.textContent = formatTripDuration(AppState.trip.startedAt);
  }
}

function renderDropoffRequests() {
  return getDropoffCounts().map((stop) => `
    <div class="flex items-center justify-between gap-3 py-2.5 last:pb-0">
      <span class="text-sm text-gray-800">${escapeTripText(stop.name)}</span>
      <span class="shrink-0 text-sm font-bold text-blue-800">${stop.count} ${stop.count === 1 ? "person" : "people"}</span>
    </div>
  `).join("");
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

let unsubscribeConductorBus = null;
let unsubscribeConductorRoutes = null;
let unsubscribeConductorStops = null;

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

  AppState.conductor.name =
    staffMember.name || profile.name || 'Conductor';
  AppState.conductor.id =
    staffMember.id;
  AppState.conductor.email =
    staffMember.email || user.email || '';

  let latestBus = await getBusByConductorIdRepo(staffMember.id);
  let latestRoutes = await getRoutesRepo();
  let latestStops = await getStopsRepo();

  const applyConductorBusRouteStops = (isRealtimeUpdate = false) => {
    if (!latestBus) {
      AppState.bus = {
        id: null,
        documentId: null,
        route: 'No route assigned',
        routeId: null,
        routeGeometry: null,
        plateNumber: '',
        capacity: 45,
        staffId: staffMember.id,
        lat: null,
        lng: null,
        speedKmh: null,
        locationUpdatedAt: null,
      };
      AppState.routeStops = [];
      if (isRealtimeUpdate) {
        window.refreshConductorLiveMapRoute?.();
        window.updateFloatingLiveMap?.();
        refreshCurrentPage();
      }
      return;
    }

    const route = latestBus.routeId
      ? latestRoutes.find((r) => r.id === latestBus.routeId)
      : null;

    const prevRouteId = AppState.bus.routeId;
    const prevBusDocId = AppState.bus.documentId;

    const remoteLat =
      latestBus.lat !== null &&
      latestBus.lat !== undefined &&
      Number.isFinite(Number(latestBus.lat))
        ? Number(latestBus.lat)
        : null;
    const remoteLng =
      latestBus.lng !== null &&
      latestBus.lng !== undefined &&
      Number.isFinite(Number(latestBus.lng))
        ? Number(latestBus.lng)
        : null;
    const remoteSpeed =
      latestBus.speedKmh !== null &&
      latestBus.speedKmh !== undefined &&
      Number.isFinite(Number(latestBus.speedKmh))
        ? Number(latestBus.speedKmh)
        : null;

    AppState.bus = {
      id: latestBus.code || latestBus.id,
      documentId: latestBus.id,
      staffId: staffMember.id,
      routeId: latestBus.routeId || null,
      routeGeometry: route?.geometry || null,
      route: route
        ? `${route.code} · ${route.name}`
        : 'No route assigned',
      plateNumber: latestBus.plateNumber || '',
      capacity: Number(latestBus.capacity) || 45,
      lat: remoteLat ?? AppState.bus.lat ?? null,
      lng: remoteLng ?? AppState.bus.lng ?? null,
      speedKmh: remoteSpeed ?? AppState.bus.speedKmh ?? null,
      locationUpdatedAt: latestBus.locationUpdatedAt || AppState.bus.locationUpdatedAt || null,
    };

    AppState.routeStops = latestStops
      .filter((stop) => stop.routeId === AppState.bus.routeId)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    AppState.occupancy.capacity = AppState.bus.capacity;

    if (isRealtimeUpdate) {
      if (prevBusDocId !== AppState.bus.documentId && window.initActiveTripListener) {
        window.initActiveTripListener();
      }
      if (AppState.trip.active && AppState.bus.documentId) {
        window.startBusLocationTracking?.();
      }
      window.refreshConductorLiveMapRoute?.();
      window.updateFloatingLiveMap?.();
      window.updateConductorEta?.();
      if (prevRouteId !== AppState.bus.routeId && AppState.currentPage === "trip" && !AppState.trip.active) {
        navigateTo("trip");
      } else {
        refreshCurrentPage();
      }
    }
  };

  applyConductorBusRouteStops(false);

  if (unsubscribeConductorBus) unsubscribeConductorBus();
  if (unsubscribeConductorRoutes) unsubscribeConductorRoutes();
  if (unsubscribeConductorStops) unsubscribeConductorStops();

  unsubscribeConductorBus = onSnapshot(
    query(collection(db, "buses"), where("conductorId", "==", staffMember.id)),
    (snapshot) => {
      const docs = snapshot.docs.map((busDoc) => ({
        id: busDoc.id,
        ...busDoc.data(),
      }));
      latestBus = docs[0] || null;
      applyConductorBusRouteStops(true);
    },
    (error) => console.error("Conductor bus listener error:", error)
  );

  unsubscribeConductorRoutes = onSnapshot(
    collection(db, "routes"),
    (snapshot) => {
      latestRoutes = snapshot.docs.map((routeDoc) => ({
        id: routeDoc.id,
        ...routeDoc.data(),
      }));
      applyConductorBusRouteStops(true);
    },
    (error) => console.error("Conductor routes listener error:", error)
  );

  unsubscribeConductorStops = onSnapshot(
    collection(db, "stops"),
    (snapshot) => {
      latestStops = snapshot.docs.map((stopDoc) => ({
        id: stopDoc.id,
        ...stopDoc.data(),
      }));
      applyConductorBusRouteStops(true);
    },
    (error) => console.error("Conductor stops listener error:", error)
  );
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
    if (window.initActiveTripListener) {
      window.initActiveTripListener();
    }
    initTripHistoryListener();
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
window.refreshConductorPage = refreshCurrentPage;
window.loadPercent = loadPercent;
window.loadColor = loadColor;
window.loadBarColor = loadBarColor;
window.renderActivityList = renderActivityList;
window.addHistory = addHistory;
window.formatTripDuration = formatTripDuration;
window.setNearestAlightStop = (stopId) => {
  AppState.currentAlightStopId = stopId || null;
  updateConductorEta();
  window.updateFloatingLiveMap?.();
};
window.updateConductorEta = updateConductorEta;
window.openHelpSupportModal = openHelpSupportModal;
window.closeHelpSupportModal = closeHelpSupportModal;
window.setTripHistoryFilterPreset = setTripHistoryFilterPreset;
window.setTripHistoryPage = setTripHistoryPage;
window.onTripHistoryDateInputChange = onTripHistoryDateInputChange;
