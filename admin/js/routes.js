Pages.routes = async function () {
  const routes = await Store.getRoutes();
  const buses = await Store.getBuses();
  const stops = await Store.getStops();

  return `
    <div class="space-y-4 slide-in">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-gray-800">All Routes</h2>

        <button onclick="openRouteModal()" class="px-3 py-1.5 bg-qc-purple text-white text-xs font-semibold rounded-lg shadow-sm hover:bg-qc-purple-dark transition flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
          </svg>
          New Route
        </button>
      </div>

      ${routes.length === 0 ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p class="text-sm text-gray-500 mb-3">No routes yet</p>

          <button onclick="openRouteModal()" class="px-4 py-2 bg-qc-purple text-white text-xs font-semibold rounded-lg">
            Create First Route
          </button>
        </div>
      ` : routes.map(route => {
        const routeStops = stops.filter(s => s.routeId === route.id).length;
        const routeBuses = buses.filter(b => b.routeId === route.id).length;

        return `
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="p-4 flex items-center gap-3">

              <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                   style="background:${route.color}">
                ${escapeHtml(route.code)}
              </div>

              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm text-gray-800 truncate">
                  ${escapeHtml(route.name)}
                </p>

                <p class="text-xs text-gray-500">
                  ${routeStops} stops · ${routeBuses} buses · Free
                </p>
              </div>

              <button onclick="openRouteActions('${route.id}')"
                      class="p-1.5 hover:bg-gray-100 rounded-full transition">

                <svg class="w-5 h-5 text-gray-400"
                     fill="none"
                     stroke="currentColor"
                     viewBox="0 0 24 24">

                  <path stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>

                </svg>
              </button>
            </div>

            <div class="px-4 pb-4 flex gap-2">

              <button onclick="navigateToStops('${route.id}')"
                      class="flex-1 py-2 text-xs font-semibold bg-blue-50 text-qc-blue rounded-lg hover:bg-blue-100 transition">
                Manage Stops
              </button>

              <button onclick="openRouteModal('${route.id}')"
                      class="flex-1 py-2 text-xs font-semibold bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition">
                Edit Route
              </button>

            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
};


// ==================================================
// CREATE / EDIT ROUTE MODAL
// ==================================================
async function openRouteModal(id = null) {

  let route = null;

  if (id) {
    const routes = await Store.getRoutes();
    route = routes.find(r => r.id === id);
  }

  const isEdit = !!route;

  openModal(isEdit ? 'Edit Route' : 'Create Route', `
    <form id="routeForm" class="space-y-4">

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Route Code
        </label>

        <input
          name="code"
          required
          maxlength="6"
          placeholder="R1"
          value="${escapeHtml(route?.code || '')}"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple focus:ring-2 focus:ring-purple-100 outline-none transition uppercase">
      </div>


      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Route Name
        </label>

        <input
          name="name"
          required
          placeholder="QC Hall – Cubao"
          value="${escapeHtml(route?.name || '')}"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple focus:ring-2 focus:ring-purple-100 outline-none transition">
      </div>


      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Color
        </label>

        <div class="flex flex-wrap gap-2">

          ${[
            '#C8102E',
            '#E6007E',
            '#F5B400',
            '#7B2D8E',
            '#F58220',
            '#3AAA35',
            '#1E4B9C',
            '#29ABE2'
          ].map((c) => `
            <label class="cursor-pointer">

              <input
                type="radio"
                name="color"
                value="${c}"
                ${(route?.color || '#C8102E') === c ? 'checked' : ''}
                class="peer sr-only">

              <span
                class="w-8 h-8 rounded-full block ring-offset-2 ring-transparent peer-checked:ring-2 peer-checked:ring-qc-purple transition"
                style="background:${c}">
              </span>

            </label>
          `).join('')}

        </div>
      </div>


      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Description (optional)
        </label>

        <textarea
          name="description"
          rows="2"
          placeholder="Commonwealth Ave corridor"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple focus:ring-2 focus:ring-purple-100 outline-none transition">${escapeHtml(route?.description || '')}</textarea>
      </div>


      <div class="flex gap-3 pt-2">

        <button
          type="button"
          onclick="closeModal()"
          class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm">
          Cancel
        </button>

        <button
          type="submit"
          class="flex-1 py-3 rounded-xl bg-qc-purple text-white font-semibold text-sm shadow-md shadow-purple-200">
          ${isEdit ? 'Save' : 'Create'}
        </button>

      </div>

    </form>
  `);


  document.getElementById('routeForm').addEventListener('submit', async (e) => {

    e.preventDefault();

    const data = Object.fromEntries(new FormData(e.target));

    // Q City Bus is free — force fare to 0
    data.fare = 0;

    try {

      if (isEdit) {

        await Store.updateRoute(id, data);

        showToast('Route updated', 'success');

      } else {

        await Store.addRoute(data);

        showToast('Route created', 'success');

      }

      closeModal();

      await navigateTo('routes');

    } catch (error) {

      console.error('Route save failed:', error);

      showToast('Failed to save route', 'error');

    }

  });
}


// ==================================================
// ROUTE ACTIONS
// ==================================================
async function openRouteActions(id) {

  const routes = await Store.getRoutes();
  const route = routes.find(r => r.id === id);

  if (!route) return;

  openModal(escapeHtml(route.name), `
    <div class="space-y-2">

      <button
        onclick="openRouteModal('${id}')"
        class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl transition text-left">

        <span class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
          ✏️
        </span>

        <span class="text-sm font-medium text-gray-700">
          Edit Route
        </span>

      </button>


      <button
        onclick="closeModal(); navigateToStops('${id}')"
        class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl transition text-left">

        <span class="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
          📍
        </span>

        <span class="text-sm font-medium text-gray-700">
          Manage Bus Stops
        </span>

      </button>


      <button
        onclick="confirmDeleteRoute('${id}')"
        class="w-full p-3 flex items-center gap-3 hover:bg-red-50 rounded-xl transition text-left">

        <span class="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
          🗑️
        </span>

        <span class="text-sm font-medium text-red-600">
          Delete Route
        </span>

      </button>

    </div>
  `);
}


// ==================================================
// DELETE ROUTE
// ==================================================
async function confirmDeleteRoute(id) {

  closeModal();

  const ok = await confirmAction(
    'Delete Route?',
    'This will also remove all its bus stops. This cannot be undone.',
    'Delete'
  );

  if (!ok) return;

  try {

    await Store.deleteRoute(id);

    showToast('Route deleted', 'info');

    await navigateTo('routes');

  } catch (error) {

    console.error('Route delete failed:', error);

    showToast('Failed to delete route', 'error');

  }
}


// ==================================================
// NAVIGATE TO STOPS PAGE
// ==================================================
let currentRouteIdForStops = null;

async function navigateToStops(routeId) {

  currentRouteIdForStops = routeId;

  AppState.currentPage = 'stops';

  document.getElementById('content').innerHTML =
    await Pages.stops(routeId);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.className =
      'nav-btn flex flex-col items-center justify-center gap-1 text-xs text-gray-400 transition';
  });

  const route = await routeById(routeId);

  document.getElementById('pageTitle').textContent =
    'Bus Stops';

  document.getElementById('pageSub').textContent =
    route?.name || '';

  setTimeout(() => initStopsPage(routeId), 50);

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


// ==================================================
// EXPOSE
// ==================================================
window.openRouteModal = openRouteModal;
window.openRouteActions = openRouteActions;
window.confirmDeleteRoute = confirmDeleteRoute;
window.navigateToStops = navigateToStops;