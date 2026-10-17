// ==================================================
// QC BUS TRACKER — ADMIN EMERGENCY LOGS & SOS NOTIFIER
// ==================================================

import {
  listenToEmergenciesRepo,
  resolveEmergencyRepo,
  updateEmergencyStatusRepo,
} from "../../shared/js/repositories/emergencies.repo.js";

// State
let allEmergencies = [];
let emergencyLogsPage = 1;
const EMERGENCY_LOGS_PAGE_SIZE = 10;
let emergencyFilters = {
  status: "all",
  type: "all",
  from: "",
  to: "",
  search: "",
};
let isTopBarDismissed = false;
let lastNotifiedActiveId = null;

// Audio Chime Synthesizer via Web Audio API
function playEmergencyChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tone 1: High alert beep (880Hz -> 1175Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.setValueAtTime(1175, now + 0.12);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.4);

    // Tone 2: Follow-up urgent beep
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.25);
    osc2.frequency.setValueAtTime(1175, now + 0.38);
    gain2.gain.setValueAtTime(0.25, now + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.25);
    osc2.stop(now + 0.7);
  } catch (err) {
    console.warn("Emergency alert chime could not play (autoplay policy or unsupported):", err);
  }
}

// Helper: safe timestamp parsing
function getTimestampDate(value) {
  if (!value) return null;
  if (value.toDate && typeof value.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" || typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value && Number.isFinite(value.seconds)) {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatRelativeTime(date) {
  if (!date) return "";
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}

function escapeHtml(value) {
  return window.escapeHtml ? window.escapeHtml(value) : String(value ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[s]));
}

