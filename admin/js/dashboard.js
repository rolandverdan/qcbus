Pages.dashboard = async function () {
  const routes = await Store.getRoutes();
  const buses = await Store.getBuses();
  const staff = await Store.getStaff();
  const stops = await Store.getStops();

  const activeBuses = buses.filter(b => b.status === 'active').length;
  const idleBuses = buses.filter(b => b.status === 'idle').length;
  const maintenanceBuses = buses.filter(b => b.status === 'maintenance').length;

  const conductors = staff.filter(s => s.role === 'conductor').length;
  const drivers = staff.filter(s => s.role === 'driver').length;

  return `
    <div class="space-y-4 slide-in">

      <!-- Welcome -->
        <div class="bg-gradient-to-br from-qc-blue to-qc-blue-accent text-white rounded-2xl p-5 shadow-lg">
        <p class="text-xs opacity-90">Welcome back,</p>
        <h2 class="text-xl font-bold">${escapeHtml(AppState.admin.name)}</h2>
        <p class="text-xs opacity-80 mt-1">Quezon City Bus Operations</p>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
              </svg>
            </div>
            <span class="text-xs text-gray-400">routes</span>
          </div>
          <p class="text-2xl font-bold text-gray-800">${routes.length}</p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
              </svg>
            </div>
            <span class="text-xs text-gray-400">buses</span>
          </div>
          <p class="text-2xl font-bold text-gray-800">${buses.length}</p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-qc-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <span class="text-xs text-gray-400">stops</span>
          </div>
          <p class="text-2xl font-bold text-gray-800">${stops.length}</p>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 bg-yellow-50 rounded-lg flex items-center justify-center">
              <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <span class="text-xs text-gray-400">staff</span>
          </div>
          <p class="text-2xl font-bold text-gray-800">${staff.length}</p>
        </div>
      </div>

      <!-- Fleet status -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">Fleet Status</h3>
        <div class="space-y-2">
          ${statusRow('Active',      activeBuses,      'bg-qc-green', buses.length)}
          ${statusRow('Idle',        idleBuses,        'bg-yellow-400', buses.length)}
          ${statusRow('Maintenance', maintenanceBuses, 'bg-qc-red', buses.length)}
        </div>
      </div>

      <!-- Staff breakdown -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">Staff Breakdown</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-blue-50 rounded-xl">
            <p class="text-xs text-gray-500">Drivers</p>
            <p class="text-xl font-bold text-qc-blue">${drivers}</p>
          </div>
          <div class="p-3 bg-green-50 rounded-xl">
            <p class="text-xs text-gray-500">Conductors</p>
            <p class="text-xl font-bold text-qc-green">${conductors}</p>
          </div>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">Quick Actions</h3>
        <div class="grid grid-cols-2 gap-3">
          <button onclick="openRouteModal()" class="p-3 rounded-xl border border-gray-100 hover:border-qc-purple hover:bg-purple-50 transition text-left">
            <p class="text-sm font-semibold text-gray-800">+ Add Route</p>
            <p class="text-xs text-gray-500 mt-0.5">Create a new bus route</p>
          </button>
          <button onclick="openBusModal()" class="p-3 rounded-xl border border-gray-100 hover:border-qc-purple hover:bg-purple-50 transition text-left">
            <p class="text-sm font-semibold text-gray-800">+ Add Bus</p>
            <p class="text-xs text-gray-500 mt-0.5">Register a new bus</p>
          </button>
          <button onclick="openStaffModal()" class="p-3 rounded-xl border border-gray-100 hover:border-qc-purple hover:bg-purple-50 transition text-left">
            <p class="text-sm font-semibold text-gray-800">+ Add Staff</p>
            <p class="text-xs text-gray-500 mt-0.5">Driver or conductor</p>
          </button>
          <button onclick="navigateTo('monitor')" class="p-3 rounded-xl border border-gray-100 hover:border-qc-purple hover:bg-purple-50 transition text-left">
            <p class="text-sm font-semibold text-gray-800">Live Monitor</p>
            <p class="text-xs text-gray-500 mt-0.5">See fleet in real time</p>
          </button>
        </div>
      </div>

      <!-- Admin account -->
      <button onclick="logout()" class="w-full py-3 bg-white border border-red-100 text-qc-red text-sm font-semibold rounded-2xl hover:bg-red-50 transition">
        Log Out
      </button>
    </div>
  `;
};

function statusRow(label, value, colorClass, total) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-gray-600">${label}</span>
        <span class="text-xs font-semibold text-gray-700">${value}</span>
      </div>
      <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div class="h-full ${colorClass} transition-all" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}
