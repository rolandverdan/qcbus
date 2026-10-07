import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";
import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/+esm";


// ==================================================
// STOP ORDER STATE
// ==================================================

let stopOrderState = {
  routeId: null,
  original: [],
  current: [],
  dirty: false,
};

let stopSortable = null;


// ==================================================
// STOPS PAGE
// ==================================================

Pages.stops = async function (routeId) {
  const route = await routeById(routeId);

  if (!route) {
    return `
      <p class="text-sm text-gray-500">
        Route not found.
      </p>
    `;
  }

  const stops = await Store.getStopsByRoute(routeId);

  const hasRoadRoute =
    !!route.geometry &&
    stops.length >= 2;

  resetStopOrderState(routeId, stops);

  return `
    <div class="space-y-4 slide-in">

      <!-- BACK -->
      <button
        onclick="navigateTo('routes')"
        class="
          flex
          items-center
          gap-1
          text-xs
          text-qc-purple
          font-semibold
        "
      >
        <svg
          class="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M15 19l-7-7 7-7"
          />
        </svg>

        Back to Routes
      </button>


      <!-- ROUTE HEADER -->
      <div
        class="rounded-2xl p-4 text-white shadow-md"
        style="background:${route.color || '#7c3aed'}"
      >

        <p class="text-xs opacity-90">
          Route ${escapeHtml(route.code)}
        </p>

        <h2 class="text-lg font-bold">
          ${escapeHtml(route.name)}
        </h2>

        <div
          class="
            flex
            flex-wrap
            items-center
            gap-x-3
            gap-y-1
            mt-1
            text-xs
            opacity-80
          "
        >

          <span>
            ${stops.length} stops
          </span>
          ${
            route.distance
              ? `
                <span>·</span>

                <span>
                  ${(Number(route.distance) / 1000).toFixed(1)} km
                </span>
              `
              : ''
          }

          ${
            route.duration
              ? `
                <span>·</span>

                <span>
                  ${formatRouteDuration(route.duration)}
                </span>
              `
              : ''
          }

        </div>

      </div>


      <!-- MAP -->
      <div
        id="stopsMap"
        class="
          w-full
          h-72
          rounded-2xl
          border
          border-gray-100
          shadow-sm
          overflow-hidden
        "
      ></div>


      <!-- ACTIONS -->
      <div
        class="
          flex
          flex-col
          sm:flex-row
          sm:items-center
          sm:justify-between
          gap-3
        "
      >

        <h3 class="font-semibold text-sm text-gray-800">
          Bus Stops (${stops.length})
        </h3>

        <div class="flex gap-2">

          <button
            onclick="generateRoadRoute('${routeId}')"
            ${stops.length < 2 ? 'disabled' : ''}
            class="
              px-3
              py-1.5
              bg-green-600
              text-white
              text-xs
              font-semibold
              rounded-lg
              hover:bg-green-700
              transition
              disabled:opacity-40
              disabled:cursor-not-allowed
            "
          >
            🛣️ ${hasRoadRoute ? 'Regenerate' : 'Generate Route'}
          </button>

          <button
            onclick="openAddStopHint('${routeId}')"
            class="
              px-3
              py-1.5
              bg-qc-purple
              text-white
              text-xs
              font-semibold
              rounded-lg
              hover:bg-qc-purple-dark
              transition
            "
          >
            + Add Stop
          </button>

        </div>

      </div>


      <!-- REORDER BAR -->
      <div
        id="stopOrderBar"
        class="
          hidden
          bg-purple-50
          border
          border-purple-100
          rounded-2xl
          p-3
          items-center
          justify-between
          gap-3
        "
      >

        <div class="flex items-center gap-2 min-w-0">

          <div
            class="
              w-8
              h-8
              rounded-lg
              bg-white
              flex
              items-center
              justify-center
              flex-shrink-0
            "
          >
            ↕️
          </div>

          <div class="min-w-0">

            <p class="text-xs font-semibold text-purple-800">
              Stop order changed
            </p>

            <p class="text-[11px] text-purple-600 truncate">
              Drag stops into the correct sequence.
            </p>

          </div>

        </div>


        <div class="flex gap-2 flex-shrink-0">

          <button
            onclick="cancelStopOrder()"
            class="
              px-3
              py-1.5
              rounded-lg
              text-xs
              font-semibold
              text-gray-600
              bg-white
              border
              border-gray-200
              hover:bg-gray-50
              transition
            "
          >
            Cancel
          </button>

          <button
            onclick="saveStopOrder()"
            class="
              px-3
              py-1.5
              rounded-lg
              text-xs
              font-semibold
              text-white
              bg-qc-purple
              hover:bg-qc-purple-dark
              transition
            "
          >
            Save Order
          </button>

        </div>

      </div>


      <!-- EMPTY STATE -->
      ${
        stops.length === 0
          ? `
            <div
              class="
                bg-white
                rounded-2xl
                border
                border-gray-100
                shadow-sm
                p-6
                text-center
              "
            >

              <div class="text-3xl mb-3">
                📍
              </div>

              <p class="text-sm font-medium text-gray-700">
                No stops yet
              </p>

              <p class="text-xs text-gray-500 mt-1">
                Add your first bus stop to start building this route.
              </p>

            </div>
          `
          : ''
      }


      <!-- STOP LIST -->
      ${
        stops.length > 0
          ? `
            <div
              id="stopList"
              class="space-y-2"
            >

              ${stops.map((stop, i) => `
                <div
                  data-stop-id="${stop.id}"
                  class="
                    stop-item
                    bg-white
                    rounded-2xl
                    border
                    border-gray-100
                    shadow-sm
                    p-3
                    flex
                    items-center
                    gap-3
                    transition
                    select-none
                  "
                >

                  <!-- DRAG HANDLE -->
                  <div
                    class="
                      stop-drag-handle
                      w-6
                      h-8
                      flex
                      items-center
                      justify-center
                      text-gray-300
                      text-lg
                      flex-shrink-0
                      cursor-grab
                      active:cursor-grabbing
                      touch-none
                    "
                    title="Drag to reorder"
                    aria-label="Drag to reorder stop"
                  >
                    ⋮⋮
                  </div>


                  <!-- NUMBER -->
                  <div
                    class="
                      stop-number
                      w-8
                      h-8
                      rounded-full
                      flex
                      items-center
                      justify-center
                      text-white
                      font-bold
                      text-xs
                      flex-shrink-0
                    "
                    style="background:${route.color || '#7c3aed'}"
                  >
                    ${i + 1}
                  </div>


                  <!-- INFO -->
                  <div class="flex-1 min-w-0">

                    <p
                      class="
                        text-sm
                        font-medium
                        text-gray-800
                        truncate
                      "
                    >
                      ${escapeHtml(stop.name)}
                    </p>

                    <p class="text-xs text-gray-400">
                      ${Number(stop.lat).toFixed(5)},
                      ${Number(stop.lng).toFixed(5)}
                    </p>

                  </div>


                  <!-- ACTIONS -->
                  <button
                    onclick="openStopActions('${stop.id}')"
                    class="
                      p-1.5
                      hover:bg-gray-100
                      rounded-full
                      transition
                      flex-shrink-0
                    "
                    aria-label="Stop actions"
                  >

                    <svg
                      class="w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="currentColor"
                        stroke-width="2"
                        d="
                          M12 5v.01
                          M12 12v.01
                          M12 19v.01
                          M12 6a1 1 0 110-2
                          1 1 0 010 2zm0 7a1 1 0 110-2
                          1 1 0 010 2zm0 7a1 1 0 110-2
                          1 1 0 010 2z
                        "
                      />
                    </svg>

                  </button>

                </div>
              `).join('')}

            </div>
          `
          : ''
      }

    </div>
  `;
};