// Emergency Type Styling & Icons
const EMERGENCY_TYPE_CONFIG = {
  medical: {
    label: "Medical Emergency",
    badgeClass: "bg-red-100 text-red-800 border-red-200",
    iconBg: "bg-red-500",
    icon: `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>`,
  },
  accident: {
    label: "Road Accident",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    iconBg: "bg-amber-500",
    icon: `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
  },
  crime: {
    label: "Crime / Theft",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
    iconBg: "bg-purple-600",
    icon: `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`,
  },
  other: {
    label: "Other Emergency",
    badgeClass: "bg-gray-100 text-gray-800 border-gray-200",
    iconBg: "bg-gray-600",
    icon: `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>`,
  },
};

function getEmergencyConfig(type) {
  const key = String(type || "").toLowerCase();
  return EMERGENCY_TYPE_CONFIG[key] || EMERGENCY_TYPE_CONFIG.other;
}

// Top Notification Bar & Sidebar Badge Updates
function updateNotificationBarAndBadges() {
  const activeEmergencies = allEmergencies.filter(e => e.status === "active");
  const count = activeEmergencies.length;

  // Sidebar badge update
  const badge = document.getElementById("emergencyBadge");
  if (badge) {
    if (count > 0) {
      badge.textContent = String(count);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  // Top Notification Bar update
  const topBar = document.getElementById("adminSosNotificationBar");
  const barTitle = document.getElementById("adminSosBarTitle");
  const barSub = document.getElementById("adminSosBarSub");

  if (!topBar) return;

  if (count > 0) {
    const latest = activeEmergencies[0];

    // Trigger audio chime if a brand new active emergency has arrived
    if (latest.id && latest.id !== lastNotifiedActiveId) {
      lastNotifiedActiveId = latest.id;
      isTopBarDismissed = false; // re-open notification bar for new alert
      playEmergencyChime();
    }

    if (!isTopBarDismissed) {
      topBar.classList.remove("hidden");
      const busLabel = latest.busCode || latest.busId || "Bus";
      const config = getEmergencyConfig(latest.type);
      const emergencyLabel = latest.label || config.label;
      const createdDate = getTimestampDate(latest.createdAt);
      const relativeTime = createdDate ? ` · ${formatRelativeTime(createdDate)}` : "";

      if (count === 1) {
        if (barTitle) {
          barTitle.textContent = `Bus ${busLabel} reported ${emergencyLabel}${relativeTime}`;
        }
      } else {
        if (barTitle) {
          barTitle.textContent = `${count} Active SOS Alerts · Latest: Bus ${busLabel} (${emergencyLabel})`;
        }
      }

      if (barSub) {
        const routeText = latest.route ? `Route: ${latest.route}` : "No route specified";
        const conductorText = latest.conductorName ? ` · Conductor: ${latest.conductorName}` : "";
        const occupancyText = latest.occupancy?.onboard !== undefined ? ` · ${latest.occupancy.onboard} onboard` : "";
        barSub.textContent = `${routeText}${conductorText}${occupancyText}`;
      }
    } else {
      topBar.classList.add("hidden");
    }
  } else {
    // No active emergencies
    topBar.classList.add("hidden");
    lastNotifiedActiveId = null;
  }
}

// User dismisses top bar
window.dismissAdminSosNotification = function () {
  isTopBarDismissed = true;
  const topBar = document.getElementById("adminSosNotificationBar");
  if (topBar) topBar.classList.add("hidden");
};

// Filter Emergencies
function getFilteredEmergencies() {
  const fromDate = emergencyFilters.from
    ? new Date(`${emergencyFilters.from}T00:00:00`)
    : null;
  const toDate = emergencyFilters.to
    ? new Date(`${emergencyFilters.to}T23:59:59.999`)
    : null;
  const search = emergencyFilters.search.trim().toLowerCase();

  return allEmergencies.filter((item) => {
    // Status filter
    if (emergencyFilters.status !== "all") {
      if ((item.status || "active").toLowerCase() !== emergencyFilters.status.toLowerCase()) {
        return false;
      }
    }

    // Type filter
    if (emergencyFilters.type !== "all") {
      if ((item.type || "other").toLowerCase() !== emergencyFilters.type.toLowerCase()) {
        return false;
      }
    }

    // Date range filter
    const createdDate = getTimestampDate(item.createdAt);
    if (fromDate && (!createdDate || createdDate < fromDate)) {
      return false;
    }
    if (toDate && (!createdDate || createdDate > toDate)) {
      return false;
    }

    // Search query filter
    if (search) {
      const haystack = [
        item.busCode,
        item.busId,
        item.plateNumber,
        item.route,
        item.tripId,
        item.conductorName,
        item.conductorEmail,
        item.label,
        item.notes,
        item.nearestStop,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(search)) {
        return false;
      }
    }

    return true;
  });
}

// Card Renderer for an Emergency Item
function renderEmergencyCard(item) {
  const isActive = (item.status || "active").toLowerCase() === "active";
  const config = getEmergencyConfig(item.type);
  const createdDate = getTimestampDate(item.createdAt);
  const resolvedDate = getTimestampDate(item.resolvedAt);

  const busCode = item.busCode || item.busId || "Unknown Bus";
  const plate = item.plateNumber ? `Plate: ${item.plateNumber}` : "No plate";
  const routeName = item.route || "No Route Specified";
  const conductorName = item.conductorName || "Not assigned";
  const conductorEmail = item.conductorEmail || "";

  // Occupancy details
  const onboard = Number(item.occupancy?.onboard) || 0;
  const capacity = Number(item.occupancy?.capacity) || 45;
  const totalIn = Number(item.occupancy?.totalIn) || 0;
  const totalOut = Number(item.occupancy?.totalOut) || 0;
  const occupancyPct = Math.min(100, Math.round((onboard / Math.max(capacity, 1)) * 100));

  let occupancyBarColor = "bg-green-500";
  if (occupancyPct >= 85) {
    occupancyBarColor = "bg-red-500";
  } else if (occupancyPct >= 60) {
    occupancyBarColor = "bg-amber-500";
  }

  // GPS Coordinates & Location
  const lat = item.location?.lat;
  const lng = item.location?.lng;
  const hasGps = lat !== null && lat !== undefined && lng !== null && lng !== undefined;
  const speed = item.location?.speedKmh !== null && item.location?.speedKmh !== undefined
    ? `${Math.round(item.location.speedKmh)} km/h`
    : "0 km/h";

  const mapLink = hasGps
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : null;

  return `
    <article class="rounded-2xl border ${isActive ? 'border-red-200 bg-red-50/20' : 'border-gray-100 bg-white'} p-4 sm:p-5 shadow-sm transition hover:shadow-md relative overflow-hidden">
      ${isActive ? `<div class="absolute top-0 left-0 right-0 h-1 bg-red-600"></div>` : ''}

      <!-- Top Header: Emergency Type, Status, and Timestamp -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm">
            ${config.icon}
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-gray-900 text-sm sm:text-base">${escapeHtml(item.label || config.label)}</span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.badgeClass}">
                ${escapeHtml(item.type?.toUpperCase() || "SOS")}
              </span>
            </div>
            <p class="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
              <span>Reported: ${createdDate ? escapeHtml(createdDate.toLocaleString()) : "Just now"}</span>
              ${createdDate ? `<span class="text-gray-400 font-semibold">(${formatRelativeTime(createdDate)})</span>` : ""}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${isActive ? `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white shadow-sm animate-pulse">
              <span class="w-2 h-2 rounded-full bg-white"></span>
              ACTIVE SOS
            </span>
          ` : `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <svg class="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
              RESOLVED
            </span>
          `}
        </div>
      </div>

      <!-- Core Details Grid -->
      <div class="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 border-t border-gray-100 pt-4">
        
        <!-- 1. Bus Details -->
        <div class="bg-gray-50/80 rounded-xl p-3 border border-gray-100">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Bus Details</span>
            <span class="text-[10px] font-bold text-gray-400">BUS</span>
          </div>
          <p class="font-bold text-gray-900 text-sm truncate">${escapeHtml(busCode)}</p>
          <p class="text-xs text-gray-600 font-mono mt-0.5">${escapeHtml(plate)}</p>
          <p class="text-xs text-gray-700 font-medium truncate mt-1">Route: ${escapeHtml(routeName)}</p>
          ${item.tripDirection ? `<p class="text-[11px] text-gray-500">Direction: ${escapeHtml(item.tripDirection)}</p>` : ''}
          ${item.tripId ? `<p class="text-[10px] text-gray-400 font-mono mt-0.5">Trip: ${escapeHtml(item.tripId)}</p>` : ''}
        </div>

        <!-- 2. Conductor Details -->
        <div class="bg-gray-50/80 rounded-xl p-3 border border-gray-100">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Conductor</span>
            <span class="text-[10px] font-bold text-gray-400">STAFF</span>
          </div>
          <p class="font-bold text-gray-900 text-sm truncate">${escapeHtml(conductorName)}</p>
          ${conductorEmail ? `<p class="text-xs text-gray-600 truncate mt-0.5">${escapeHtml(conductorEmail)}</p>` : '<p class="text-xs text-gray-400 mt-0.5">Email not provided</p>'}
          <p class="text-[11px] text-gray-500 mt-1.5">Conductor ID: ${escapeHtml(item.conductorId || 'N/A')}</p>
        </div>

        <!-- 3. Occupancy Data -->
        <div class="bg-gray-50/80 rounded-xl p-3 border border-gray-100">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Bus Occupancy</span>
            <span class="text-xs font-bold text-gray-700">${occupancyPct}%</span>
          </div>
          <div class="flex items-baseline gap-1 mt-0.5">
            <span class="text-base font-extrabold text-gray-900">${onboard}</span>
            <span class="text-xs text-gray-500">/ ${capacity} onboard</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-1.5 mt-1.5 overflow-hidden">
            <div class="${occupancyBarColor} h-1.5 rounded-full" style="width: ${occupancyPct}%"></div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-gray-500 mt-2">
            <span>In: <strong class="text-gray-700">${totalIn}</strong></span>
            <span>Out: <strong class="text-gray-700">${totalOut}</strong></span>
          </div>
        </div>

        <!-- 4. Location & Speed -->
        <div class="bg-gray-50/80 rounded-xl p-3 border border-gray-100 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Location & Speed</span>
              <span class="text-[10px] font-bold text-gray-400">GPS</span>
            </div>
            ${hasGps ? `
              <p class="text-xs font-mono font-medium text-gray-800">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
              <p class="text-xs text-gray-600 mt-0.5">Speed: <strong class="text-gray-800">${speed}</strong></p>
            ` : `
              <p class="text-xs text-gray-400 italic">GPS coordinates unavailable</p>
              <p class="text-xs text-gray-600 mt-0.5">Speed: ${speed}</p>
            `}
          </div>

          <div class="mt-2 pt-1 border-t border-gray-200/50">
            ${hasGps ? `
              <a href="${mapLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-semibold text-qc-blue-accent hover:underline">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                Open in Google Maps
              </a>
            ` : `
              <span class="text-[11px] text-gray-400">No map link</span>
            `}
          </div>
        </div>

      </div>

      <!-- Resolution Footer / Action Buttons -->
      <div class="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div class="text-xs text-gray-500">
          ${!isActive && resolvedDate ? `
            <span class="text-emerald-700 font-medium">
              Resolved by <strong>${escapeHtml(item.resolvedBy || "Admin")}</strong> on ${escapeHtml(resolvedDate.toLocaleString())}
            </span>
          ` : `
            <span class="text-red-600 font-medium flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
              Emergency dispatch in progress
            </span>
          `}
        </div>

        <div class="flex items-center gap-2">
          ${isActive ? `
            <button
              onclick="window.resolveEmergency('${escapeHtml(item.id)}', '${escapeHtml(busCode)}', '${escapeHtml(item.label || config.label)}')"
              class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition active:scale-95 flex items-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>Mark as Resolved</span>
            </button>
            <button
              onclick="window.navigateTo('monitor')"
              class="px-3.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition flex items-center gap-1.5"
            >
              <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <span>Live Monitor</span>
            </button>
          ` : `
            <span class="text-xs text-gray-400 font-medium">Incident Archived</span>
          `}
        </div>
      </div>
    </article>
  `;
}

// Render Results & Metrics on Emergency Logs Page
function renderEmergencyResults() {
  const filtered = getFilteredEmergencies();
  const list = document.getElementById("emergencyResults");
  const countSpan = document.getElementById("emergencyResultCount");

  // Summary Metrics Calculation across all records
  const activeCount = allEmergencies.filter(e => (e.status || "active").toLowerCase() === "active").length;
  const resolvedCount = allEmergencies.filter(e => (e.status || "").toLowerCase() === "resolved").length;
  const medicalCount = allEmergencies.filter(e => (e.type || "").toLowerCase() === "medical").length;
  const accidentCount = allEmergencies.filter(e => ["accident", "crime"].includes((e.type || "").toLowerCase())).length;

  const metricActive = document.getElementById("emergencyMetricActive");
  const metricTotal = document.getElementById("emergencyMetricTotal");
  const metricMedical = document.getElementById("emergencyMetricMedical");
  const metricOther = document.getElementById("emergencyMetricOther");

  if (metricActive) metricActive.textContent = String(activeCount);
  if (metricTotal) metricTotal.textContent = String(allEmergencies.length);
  if (metricMedical) metricMedical.textContent = String(medicalCount);
  if (metricOther) metricOther.textContent = String(accidentCount);

  if (!list) return;

  const pageCount = Math.max(1, Math.ceil(filtered.length / EMERGENCY_LOGS_PAGE_SIZE));
  emergencyLogsPage = Math.min(emergencyLogsPage, pageCount);
  const visibleEmergencies = filtered.slice(
    (emergencyLogsPage - 1) * EMERGENCY_LOGS_PAGE_SIZE,
    emergencyLogsPage * EMERGENCY_LOGS_PAGE_SIZE
  );

  if (countSpan) {
    countSpan.textContent = `${filtered.length} ${filtered.length === 1 ? "incident" : "incidents"}`;
  }

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
        <div class="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3 text-xl">
          <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7l8-4z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12l2 2 4-4"/></svg>
        </div>
        <p class="text-sm font-semibold text-gray-700">No emergency logs found</p>
        <p class="mt-1 text-xs text-gray-400">No incident records match your selected filters.</p>
        <button
          type="button"
          onclick="window.resetEmergencyFilters()"
          class="mt-4 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-semibold transition"
        >
          Reset Filters
        </button>
      </div>
    `;
    return;
  }

  list.innerHTML = `${visibleEmergencies.map(renderEmergencyCard).join("")}${window.renderAdminPagination(emergencyLogsPage, filtered.length, "setEmergencyLogsPage")}`;
}