Pages.monitor = async function () {
  const buses = (await Store.getBuses()).filter(
  b => b.status === 'active'
);

  // Read occupancy broadcast from conductor localStorage
  const liveData = (() => {
    try {
      return JSON.parse(localStorage.getItem('qcBusOccupancy') || 'null');
    } catch {
      return null;
    }
  })();

  // Load routes from Firestore
  const routes = await Store.getRoutes();

  return `
    <div class="space-y-4 slide-in">
      <h2 class="font-semibold text-gray-800">Live Fleet Monitor</h2>

      ${liveData ? `
        <div class="bg-gradient-to-br from-qc-purple to-qc-purple-dark rounded-2xl p-4 text-white shadow-lg">
          <p class="text-xs opacity-90">Currently On Duty</p>
          <p class="text-lg font-bold mt-1">
            ${escapeHtml(liveData.busId)} · ${escapeHtml(liveData.route)}
          </p>

          <div class="mt-3 flex items-end justify-between">
            <div>
              <p class="text-3xl font-bold leading-none">${liveData.onboard}</p>
              <p class="text-xs opacity-80">of ${liveData.capacity} onboard</p>
            </div>

            <div class="text-right text-xs">
              <p>↑ ${liveData.totalIn} boarded</p>
              <p>↓ ${liveData.totalOut} alighted</p>
              <p class="opacity-70 mt-1">
                ${new Date(liveData.lastUpdate).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div class="mt-3 w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              class="h-full bg-white"
              style="width:${liveData.capacity ? Math.min(100, (liveData.onboard / liveData.capacity) * 100) : 0}%"
            ></div>
          </div>
        </div>
      ` : `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p class="text-sm text-gray-500">No bus is currently on duty.</p>
          <p class="text-xs text-gray-400 mt-1">
            Live data appears here when a conductor starts a trip.
          </p>
        </div>
      `}

      <!-- Map -->
      <div
        id="monitorMap"
        class="w-full h-64 rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
      ></div>

      <!-- Active buses list -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-semibold text-sm text-gray-800 mb-3">
          Active Buses (${buses.length})
        </h3>

        ${buses.length === 0 ? `
          <p class="text-xs text-gray-400 text-center py-4">
            No active buses
          </p>
        ` : buses.map(b => {
          const route = routes.find(r => r.id === b.routeId);
          const driver = b.driverId ? staffById(b.driverId) : null;
          const conductor = b.conductorId ? staffById(b.conductorId) : null;
          const isLive = liveData && liveData.busId === b.code;

          return `
            <div class="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <span
                class="w-2 h-2 rounded-full ${
                  isLive
                    ? 'bg-green-500 animate-pulse'
                    : 'bg-gray-300'
                }"
              ></span>

              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-800">
                  ${escapeHtml(b.code)}
                </p>

                <p class="text-xs text-gray-500 truncate">
                  ${
                    route
                      ? escapeHtml(route.code) + ' · ' + escapeHtml(route.name)
                      : 'No route'
                  }
                </p>
              </div>

              <div class="text-right">
                ${
                  isLive
                    ? `<p class="text-xs font-semibold text-qc-green">
                         ${liveData.onboard}/${liveData.capacity}
                       </p>`
                    : '<p class="text-xs text-gray-400">—</p>'
                }

                <p class="text-[10px] text-gray-400">
                  ${driver ? escapeHtml(driver.name) : '—'}
                </p>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- SOS Alerts -->
      <div id="sosSection"></div>
    </div>
  `;
};

async function initMonitorPage() {
  const container = document.getElementById('monitorMap');

  if (!container || AppState.map) return;

  AppState.map = L.map('monitorMap', {
    center: [14.6760, 121.0437],
    zoom: 12,
    zoomControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(AppState.map);

  L.control.zoom({
    position: 'bottomright'
  }).addTo(AppState.map);

  const routes = await Store.getRoutes();
  const buses = await Store.getBuses();

  // Draw all routes
  for (const route of routes) {
    const routeStops = await Store.getStopsByRoute(route.id);

    if (routeStops.length >= 2) {
      L.polyline(
        routeStops.map(s => [s.lat, s.lng]),
        {
          color: route.color,
          weight: 3,
          opacity: 0.3,
        }
      ).addTo(AppState.map);
    }
  }

  // Bus markers
  for (const bus of buses) {
    if (!bus.routeId) continue;

    const routeStops = await Store.getStopsByRoute(bus.routeId);

    if (!routeStops[0]) continue;

    const route = routes.find(r => r.id === bus.routeId);

    const icon = L.divIcon({
      className: '',
      html: `
        <div
          style="
            background:${route?.color || '#7c3aed'};
            color:#fff;
            padding:4px 8px;
            border-radius:8px;
            font-size:10px;
            font-weight:700;
            box-shadow:0 2px 6px rgba(0,0,0,.3)
          "
        >
          ${escapeHtml(bus.code)}
        </div>
      `,
      iconSize: null,
      iconAnchor: [30, 12]
    });

    L.marker(
      [routeStops[0].lat, routeStops[0].lng],
      { icon }
    )
      .addTo(AppState.map)
      .bindPopup(`
        <b>${escapeHtml(bus.code)}</b><br>
        ${escapeHtml(route?.name || '')}
      `);
  }

  // SOS section
  if (typeof renderSOSSection === 'function') {
    renderSOSSection();
  }
}


// Expose
window.Pages.monitor = Pages.monitor;
window.initMonitorPage = initMonitorPage;