// ==================================================
// STOP ORDER STATE
// ==================================================

function resetStopOrderState(routeId, stops) {
  const ids =
    stops.map(stop => stop.id);

  stopOrderState = {
    routeId,
    original: [...ids],
    current: [...ids],
    dirty: false,
  };

  if (stopSortable) {
    stopSortable.destroy();
    stopSortable = null;
  }
}


function getCurrentStopIds() {
  return [
    ...document.querySelectorAll(
      '#stopList [data-stop-id]'
    ),
  ].map(
    item => item.dataset.stopId
  );
}


function setStopOrderDirty() {
  const current =
    getCurrentStopIds();

  stopOrderState.current =
    current;

  stopOrderState.dirty =
    JSON.stringify(current) !==
    JSON.stringify(
      stopOrderState.original
    );

  updateStopNumbers();
  updateStopOrderBar();
}


function updateStopOrderBar() {
  const bar =
    document.getElementById(
      'stopOrderBar'
    );

  if (!bar) {
    return;
  }

  bar.classList.toggle(
    'hidden',
    !stopOrderState.dirty
  );

  bar.classList.toggle(
    'flex',
    stopOrderState.dirty
  );
}


function updateStopNumbers() {
  const items =
    document.querySelectorAll(
      '#stopList [data-stop-id]'
    );

  items.forEach(
    (item, index) => {

      const number =
        item.querySelector(
          '.stop-number'
        );

      if (number) {
        number.textContent =
          index + 1;
      }

    }
  );
}


