import {
  requireRole,
} from "../../shared/js/auth.js";

import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { getRoutesRepo } from "../../shared/js/repositories/routes.repo.js";

import { db } from "../../shared/js/firebase.js";

import {
  signOutUser,
} from "../../shared/js/repositories/auth.repo.js";

import "../../shared/js/loading.js";

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

window.AppState = {
  currentPage: "home",

  user: {
    uid: user.uid,
    name: profile.name || user.displayName || "Commuter",
    email: profile.email || user.email || "",
    phone: profile.phone || user.phoneNumber || "",
    savedRoutes: ["Route 1", "Route 5"]
  },

  notifications: [],

  settings: {
    notifications: true,
    darkMode: false,
    language: "en",
    autoRefresh: true,
    refreshInterval: 30
  },

  buses: []
};


// ==================================================
// PAGE TEMPLATES
// ==================================================

const Pages = {

  home: () => `
    <div class="space-y-4 slide-in">

      <div class="bg-gradient-to-r from-qc-blue to-blue-700 text-white rounded-xl p-4 shadow-lg">
        <p class="text-sm opacity-90">Good day,</p>

        <h2 class="text-xl font-bold">
          ${AppState.user.name}
        </h2>

        <p class="text-xs opacity-75 mt-1">
          Track your bus in real-time
        </p>
      </div>


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
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>

          </div>

          <span class="text-sm font-medium text-gray-700">
            Live Map
          </span>

        </button>


        <button
          onclick="navigateTo('notifications')"
          class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition"
        >

          <div class="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">

            <svg
              class="w-5 h-5 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>

          </div>

          <span class="text-sm font-medium text-gray-700">
            Arrivals
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

          ${AppState.buses.map(bus => `

            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">

              <div class="flex items-center gap-3">

                <div class="w-10 h-10 bg-qc-blue rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  ${bus.id.split("-")[1]}
                </div>

                <div>

                  <p class="font-medium text-sm text-gray-800">
                    ${bus.route}
                  </p>

                  <p class="text-xs text-gray-500">
                    ${bus.id}
                  </p>

                </div>

              </div>


              <div class="text-right">

                <p class="text-xs font-medium ${
                  bus.status === "On Time"
                    ? "text-green-600"
                    : "text-red-600"
                }">
                  ${bus.status}
                </p>

                <p class="text-xs text-gray-400">
                  ${bus.capacity}
                </p>

              </div>

            </div>

          `).join("")}

        </div>

      </div>


      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">

        <h3 class="font-semibold text-gray-800 mb-3">
          Your Saved Routes
        </h3>

        <div class="flex flex-wrap gap-2">

          ${AppState.user.savedRoutes.map(route => `

            <span class="px-3 py-1.5 bg-blue-50 text-qc-blue rounded-full text-xs font-medium">
              ${route}
            </span>

          `).join("")}

          <button
            class="px-3 py-1.5 border border-dashed border-gray-300 text-gray-400 rounded-full text-xs font-medium hover:border-qc-blue hover:text-qc-blue transition"
          >
            + Add Route
          </button>

        </div>

      </div>

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
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
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

        <h3 class="font-semibold text-gray-800 mb-2 text-sm">
          Active Buses on Map
        </h3>

        <div
          class="flex gap-2 overflow-x-auto pb-1"
          id="busLegend"
        >

          ${AppState.buses.map(bus => `

            <div class="flex-shrink-0 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">

              <p class="text-xs font-medium text-gray-800">
                ${bus.id}
              </p>

              <p class="text-xs text-gray-500">
                ${bus.route}
              </p>

            </div>

          `).join("")}

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


      ${AppState.notifications.map(notif => `

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
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />

              </svg>

            </div>


            <div class="flex-1">

              <div class="flex items-center justify-between">

                <h3
                  class="font-medium text-sm ${
                    notif.read
                      ? "text-gray-700"
                      : "text-gray-900"
                  }"
                >
                  ${notif.title}
                </h3>

                ${
                  !notif.read
                    ? '<span class="w-2 h-2 bg-qc-blue rounded-full"></span>'
                    : ""
                }

              </div>


              <p class="text-xs text-gray-500 mt-1">
                ${notif.message}
              </p>

              <p class="text-xs text-gray-400 mt-1">
                ${notif.time}
              </p>

            </div>

          </div>

        </div>

      `).join("")}

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
          Report a driver, conductor, or fellow passenger. Your report can be anonymous.
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
              <option value="overcharging">Overcharging / fare issue</option>
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


        <!-- Anonymous toggle -->
        <label class="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            name="anonymous"
            class="mt-0.5 w-4 h-4 rounded border-gray-300 text-qc-blue focus:ring-qc-blue"
          >
          <span class="text-xs text-gray-600 leading-relaxed">
            Submit anonymously (we won't include your name or contact info)
          </span>
        </label>


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

          ${
            AppState.user.name
              .split(" ")
              .map(n => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
          }

        </div>


        <h2 class="font-semibold text-gray-800 mt-3">
          ${AppState.user.name}
        </h2>


        <p class="text-sm text-gray-500">
          ${AppState.user.email}
        </p>


        ${
          AppState.user.phone
            ? `
              <p class="text-xs text-gray-400 mt-1">
                ${AppState.user.phone}
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
          <p class="text-lg font-bold text-qc-blue">12</p>
          <p class="text-xs text-gray-500">Rides</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
          <p class="text-lg font-bold text-qc-blue">3</p>
          <p class="text-xs text-gray-500">Routes</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
          <p class="text-lg font-bold text-qc-blue">5</p>
          <p class="text-xs text-gray-500">Favorites</p>
        </div>

      </div>


      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">

        <button
          class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left"
        >
          <span class="text-sm text-gray-700">
            My Favorites
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
  `
};


// ==================================================
// NAVIGATION
// ==================================================

function navigateTo(page) {

  if (!Pages[page]) {
    console.warn("Unknown page:", page);
    return;
  }

  AppState.currentPage = page;

  const content =
    document.getElementById("content");

  if (!content) {
    console.error("Content element not found.");
    return;
  }

  content.innerHTML =
    Pages[page]();


  // ==================================================
  // UPDATE NAV BUTTONS
  // ==================================================

  document
    .querySelectorAll(".nav-btn")
    .forEach(btn => {

      const isActive =
        btn.dataset.page === page;

      btn.classList.toggle(
        "text-qc-blue",
        isActive
      );

      btn.classList.toggle(
        "text-gray-400",
        !isActive
      );

    });


  // ==================================================
  // PAGE TITLE
  // ==================================================

  const titles = {
    home: "QC Bus Tracker",
    map: "Live Map",
    notifications: "Notifications",
    report: "Report",
    settings: "Settings",
    account: "My Account"
  };

  const pageTitle =
    document.getElementById("pageTitle");

  if (pageTitle) {
    pageTitle.textContent =
      titles[page] || "QC Bus Tracker";
  }


  // ==================================================
  // MAP
  // ==================================================

  if (page === "map") {

    setTimeout(() => {

      if (
        typeof window.initMap === "function"
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
    behavior: "smooth"
  });


  // ==================================================
  // HASH
  // ==================================================

  window.location.hash = page;
}


// ==================================================
// SETTINGS
// ==================================================

function toggleSetting(key) {

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
    notification => {
      notification.read = true;
    }
  );

  updateNotifBadge();

  navigateTo("notifications");
}


function updateNotifBadge() {

  const unread =
    AppState.notifications.filter(
      notification => !notification.read
    ).length;

  const badge =
    document.getElementById("notifBadge");

  if (badge) {

    badge.classList.toggle(
      "hidden",
      unread === 0
    );

  }
}


// ==================================================
// REPORT SUBMIT
// ==================================================

async function handleReportSubmit(event) {

  event.preventDefault();

  const form = event.target;

  const data =
    Object.fromEntries(
      new FormData(form)
    );

  const anonymous = data.anonymous === "on";

  const payload = {
    busRoute: data.busRoute,

    role: data.role,

    category: data.category,

    description: data.description,

    anonymous,

    reporterUid:
      anonymous ? null : AppState.user.uid,

    reporterName:
      anonymous ? null : AppState.user.name,

    reporterEmail:
      anonymous ? null : AppState.user.email,

    submittedAt: serverTimestamp()
  };

  const submitBtn =
    form.querySelector('button[type="submit"]');

  const originalText =
    submitBtn.textContent;

  submitBtn.disabled = true;

  submitBtn.textContent = "Submitting…";

  try {

    await addDoc(
      collection(db, "reports"),
      payload
    );

    form.reset();

    showReportToast(
      "Report submitted. Thank you!",
      "success"
    );

  } catch (error) {

    console.error(
      "Failed to submit report:",
      error
    );

    showReportToast(
      "Could not submit report. Please try again.",
      "error"
    );

  } finally {

    submitBtn.disabled = false;

    submitBtn.textContent = originalText;

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
// FIRESTORE BUS LISTENER
// ==================================================

let unsubscribeBuses = null;

async function listenToBuses() {

  if (unsubscribeBuses) {
    unsubscribeBuses();
  }

  const routes = await getRoutesRepo();

  const busesRef = collection(db, "buses");

  unsubscribeBuses = onSnapshot(
    busesRef,
    (snapshot) => {

      AppState.buses =
        snapshot.docs.map((busDoc) => {

          const data = busDoc.data();

          const route = routes.find(
            (r) => r.id === data.routeId
          );

          return {
            id: busDoc.id,

            code: data.code || busDoc.id,

            routeId: data.routeId || null,

            route: route
              ? `${route.code} · ${route.name}`
              : "No route assigned",

            lat: Number(data.lat) || 14.6760,
            lng: Number(data.lng) || 121.0437,

            status: data.status || "idle",

            capacity: Number(data.capacity) || 45,

            driverId: data.driverId || null,
            conductorId: data.conductorId || null,

            tripId: null,
            tripActive: false,

            onboard: 0,
            totalIn: 0,
            totalOut: 0,
          };
        });


      // Refresh current page if it depends on buses
      if (
        AppState.currentPage === "home" ||
        AppState.currentPage === "report"
      ) {
        navigateTo(AppState.currentPage);
      }

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
// INIT
// ==================================================

async function initApp() {
  showLoading();

  // ==================================================
  // LOAD SETTINGS + DATA
  // ==================================================

  listenToBuses();

  if (window.loadNotifications) {
    await window.loadNotifications();
  }


  const saved =
    localStorage.getItem("qcSettings");

  if (saved) {

    try {

      AppState.settings = {
        ...AppState.settings,
        ...JSON.parse(saved)
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


  // ==================================================
  // NAVIGATION EVENT DELEGATION
  // ==================================================

  document.addEventListener(
    "click",
    event => {

      const navButton =
        event.target.closest(".nav-btn");

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


  // ==================================================
  // REPORT FORM SUBMIT DELEGATION
  // ==================================================

  document.addEventListener(
    "submit",
    event => {

      if (
        event.target &&
        event.target.id === "reportForm"
      ) {

        handleReportSubmit(event);

      }

    }
  );


  // ==================================================
  // HEADER NOTIFICATION
  // ==================================================

  const notifBtn =
    document.getElementById("notifBtn");

  if (notifBtn) {

    notifBtn.addEventListener(
      "click",
      () => navigateTo("notifications")
    );

  }


  // ==================================================
  // INITIAL PAGE
  // ==================================================

  const hash =
    window.location.hash.replace("#", "");

  const validPages = [
    "home",
    "map",
    "notifications",
    "report",
    "settings",
    "account"
  ];

  navigateTo(
    validPages.includes(hash)
      ? hash
      : "home"
  );


  // ==================================================
  // NOTIFICATION BADGE
  // ==================================================

  updateNotifBadge();


  // ==================================================
  // SERVICE WORKER
  // ==================================================

  if ("serviceWorker" in navigator) {

    navigator.serviceWorker
      .register("./sw.js")
      .then(reg => {

        console.log(
          "SW registered:",
          reg.scope
        );

      })
      .catch(err => {

        console.log(
          "SW failed:",
          err
        );

      });

  }
  hideLoading();
}


// ==================================================
// IMPORTANT FOR MODULE + TOP-LEVEL AWAIT
// ==================================================

if (document.readyState === "loading") {

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

window.navigateTo = navigateTo;
window.toggleSetting = toggleSetting;
window.markAllRead = markAllRead;
window.logout = logout;
window.AppState = AppState;
window.handleReportSubmit = handleReportSubmit;