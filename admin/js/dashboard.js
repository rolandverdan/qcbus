// ==================================================
// ADMIN — DASHBOARD
// ==================================================

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
          <div class="flex flex-row-reverse items-center justify-between mb-2">
            <div class="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
              </svg>
            </div>

            <span class="text-sm font-semibold text-gray-700">
              Routes
            </span>
          </div>

          <p class="text-2xl font-bold text-gray-800">
            ${routes.length}
          </p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex flex-row-reverse items-center justify-between mb-2">
            <div class="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
              </svg>
            </div>

            <span class="text-sm font-semibold text-gray-700">
              Buses
            </span>
          </div>

          <p class="text-2xl font-bold text-gray-800">
            ${buses.length}
          </p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex flex-row-reverse items-center justify-between mb-2">
            <div class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>

            <span class="text-sm font-semibold text-gray-700">
              Stops
            </span>
          </div>

          <p class="text-2xl font-bold text-gray-800">
            ${stops.length}
          </p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex flex-row-reverse items-center justify-between mb-2">
            <div class="w-9 h-9 bg-yellow-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>

            <span class="text-sm font-semibold text-gray-700">
              Staff
            </span>
          </div>

          <p class="text-2xl font-bold text-gray-800">
            ${staff.length}
          </p>
        </div>

      </div>

      <!-- Fleet status -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-4">
          Fleet Status
        </h3>

        <div
          class="relative"
          role="group"
          aria-label="Fleet status vertical bar chart"
        >
          <div class="absolute inset-x-0 bottom-6 border-t border-gray-200" aria-hidden="true"></div>
          <div class="relative grid grid-cols-3 gap-3">
            ${statusBar("Active", activeBuses, "bg-qc-green", buses.length)}
            ${statusBar("Idle", idleBuses, "bg-yellow-400", buses.length)}
            ${statusBar("Maintenance", maintenanceBuses, "bg-qc-red", buses.length)}
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
// FLEET STATUS BAR
// ==================================================

function statusBar(label, value, colorClass, total) {
  const height = total ? (value / total) * 82 : 0;
  const minimumBarHeight = value > 0 ? 4 : 0;

  return `
    <div class="flex flex-col items-center">
      <div class="relative flex h-36 w-full items-end justify-center">
        <span
          class="absolute w-full text-center text-sm font-bold text-gray-800"
          style="bottom:${height}%;transform:translateY(-4px)"
        >
          ${value}
        </span>
        <div
          class="w-12 rounded-t-md ${colorClass} transition-all"
          style="height:${height}%;min-height:${minimumBarHeight}px"
        ></div>
      </div>
      <span class="mt-2 text-sm font-medium text-gray-700">${label}</span>
    </div>
  `;
}