window.setEmergencyLogsPage = function (page) {
  emergencyLogsPage = page;
  renderEmergencyResults();
};

// Render Emergency Logs Page Base Layout
function renderEmergencyLogsPage() {
  const activeCount = allEmergencies.filter(e => (e.status || "active").toLowerCase() === "active").length;

  return `
    <div class="space-y-5">

      <!-- Header & Quick Actions -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-gray-800">Emergency & SOS Logs</h2>
          <p class="text-xs text-gray-500">Real-time incident records and conductor emergency notifications</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick="window.refreshEmergencyLogs()"
            class="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
          >
            <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <!-- Metric Summary Cards -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        
        <div class="rounded-2xl border ${activeCount > 0 ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-white'} p-4 shadow-sm">
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-gray-500">Active SOS</p>
            ${activeCount > 0 ? `<span class="relative flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span></span>` : ''}
          </div>
          <p id="emergencyMetricActive" class="mt-2 text-2xl font-bold ${activeCount > 0 ? 'text-red-600' : 'text-gray-800'}">${activeCount}</p>
          <p class="mt-1 text-[11px] text-gray-400">Needs attention</p>
        </div>

        <div class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p class="text-xs font-medium text-gray-500">Total Reported</p>
          <p id="emergencyMetricTotal" class="mt-2 text-2xl font-bold text-gray-800">${allEmergencies.length}</p>
          <p class="mt-1 text-[11px] text-gray-400">All-time logs</p>
        </div>

        <div class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p class="text-xs font-medium text-gray-500">Medical Alerts</p>
          <p id="emergencyMetricMedical" class="mt-2 text-2xl font-bold text-red-700">${allEmergencies.filter(e => (e.type || "").toLowerCase() === "medical").length}</p>
          <p class="mt-1 text-[11px] text-gray-400">Health incidents</p>
        </div>

        <div class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p class="text-xs font-medium text-gray-500">Accident / Crime</p>
          <p id="emergencyMetricOther" class="mt-2 text-2xl font-bold text-amber-600">${allEmergencies.filter(e => ["accident", "crime"].includes((e.type || "").toLowerCase())).length}</p>
          <p class="mt-1 text-[11px] text-gray-400">Road & security</p>
        </div>

      </div>

      <!-- Filters Section -->
      <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Filter Incidents</h3>
            <p class="mt-0.5 text-xs text-gray-400">Filter by status, emergency type, date, or search bus & conductor.</p>
          </div>
          <button
            type="button"
            id="emergencyClearFilters"
            onclick="window.resetEmergencyFilters()"
            class="shrink-0 text-xs font-semibold text-qc-blue-accent hover:underline"
          >
            Clear Filters
          </button>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          
          <label class="text-xs font-medium text-gray-600">
            Status
            <select id="emergencyFilterStatus" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-qc-blue focus:ring-1 focus:ring-qc-blue">
              <option value="all" ${emergencyFilters.status === "all" ? "selected" : ""}>All statuses</option>
              <option value="active" ${emergencyFilters.status === "active" ? "selected" : ""}>Active Only</option>
              <option value="resolved" ${emergencyFilters.status === "resolved" ? "selected" : ""}>Resolved Only</option>
            </select>
          </label>

          <label class="text-xs font-medium text-gray-600">
            Emergency Type
            <select id="emergencyFilterType" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-qc-blue focus:ring-1 focus:ring-qc-blue">
              <option value="all" ${emergencyFilters.type === "all" ? "selected" : ""}>All types</option>
              <option value="medical" ${emergencyFilters.type === "medical" ? "selected" : ""}>Medical Emergency</option>
              <option value="accident" ${emergencyFilters.type === "accident" ? "selected" : ""}>Road Accident</option>
              <option value="crime" ${emergencyFilters.type === "crime" ? "selected" : ""}>Crime / Theft</option>
              <option value="other" ${emergencyFilters.type === "other" ? "selected" : ""}>Other Emergency</option>
            </select>
          </label>

          <label class="text-xs font-medium text-gray-600">
            From Date
            <input id="emergencyFilterFrom" type="date" value="${escapeHtml(emergencyFilters.from)}" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-qc-blue focus:ring-1 focus:ring-qc-blue">
          </label>

          <label class="text-xs font-medium text-gray-600">
            To Date
            <input id="emergencyFilterTo" type="date" value="${escapeHtml(emergencyFilters.to)}" class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-qc-blue focus:ring-1 focus:ring-qc-blue">
          </label>

          <label class="text-xs font-medium text-gray-600">
            Search
            <input id="emergencyFilterSearch" type="search" value="${escapeHtml(emergencyFilters.search)}" placeholder="Bus, plate, route, conductor..." class="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-qc-blue focus:ring-1 focus:ring-qc-blue">
          </label>

        </div>
      </section>

      <!-- Results List Header -->
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-800">Incident Logs</h3>
        <span id="emergencyResultCount" class="text-xs text-gray-500">Loading incidents...</span>
      </div>

      <!-- Results Container -->
      <div id="emergencyResults" class="space-y-3">
        <div class="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p class="text-sm font-medium text-gray-700">Loading emergency logs…</p>
        </div>
      </div>

    </div>
  `;
}

// Bind Filter Listeners
function initEmergencyFilterListeners() {
  ["emergencyFilterStatus", "emergencyFilterType", "emergencyFilterFrom", "emergencyFilterTo"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", applyEmergencyFilters);
  });
  document.getElementById("emergencyFilterSearch")?.addEventListener("input", applyEmergencyFilters);
}

function applyEmergencyFilters() {
  emergencyLogsPage = 1;
  emergencyFilters = {
    status: document.getElementById("emergencyFilterStatus")?.value || "all",
    type: document.getElementById("emergencyFilterType")?.value || "all",
    from: document.getElementById("emergencyFilterFrom")?.value || "",
    to: document.getElementById("emergencyFilterTo")?.value || "",
    search: document.getElementById("emergencyFilterSearch")?.value || "",
  };
  renderEmergencyResults();
}

window.resetEmergencyFilters = function () {
  emergencyLogsPage = 1;
  emergencyFilters = {
    status: "all",
    type: "all",
    from: "",
    to: "",
    search: "",
  };
  if (window.AppState?.currentPage === "emergencyLogs") {
    document.getElementById("content").innerHTML = renderEmergencyLogsPage();
    initEmergencyFilterListeners();
    renderEmergencyResults();
  }
};

window.refreshEmergencyLogs = function () {
  renderEmergencyResults();
  window.showToast?.("Emergency logs updated", "info");
};

// Resolve Emergency Action
window.resolveEmergency = async function (id, busCode, label) {
  if (!id) return;
  const confirmed = await window.confirmAction(
    "Resolve Emergency Incident",
    `Are you sure you want to mark the ${label || 'emergency'} for bus ${busCode || ''} as resolved?`,
    "Mark as Resolved"
  );

  if (!confirmed) return;

  try {
    const adminName = window.AppState?.admin?.name || "Admin Dispatch";
    await resolveEmergencyRepo(id, adminName);
    window.showToast?.(`Incident for ${busCode || 'bus'} marked as resolved.`, "success");
  } catch (error) {
    console.error("Failed to resolve emergency:", error);
    window.showToast?.("Failed to resolve emergency incident. Please try again.", "error");
  }
};

// Initialize Emergency Logs Page
window.initEmergencyLogsPage = async function () {
  if (window.AppState?.currentPage !== "emergencyLogs") return;
  document.getElementById("content").innerHTML = renderEmergencyLogsPage();
  initEmergencyFilterListeners();
  renderEmergencyResults();
};

// Pages Registration for Router
window.Pages = window.Pages || {};
window.Pages.emergencyLogs = function () {
  return renderEmergencyLogsPage();
};

// Global Real-time Subscription to Emergencies
listenToEmergenciesRepo(
  (emergencies) => {
    allEmergencies = emergencies || [];
    updateNotificationBarAndBadges();

    // If admin is currently looking at Emergency Logs, update view instantly
    if (window.AppState?.currentPage === "emergencyLogs") {
      renderEmergencyResults();
    }
  },
  (error) => {
    console.error("Global emergency listener error:", error);
  }
);