// ==================================================
// SORTABLE STOP ORDERING
// ==================================================

function initStopOrdering() {
  const list =
    document.getElementById(
      'stopList'
    );

  if (!list) {
    return;
  }

  if (stopSortable) {
    stopSortable.destroy();
    stopSortable = null;
  }

  stopSortable =
    Sortable.create(
      list,
      {
        animation: 180,

        draggable:
          '[data-stop-id]',

        handle:
          '.stop-drag-handle',

        forceFallback:
          true,

        fallbackOnBody:
          true,

        fallbackTolerance:
          4,

        delayOnTouchOnly:
          true,

        delay:
          120,

        touchStartThreshold:
          4,

        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',

        swapThreshold:
          0.65,

        onStart() {

          list.classList.add(
            'select-none'
          );

        },

        onEnd() {

          list.classList.remove(
            'select-none'
          );

          setStopOrderDirty();

        },
      }
    );
}


// ==================================================
// SAVE STOP ORDER
// ==================================================

async function saveStopOrder() {
  if (
    !stopOrderState.routeId ||
    !stopOrderState.dirty
  ) {
    return;
  }

  const routeId =
    stopOrderState.routeId;

  const orderedStopIds =
    getCurrentStopIds();

  if (
    orderedStopIds.length < 1
  ) {
    return;
  }

  try {

    showLoading();

    await Store.reorderStops(
      routeId,
      orderedStopIds
    );

    await refreshRoadRoute(
      routeId
    );

    showToast(
      'Stop order updated',
      'success'
    );

    stopOrderState.original =
      [...orderedStopIds];

    stopOrderState.current =
      [...orderedStopIds];

    stopOrderState.dirty =
      false;

    destroyMap();

    await navigateToStops(
      routeId
    );

  } catch (error) {

    console.error(
      'Stop reorder error:',
      error
    );

    showToast(
      'Failed to update stop order',
      'error'
    );

  } finally {

    hideLoading();

  }
}


// ==================================================
// CANCEL STOP ORDER
// ==================================================

function cancelStopOrder() {
  if (
    !stopOrderState.routeId ||
    !stopOrderState.dirty
  ) {
    return;
  }

  const routeId =
    stopOrderState.routeId;

  destroyMap();

  navigateToStops(
    routeId
  );
}


// ==================================================
// ROUTE HELPERS
// ==================================================

