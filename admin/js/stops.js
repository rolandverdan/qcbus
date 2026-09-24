Pages.stops = function (routeId) {
  const route = routeById(routeId);
  if (!route) return `<p class="text-sm text-gray-500">Route not found.</p>`;

  const stops = Store.getStopsByRoute(routeId);

  return `
    <div class="space-y-4 slide-in">
      <button onclick="navigateTo('routes')" class="flex items-center gap-1 text-xs text-qc-purple font-semibold">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Routes
      </button>

      <!-- Route banner -->
      <div class="rounded-2xl p-4 text-white shadow-md" style="background:${route.color}">
        <p class="text-xs opacity-90">Route ${escapeHtml(route.code)}</p>
        <h2 class="text-lg font-bold">${escapeHtml(route.name)}</h2>
        <p class="text-xs opacity-80 mt-1">${stops.length} stops · ₱${route.fare} base fare</p>
      </div>

      <!-- Map -->
      <div id="stopsMap" class="w-full h-64 rounded-2xl border border-gray-100 shadow-sm overflow-hidden"></div>

      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-sm text-gray-800">Bus Stops (${stops.length})</h3>
        <button onclick="openAddStopHint('${routeId}')" class="px-3 py-1.5 bg-qc-purple text-white text-xs font-semibold rounded-lg">
          + Add Stop
        </button>
      </div>

      ${stops.length === 0 ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p class="text-sm text-gray-500">No stops yet. Tap + Add Stop to place one on the map.</p>
        </div>
      ` : stops.map((stop, i) => `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0" style="background:${route.color}">
            ${i + 1}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 truncate">${escapeHtml(stop.name)}</p>
            <p class="text-xs text-gray-400">${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}</p>
          </div>
          <button onclick="openStopActions('${stop.id}')" class="p-1.5 hover:bg-gray-100 rounded-full transition">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
            </svg>
          </button>
        </div>
      `).join('')}
    </div>
  `;
};

// ---------- INIT MAP ----------
function initStopsPage(routeId = currentRouteIdForStops) {
  if (!routeId) return;
  const container = document.getElementById('stopsMap');
  if (!container || AppState.map) return;

  const route = routeById(routeId);
  const stops = Store.getStopsByRoute(routeId);
  const center = stops[0]
    ? [stops[0].lat, stops[0].lng]
    : [14.6760, 121.0437];

  AppState.map = L.map('stopsMap', { center, zoom: 12, zoomControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  }).addTo(AppState.map);
  L.control.zoom({ position: 'bottomright' }).addTo(AppState.map);

  // Draw stops
  stops.forEach((stop, i) => {
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${route.color};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)">${i+1}</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13]
    });
    L.marker([stop.lat, stop.lng], { icon }).addTo(AppState.map)
      .bindPopup(`<b>${escapeHtml(stop.name)}</b>`);
  });

  // Draw route line if 2+ stops
  if (stops.length >= 2) {
    L.polyline(stops.map(s => [s.lat, s.lng]), {
      color: route.color, weight: 4, opacity: 0.8,
    }).addTo(AppState.map);
  }

  // If in "pick" mode, set up listener
  applyMapPickMode();
}

// ---------- MAP PICK MODE ----------
function applyMapPickMode() {
  if (!AppState.map) return;
  AppState.map.off('click');
  if (AppState.mapPickMode) {
    AppState.map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (AppState.mapPickMode) AppState.mapPickMode(lat, lng);
    });
    AppState.map.getContainer().style.cursor = 'crosshair';
  } else {
    AppState.map.getContainer().style.cursor = '';
  }
}

// ---------- ADD STOP ----------
function openAddStopHint(routeId) {
  const route = routeById(routeId);
  openModal('Add Bus Stop', `
    <p class="text-xs text-gray-500 mb-4">Pick the location by tapping the map, or enter coordinates manually.</p>

    <div class="mb-3">
      <button onclick="closeModal(); setTimeout(()=>enablePickMode('${routeId}'), 150);" class="w-full py-3 rounded-xl bg-qc-purple text-white text-sm font-semibold">
        🗺️ Pick on Map
      </button>
    </div>

    <div class="flex items-center gap-3 my-3">
      <div class="flex-1 h-px bg-gray-200"></div>
      <span class="text-[11px] text-gray-400">OR</span>
      <div class="flex-1 h-px bg-gray-200"></div>
    </div>

    <form id="stopForm" class="space-y-3">
      <input type="hidden" name="routeId" value="${routeId}">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">Stop Name</label>
        <input name="name" required placeholder="e.g. Fairview Terminal"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Latitude</label>
          <input name="lat" type="number" step="any" required placeholder="14.6760" id="stopLat"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Longitude</label>
          <input name="lng" type="number" step="any" required placeholder="121.0437" id="stopLng"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none">
        </div>
      </div>
      <button type="submit" class="w-full py-3 bg-qc-purple text-white text-sm font-semibold rounded-xl shadow-md shadow-purple-200">
        Add Stop
      </button>
    </form>
  `);

  document.getElementById('stopForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    Store.addStop(data);
    closeModal();
    showToast('Stop added', 'success');
    setTimeout(() => { destroyMap(); navigateToStops(routeId); }, 200);
  });
}

// ---------- PICK MODE ----------
function enablePickMode(routeId) {
  destroyMap();
  setTimeout(() => {
    initStopsPage(routeId);
    setTimeout(() => {
      // Pre-fill form with picked location
      const handle = (lat, lng) => {
        AppState.mapPickMode = null;
        applyMapPickMode();
        openModal('Save Bus Stop', `
          <form id="stopForm2" class="space-y-3">
            <input type="hidden" name="routeId" value="${routeId}">
            <input type="hidden" name="lat" value="${lat}">
            <input type="hidden" name="lng" value="${lng}">
            <div class="bg-purple-50 border border-purple-100 rounded-xl p-3 text-xs text-purple-800 mb-3">
              📍 Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1.5">Stop Name</label>
              <input name="name" required placeholder="e.g. Fairview Terminal" autofocus
                class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none">
            </div>
            <button type="submit" class="w-full py-3 bg-qc-purple text-white text-sm font-semibold rounded-xl shadow-md shadow-purple-200">
              Save Stop
            </button>
          </form>
        `);
        document.getElementById('stopForm2').addEventListener('submit', (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target));
          Store.addStop(data);
          closeModal();
          showToast('Stop added', 'success');
          setTimeout(() => { destroyMap(); navigateToStops(routeId); }, 200);
        });
      };
      AppState.mapPickMode = handle;
      applyMapPickMode();
      showToast('Tap the map to pick a location', 'info');
    }, 200);
  }, 150);
}

// ---------- STOP ACTIONS ----------
function openStopActions(stopId) {
  const stop = Store.getStops().find(s => s.id === stopId);
  if (!stop) return;

  openModal(escapeHtml(stop.name), `
    <div class="space-y-2">
      <button onclick="openEditStop('${stopId}')" class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl transition text-left">
        <span class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">✏️</span>
        <span class="text-sm font-medium text-gray-700">Rename Stop</span>
      </button>
      <button onclick="confirmDeleteStop('${stopId}')" class="w-full p-3 flex items-center gap-3 hover:bg-red-50 rounded-xl transition text-left">
        <span class="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">🗑️</span>
        <span class="text-sm font-medium text-red-600">Delete Stop</span>
      </button>
    </div>
  `);
}

function openEditStop(stopId) {
  const stop = Store.getStops().find(s => s.id === stopId);
  if (!stop) return;

  openModal('Rename Stop', `
    <form id="editStopForm" class="space-y-3">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">Stop Name</label>
        <input name="name" required value="${escapeHtml(stop.name)}"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none">
      </div>
      <button type="submit" class="w-full py-3 bg-qc-purple text-white text-sm font-semibold rounded-xl">
        Save
      </button>
    </form>
  `);

  document.getElementById('editStopForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    Store.updateStop(stopId, data);
    closeModal();
    showToast('Stop renamed', 'success');
    setTimeout(() => { destroyMap(); navigateToStops(stop.routeId); }, 200);
  });
}

async function confirmDeleteStop(stopId) {
  const stop = Store.getStops().find(s => s.id === stopId);
  closeModal();
  const ok = await confirmAction('Delete Stop?', `Remove "${stop.name}" from this route?`, 'Delete');
  if (!ok) return;
  Store.deleteStop(stopId);
  showToast('Stop deleted', 'info');
  setTimeout(() => { destroyMap(); navigateToStops(stop.routeId); }, 200);
}

// ---------- CLEANUP ----------
function destroyMap() {
  if (AppState.map) {
    AppState.map.remove();
    AppState.map = null;
  }
  AppState.mapPickMode = null;
}

// Expose
window.initStopsPage = initStopsPage;
window.openAddStopHint = openAddStopHint;
window.enablePickMode = enablePickMode;
window.openStopActions = openStopActions;
window.openEditStop = openEditStop;
window.confirmDeleteStop = confirmDeleteStop;
window.destroyMap = destroyMap;