function formatRouteDuration(seconds) {
  const totalMinutes =
    Math.round(
      Number(seconds) / 60
    );

  if (
    !Number.isFinite(
      totalMinutes
    ) ||
    totalMinutes <= 0
  ) {
    return '';
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours =
    Math.floor(
      totalMinutes / 60
    );

  const minutes =
    totalMinutes % 60;

  return minutes
    ? `${hours}h ${minutes}m`
    : `${hours}h`;
}


function parseRouteGeometry(route) {
  if (!route?.geometry) {
    return null;
  }

  try {

    return typeof route.geometry === 'string'
      ? JSON.parse(route.geometry)
      : route.geometry;

  } catch (error) {

    console.error(
      'Invalid route geometry:',
      error
    );

    return null;

  }
}


// ==================================================
// GENERATE / REFRESH ROAD ROUTE
// ==================================================

async function refreshRoadRoute(routeId) {

  const route =
    await routeById(routeId);

  if (!route) {
    throw new Error(
      'Route not found'
    );
  }

  const stops =
    await Store.getStopsByRoute(
      routeId
    );


  // ------------------------------------------
  // NOT ENOUGH STOPS
  // ------------------------------------------

  if (stops.length < 2) {

    await Store.updateRoute(
      routeId,
      {
        geometry: null,
        distance: null,
        duration: null
      }
    );

    return false;
  }


  // ------------------------------------------
  // BUILD OSRM COORDINATES
  // ------------------------------------------

  const coordinates =
    stops
      .map(stop => {

        const lng =
          Number(stop.lng);

        const lat =
          Number(stop.lat);

        if (
          !Number.isFinite(lng) ||
          !Number.isFinite(lat)
        ) {
          throw new Error(
            `Invalid coordinates for stop "${stop.name}"`
          );
        }

        return `${lng},${lat}`;

      })
      .join(';');


  // ------------------------------------------
  // OSRM REQUEST
  // ------------------------------------------

  const url =
    `https://router.project-osrm.org/route/v1/driving/${coordinates}` +
    `?overview=full&geometries=geojson&steps=false`;

  const response =
    await fetch(url);

  if (!response.ok) {

    throw new Error(
      `Routing request failed: ${response.status}`
    );

  }

  const data =
    await response.json();

  if (
    data.code !== 'Ok' ||
    !data.routes?.length
  ) {

    throw new Error(
      data.code ||
      'No route found'
    );

  }


  // ------------------------------------------
  // SAVE ROAD GEOMETRY
  // ------------------------------------------

  const roadRoute =
    data.routes[0];

  await Store.updateRoute(
    routeId,
    {
      geometry:
        JSON.stringify(
          roadRoute.geometry
        ),

      distance:
        roadRoute.distance,

      duration:
        roadRoute.duration
    }
  );

  return true;
}


// ==================================================
// MANUAL GENERATE / REGENERATE
// ==================================================

async function generateRoadRoute(
  routeId
) {

  const stops =
    await Store.getStopsByRoute(
      routeId
    );

  if (stops.length < 2) {

    showToast(
      'Add at least 2 stops first',
      'info'
    );

    return;
  }


  try {

    showLoading();

    await refreshRoadRoute(
      routeId
    );

    showToast(
      'Road route updated',
      'success'
    );

    destroyMap();

    await navigateToStops(
      routeId
    );

  } catch (error) {

    console.error(
      'Road route generation failed:',
      error
    );

    showToast(
      'Could not generate road route',
      'error'
    );

  } finally {

    hideLoading();

  }
}


// ==================================================
// INIT MAP
// ==================================================

async function initStopsPage(
  routeId =
    currentRouteIdForStops
) {

  if (!routeId) {
    return;
  }


  const container =
    document.getElementById(
      'stopsMap'
    );

  if (
    !container ||
    AppState.map
  ) {
    return;
  }


  const route =
    await routeById(
      routeId
    );

  if (!route) {
    return;
  }


  const stops =
    await Store.getStopsByRoute(
      routeId
    );


  const routeGeometry =
    parseRouteGeometry(
      route
    );


  // ------------------------------------------
  // MAPLIBRE CSS
  // ------------------------------------------

  if (
    !document.getElementById(
      'maplibre-css'
    )
  ) {

    const link =
      document.createElement(
        'link'
      );

    link.id =
      'maplibre-css';

    link.rel =
      'stylesheet';

    link.href =
      'https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css';

    document.head.appendChild(
      link
    );
  }


  // ------------------------------------------
  // CENTER
  // ------------------------------------------

  const center =
    stops[0]
      ? [
          Number(stops[0].lng),
          Number(stops[0].lat)
        ]
      : [
          121.0437,
          14.6760
        ];


  // ------------------------------------------
  // CREATE MAP
  // ------------------------------------------

  const map =
    new maplibregl.Map({

      container:
        'stopsMap',

      style:
        'https://tiles.openfreemap.org/styles/liberty',

      center,

      zoom: 12,

      attributionControl:
        true

    });


  AppState.map =
    map;


  // ------------------------------------------
  // WAIT FOR MAP
  // ------------------------------------------

  await new Promise(
    resolve => {

      map.once(
        'load',
        resolve
      );

    }
  );


  // Prevent stale async map
  if (
    AppState.map !== map
  ) {
    return;
  }


  // ------------------------------------------
  // CONTROLS
  // ------------------------------------------

  map.addControl(
    new maplibregl.NavigationControl(),
    'bottom-right'
  );


  // ------------------------------------------
  // DRAW ROAD ROUTE
  // ------------------------------------------

  if (
    routeGeometry &&
    routeGeometry.type ===
      'LineString' &&
    Array.isArray(
      routeGeometry.coordinates
    ) &&
    routeGeometry.coordinates.length >= 2
  ) {

    map.addSource(
      'route-geometry',
      {
        type: 'geojson',

        data: {
          type: 'Feature',

          properties: {},

          geometry:
            routeGeometry
        }
      }
    );


    map.addLayer({

      id:
        'route-geometry',

      type:
        'line',

      source:
        'route-geometry',

      layout: {

        'line-join':
          'round',

        'line-cap':
          'round'

      },

      paint: {

        'line-color':
          route.color ||
          '#7c3aed',

        'line-width':
          5,

        'line-opacity':
          0.85

      }

    });

  }


  // ------------------------------------------
  // STOP MARKERS
  // ------------------------------------------

  stops.forEach(
    (stop, i) => {

      const markerElement =
        document.createElement(
          'div'
        );


      markerElement.innerHTML = `
        <div
          style="
            background:${route.color || '#7c3aed'};
            color:#fff;
            width:26px;
            height:26px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:11px;
            font-weight:700;
            border:2px solid white;
            box-shadow:0 2px 6px rgba(0,0,0,.3);
          "
        >
          ${i + 1}
        </div>
      `;


      const popup =
        new maplibregl.Popup({
          offset: 15
        })
        .setHTML(`
          <b>
            ${escapeHtml(
              stop.name
            )}
          </b>
        `);


      new maplibregl.Marker({
        element:
          markerElement
      })

        .setLngLat([
          Number(stop.lng),
          Number(stop.lat)
        ])

        .setPopup(
          popup
        )

        .addTo(
          map
        );

    }
  );


  // ------------------------------------------
  // FIT MAP
  // ------------------------------------------

  if (
    stops.length > 0
  ) {

    const bounds =
      new maplibregl.LngLatBounds();


    stops.forEach(
      stop => {

        bounds.extend([
          Number(stop.lng),
          Number(stop.lat)
        ]);

      }
    );


    if (
      routeGeometry?.coordinates?.length
    ) {

      routeGeometry.coordinates
        .forEach(
          coord => {
            bounds.extend(
              coord
            );
          }
        );

    }


    map.fitBounds(
      bounds,
      {
        padding: 40,
        maxZoom: 15
      }
    );

  }


  // ------------------------------------------
  // PICK MODE
  // ------------------------------------------

  applyMapPickMode();


  // ------------------------------------------
  // STOP ORDERING
  // ------------------------------------------

  initStopOrdering();
}


// ==================================================
// MAP PICK MODE
// ==================================================

function applyMapPickMode() {

  if (!AppState.map) {
    return;
  }


  const map =
    AppState.map;


  map.off(
    'click'
  );


  if (
    AppState.mapPickMode
  ) {

    map.on(
      'click',
      e => {

        const {
          lat,
          lng
        } = e.lngLat;


        if (
          AppState.mapPickMode
        ) {

          AppState.mapPickMode(
            lat,
            lng
          );

        }

      }
    );


    map.getCanvas().style.cursor =
      'crosshair';

  } else {

    map.getCanvas().style.cursor =
      '';

  }
}


// ==================================================
// ADD STOP MODAL
// ==================================================

async function openAddStopHint(
  routeId
) {

  const route =
    await routeById(
      routeId
    );


  if (!route) {
    return;
  }


  openModal(
    'Add Bus Stop',
    `

      <p class="text-xs text-gray-500 mb-4">
        Pick the location on the map or enter coordinates manually.
      </p>


      <div class="mb-3">

        <button
          onclick="
            closeModal();
            setTimeout(
              () => enablePickMode('${routeId}'),
              150
            );
          "
          class="
            w-full
            py-3
            rounded-xl
            bg-qc-purple
            text-white
            text-sm
            font-semibold
            hover:bg-qc-purple-dark
            transition
          "
        >
          🗺️ Pick on Map
        </button>

      </div>


      <div class="flex items-center gap-3 my-3">

        <div class="flex-1 h-px bg-gray-200"></div>

        <span class="text-[11px] text-gray-400">
          OR
        </span>

        <div class="flex-1 h-px bg-gray-200"></div>

      </div>


      <form
        id="stopForm"
        class="space-y-3"
      >

        <input
          type="hidden"
          name="routeId"
          value="${routeId}"
        >


        <div>

          <label
            class="
              block
              text-xs
              font-medium
              text-gray-600
              mb-1.5
            "
          >
            Stop Name
          </label>

          <input
            name="name"
            required
            placeholder="e.g. Fairview Terminal"
            class="
              w-full
              px-3
              py-2.5
              text-sm
              border
              border-gray-200
              rounded-xl
              focus:border-qc-purple
              outline-none
            "
          >

        </div>


        <div class="grid grid-cols-2 gap-3">

          <div>

            <label
              class="
                block
                text-xs
                font-medium
                text-gray-600
                mb-1.5
              "
            >
              Latitude
            </label>

            <input
              name="lat"
              type="number"
              step="any"
              required
              placeholder="14.6760"
              class="
                w-full
                px-3
                py-2.5
                text-sm
                border
                border-gray-200
                rounded-xl
                focus:border-qc-purple
                outline-none
              "
            >

          </div>


          <div>

            <label
              class="
                block
                text-xs
                font-medium
                text-gray-600
                mb-1.5
              "
            >
              Longitude
            </label>

            <input
              name="lng"
              type="number"
              step="any"
              required
              placeholder="121.0437"
              class="
                w-full
                px-3
                py-2.5
                text-sm
                border
                border-gray-200
                rounded-xl
                focus:border-qc-purple
                outline-none
              "
            >

          </div>

        </div>


        <button
          type="submit"
          class="
            w-full
            py-3
            bg-qc-purple
            text-white
            text-sm
            font-semibold
            rounded-xl
            shadow-md
            shadow-purple-200
            hover:bg-qc-purple-dark
            transition
          "
        >
          Add Stop
        </button>

      </form>
    `
  );


  document
    .getElementById(
      'stopForm'
    )
    .addEventListener(
      'submit',
      async e => {

        e.preventDefault();


        const data =
          Object.fromEntries(
            new FormData(
              e.target
            )
          );


        try {

          closeModal();

          showLoading();


          await Store.addStop(
            data
          );


          await refreshRoadRoute(
            routeId
          );


          showToast(
            'Stop added and route updated',
            'success'
          );


        } catch (error) {

          console.error(
            'Stop save error:',
            error
          );


          showToast(
            'Stop added, but route could not be updated',
            'error'
          );


        } finally {

          destroyMap();

          await navigateToStops(
            routeId
          );

          hideLoading();

        }

      }
    );
}


// ==================================================
// PICK STOP ON MAP
// ==================================================

function enablePickMode(
  routeId
) {

  destroyMap();


  setTimeout(
    () => {

      initStopsPage(
        routeId
      );


      setTimeout(
        () => {

          const handle =
            (lat, lng) => {

              AppState.mapPickMode =
                null;

              applyMapPickMode();


              openModal(
                'Save Bus Stop',
                `

                  <form
                    id="stopForm2"
                    class="space-y-3"
                  >

                    <input
                      type="hidden"
                      name="routeId"
                      value="${routeId}"
                    >

                    <input
                      type="hidden"
                      name="lat"
                      value="${lat}"
                    >

                    <input
                      type="hidden"
                      name="lng"
                      value="${lng}"
                    >


                    <div
                      class="
                        bg-purple-50
                        border
                        border-purple-100
                        rounded-xl
                        p-3
                        text-xs
                        text-purple-800
                        mb-3
                      "
                    >
                      📍 Location:
                      ${lat.toFixed(5)},
                      ${lng.toFixed(5)}
                    </div>


                    <div>

                      <label
                        class="
                          block
                          text-xs
                          font-medium
                          text-gray-600
                          mb-1.5
                        "
                      >
                        Stop Name
                      </label>


                      <input
                        name="name"
                        required
                        placeholder="e.g. Fairview Terminal"
                        autofocus
                        class="
                          w-full
                          px-3
                          py-2.5
                          text-sm
                          border
                          border-gray-200
                          rounded-xl
                          focus:border-qc-purple
                          outline-none
                        "
                      >

                    </div>


                    <button
                      type="submit"
                      class="
                        w-full
                        py-3
                        bg-qc-purple
                        text-white
                        text-sm
                        font-semibold
                        rounded-xl
                        shadow-md
                        shadow-purple-200
                        hover:bg-qc-purple-dark
                        transition
                      "
                    >
                      Save Stop
                    </button>

                  </form>

                `
              );


              document
                .getElementById(
                  'stopForm2'
                )
                .addEventListener(
                  'submit',
                  async e => {

                    e.preventDefault();


                    const data =
                      Object.fromEntries(
                        new FormData(
                          e.target
                        )
                      );


                    try {

                      closeModal();

                      showLoading();


                      await Store.addStop(
                        data
                      );


                      await refreshRoadRoute(
                        routeId
                      );


                      showToast(
                        'Stop added and route updated',
                        'success'
                      );


                    } catch (error) {

                      console.error(
                        'Stop save error:',
                        error
                      );


                      showToast(
                        'Stop added, but route could not be updated',
                        'error'
                      );


                    } finally {

                      destroyMap();

                      await navigateToStops(
                        routeId
                      );

                      hideLoading();

                    }

                  }
                );

            };


          AppState.mapPickMode =
            handle;


          applyMapPickMode();


          showToast(
            'Tap the map to pick a location',
            'info'
          );


        },
        250
      );

    },
    150
  );
}


// ==================================================
// STOP ACTIONS
// ==================================================

async function openStopActions(
  stopId
) {

  const stops =
    await Store.getStops();


  const stop =
    stops.find(
      s => s.id === stopId
    );


  if (!stop) {
    return;
  }


  openModal(
    escapeHtml(
      stop.name
    ),
    `

      <div class="space-y-2">

        <button
          onclick="openEditStop('${stopId}')"
          class="
            w-full
            p-3
            flex
            items-center
            gap-3
            hover:bg-gray-50
            rounded-xl
            transition
            text-left
          "
        >

          <span
            class="
              w-9
              h-9
              bg-blue-50
              rounded-lg
              flex
              items-center
              justify-center
            "
          >
            ✏️
          </span>


          <span
            class="
              text-sm
              font-medium
              text-gray-700
            "
          >
            Rename Stop
          </span>

        </button>


        <button
          onclick="confirmDeleteStop('${stopId}')"
          class="
            w-full
            p-3
            flex
            items-center
            gap-3
            hover:bg-red-50
            rounded-xl
            transition
            text-left
          "
        >

          <span
            class="
              w-9
              h-9
              bg-red-50
              rounded-lg
              flex
              items-center
              justify-center
            "
          >
            🗑️
          </span>


          <span
            class="
              text-sm
              font-medium
              text-red-600
            "
          >
            Delete Stop
          </span>

        </button>

      </div>

    `
  );
}


// ==================================================
// RENAME STOP
// ==================================================

async function openEditStop(
  stopId
) {

  const stops =
    await Store.getStops();


  const stop =
    stops.find(
      s => s.id === stopId
    );


  if (!stop) {
    return;
  }


  openModal(
    'Rename Stop',
    `

      <form
        id="editStopForm"
        class="space-y-3"
      >

        <div>

          <label
            class="
              block
              text-xs
              font-medium
              text-gray-600
              mb-1.5
            "
          >
            Stop Name
          </label>


          <input
            name="name"
            required
            value="${escapeHtml(
              stop.name
            )}"
            class="
              w-full
              px-3
              py-2.5
              text-sm
              border
              border-gray-200
              rounded-xl
              focus:border-qc-purple
              outline-none
            "
          >

        </div>


        <button
          type="submit"
          class="
            w-full
            py-3
            bg-qc-purple
            text-white
            text-sm
            font-semibold
            rounded-xl
            hover:bg-qc-purple-dark
            transition
          "
        >
          Save
        </button>

      </form>

    `
  );


  document
    .getElementById(
      'editStopForm'
    )
    .addEventListener(
      'submit',
      async e => {

        e.preventDefault();


        const data =
          Object.fromEntries(
            new FormData(
              e.target
            )
          );


        try {

          await Store.updateStop(
            stopId,
            data
          );


          closeModal();


          showToast(
            'Stop renamed',
            'success'
          );


          destroyMap();


          await navigateToStops(
            stop.routeId
          );


        } catch (error) {

          console.error(
            'Stop update error:',
            error
          );


          showToast(
            'Failed to rename stop',
            'error'
          );

        }

      }
    );
}


// ==================================================
// DELETE STOP
// ==================================================

async function confirmDeleteStop(
  stopId
) {

  const stops =
    await Store.getStops();


  const stop =
    stops.find(
      s => s.id === stopId
    );


  if (!stop) {
    return;
  }


  closeModal();


  const ok =
    await confirmAction(
      'Delete Stop?',
      `Remove "${stop.name}" from this route?`,
      'Delete'
    );


  if (!ok) {
    return;
  }


  try {

    showLoading();


    await Store.deleteStop(
      stopId
    );


    await refreshRoadRoute(
      stop.routeId
    );


    showToast(
      'Stop deleted and route updated',
      'success'
    );


  } catch (error) {

    console.error(
      'Stop delete error:',
      error
    );


    showToast(
      'Stop deleted, but route could not be updated',
      'error'
    );


  } finally {

    destroyMap();

    await navigateToStops(
      stop.routeId
    );

    hideLoading();

  }
}


// ==================================================
// CLEANUP
// ==================================================

function destroyMap() {

  if (stopSortable) {

    stopSortable.destroy();

    stopSortable =
      null;
  }


  if (AppState.map) {

    try {

      AppState.map.remove();

    } catch (error) {

      console.warn(
        'Map cleanup warning:',
        error
      );

    }

    AppState.map =
      null;
  }


  AppState.mapPickMode =
    null;
}


// ==================================================
// EXPOSE
// ==================================================

window.initStopsPage =
  initStopsPage;

window.openAddStopHint =
  openAddStopHint;

window.enablePickMode =
  enablePickMode;

window.openStopActions =
  openStopActions;

window.openEditStop =
  openEditStop;

window.confirmDeleteStop =
  confirmDeleteStop;

window.destroyMap =
  destroyMap;

window.generateRoadRoute =
  generateRoadRoute;

window.saveStopOrder =
  saveStopOrder;

window.cancelStopOrder =
  cancelStopOrder;