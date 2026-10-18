import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";
import {
  DROPOFF_BUS_RADIUS_METERS,
  getDistanceKm,
  getEta,
} from "../../shared/js/eta.js";

// ==================================================
// MAPLIBRE CSS
// ==================================================

if (!document.querySelector('link[data-maplibre]')) {
  const link = document.createElement("link");

  link.rel = "stylesheet";
  link.href =
    "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css";

  link.dataset.maplibre = "true";

  document.head.appendChild(link);
}


// ==================================================
// MAP CONSTANTS
// ==================================================

const QC_CIRCLE_CENTER = [
  121.0494,
  14.6517,
];

const QC_CIRCLE_ZOOM = 13;


// ==================================================
// MAP STATE
// ==================================================

let map = null;

let busMarkers = [];
let stopMarkers = [];
let userMarker = null;
const userLocationAnimation = { frame: null };
let activeStopPopup = null;
let userLocationWatchId = null;
let displayedUserLocation = null;
let hasUserMovedMap = false;
let hasCenteredOnUser = false;

let selectedRouteId = null;
let pendingSelectedRouteId = null;

function closeBusPopups(exceptPopup = null) {
  busMarkers.forEach(({ popup }) => {
    if (popup !== exceptPopup && popup.isOpen()) {
      popup.remove();
    }
  });
}

let routeLayersInitialized = false;

function animateMarkerTo(marker, animationState, target, duration = 900, onFrame = null) {
  if (!marker) return;
  if (animationState.frame !== null) {
    cancelAnimationFrame(animationState.frame);
    animationState.frame = null;
  }

  const from = marker.getLngLat();
  const start = [from.lng, from.lat];
  if (Math.abs(start[0] - target[0]) < 0.000001 && Math.abs(start[1] - target[1]) < 0.000001) {
    return;
  }

  const startedAt = performance.now();
  const step = now => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const coordinates = [
      start[0] + (target[0] - start[0]) * eased,
      start[1] + (target[1] - start[1]) * eased,
    ];
    marker.setLngLat(coordinates);
    onFrame?.(coordinates);
    if (progress < 1) {
      animationState.frame = requestAnimationFrame(step);
    } else {
      animationState.frame = null;
    }
  };
  animationState.frame = requestAnimationFrame(step);
}


// ==================================================
// HELPERS
// ==================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function getBusCoordinates(bus) {
  const lat = Number(bus?.lat);
  const lng = Number(bus?.lng);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return [lng, lat];
}

// ==================================================
// STOP COORDINATES
// ==================================================

function getStopCoordinates(stop) {
  if (!stop) {
    return null;
  }

  // Normal Firestore format
  let lat = Number(stop.lat);
  let lng = Number(stop.lng);

  // Alternative field names
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    lat = Number(stop.latitude);
    lng = Number(stop.longitude);
  }

  // GeoPoint-style data
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    if (
      stop.coordinates &&
      Array.isArray(stop.coordinates)
    ) {
      lng = Number(stop.coordinates[0]);
      lat = Number(stop.coordinates[1]);
    }
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return [lng, lat];
}


function getRouteById(routeId) {
  if (!routeId) return null;

  return (
    AppState.routes?.find(
      route => route.id === routeId
    ) || null
  );
}


function getStopsForRoute(routeId) {
  if (!routeId) return [];

  return (AppState.stops || [])
    .filter(
      stop =>
        stop.routeId === routeId
    )
    .sort(
      (a, b) =>
        Number(a.order || 0) -
        Number(b.order || 0)
    );
}


function parseRouteGeometry(route) {
  if (!route?.geometry) {
    return null;
  }

  try {
    const geometry =
      typeof route.geometry === "string"
        ? JSON.parse(route.geometry)
        : route.geometry;

    if (
      geometry?.type === "Feature" &&
      geometry.geometry
    ) {
      return geometry.geometry;
    }

    if (
      geometry?.type &&
      geometry?.coordinates
    ) {
      return geometry;
    }

    return null;

  } catch (error) {
    console.error(
      "Invalid route geometry:",
      error
    );

    return null;
  }
}


function getRouteColor(route) {
  return (
    route?.color ||
    "#1e40af"
  );
}


function getGeometryCoordinates(geometry) {
  if (!geometry) return [];

  if (
    geometry.type === "LineString"
  ) {
    return geometry.coordinates || [];
  }

  if (
    geometry.type === "MultiLineString"
  ) {
    return (
      geometry.coordinates?.flat(1) ||
      []
    );
  }

  return [];
}


// ==================================================
// INIT MAP
// ==================================================

function initMap() {
  const container =
    document.getElementById(
      "mapContainer"
    );

  if (!container) return;


  createRoutePicker();

  if (map) {
    map.resize();

    updateRoutePicker(document.getElementById("routeSearchInput")?.value || "");
    updateRouteLayers();
    updateBusMarkers();
    updateBusLegend();

    return;
  }


  routeLayersInitialized = false;


  map = new maplibregl.Map({
    container: "mapContainer",

    style:
      "https://tiles.openfreemap.org/styles/liberty",

    center: QC_CIRCLE_CENTER,

    zoom: QC_CIRCLE_ZOOM,

    attributionControl: true,
  });


  map.addControl(
    new maplibregl.NavigationControl({
      showCompass: false,
    }),
    "bottom-right"
  );

  const markMapAsUserMoved = () => {
    hasUserMovedMap = true;
  };

  map.on("dragstart", markMapAsUserMoved);
  map.on("wheel", markMapAsUserMoved);
  map.on("zoomstart", markMapAsUserMoved);
  map.on("rotatestart", markMapAsUserMoved);
  map.on("pitchstart", markMapAsUserMoved);
  map.on("touchstart", markMapAsUserMoved);
  map.on("rotate", updateBusMarkers);


  map.on("load", () => {
    if (!map) return;

    updateRouteLayers();
    updateBusMarkers();
    updateBusLegend();
    getUserLocation();

    if (pendingSelectedRouteId) {
      const routeId = pendingSelectedRouteId;
      pendingSelectedRouteId = null;
      selectRoute(routeId);
    }

    setTimeout(() => {
      if (map) {
        map.resize();
      }
    }, 100);
  });


  // ==================================================
  // MAP BACKGROUND CLICK
  // ==================================================

  map.on("click", event => {
    if (!map) return;


    const routeLayers = [
      "selected-route-line",
      "selected-route-casing",
      "all-routes-line",
      "all-routes-casing",
    ].filter(layerId =>
      map.getLayer(layerId)
    );


    const features =
      routeLayers.length > 0
        ? map.queryRenderedFeatures(
            event.point,
            {
              layers: routeLayers,
            }
          )
        : [];


    const routeFeature =
      features.find(
        feature =>
          feature.properties?.routeId
      );


    if (routeFeature) {
      selectRoute(
        routeFeature.properties.routeId
      );

      return;
    }


    if (selectedRouteId) {
      clearSelectedRoute();
    }
  });


  // ==================================================
  // ROUTE HOVER
  // ==================================================

  map.on(
    "mouseenter",
    "all-routes-line",
    () => {
      if (!map) return;

      map.getCanvas().style.cursor =
        "pointer";
    }
  );


  map.on(
    "mouseleave",
    "all-routes-line",
    () => {
      if (!map) return;

      map.getCanvas().style.cursor =
        "";
    }
  );


  map.on(
    "mouseenter",
    "selected-route-line",
    () => {
      if (!map) return;

      map.getCanvas().style.cursor =
        "pointer";
    }
  );


  map.on(
    "mouseleave",
    "selected-route-line",
    () => {
      if (!map) return;

      map.getCanvas().style.cursor =
        "";
    }
  );
}


// ==================================================
// ROUTE PICKER UI
// ==================================================

function createRoutePicker() {
  const mapContainer =
    document.getElementById(
      "mapContainer"
    );

  if (!mapContainer) return;

  const mapWrapper =
    mapContainer.closest(".relative") ||
    mapContainer;

  let wrapper =
    document.getElementById(
      "routePicker"
    );

  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "routePicker";
    wrapper.className = "relative z-30 mb-2";
    mapWrapper.insertAdjacentElement("beforebegin", wrapper);
  } else {
    // Ensure it is positioned above the map container
    if (
      wrapper.nextElementSibling !== mapWrapper &&
      wrapper !== mapWrapper.previousElementSibling
    ) {
      mapWrapper.insertAdjacentElement("beforebegin", wrapper);
    }
  }

  // If already rendered inside, don't re-inject markup
  if (wrapper.querySelector("#routeSearchInput")) {
    updateRoutePicker(
      document.getElementById("routeSearchInput")?.value || ""
    );
    return;
  }

  wrapper.innerHTML = `
    <div class="relative">
      <!-- Search Input Bar Above Map -->
      <div class="relative flex items-center bg-white rounded-2xl border border-gray-200/90 shadow-sm focus-within:border-qc-blue focus-within:ring-2 focus-within:ring-qc-blue/10 transition">
        <span class="absolute left-3.5 text-gray-400 pointer-events-none select-none" aria-hidden="true">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" stroke-width="2"/><path stroke-linecap="round" stroke-width="2" d="m16 16 4 4"/></svg>
        </span>
        <input
          id="routeSearchInput"
          type="text"
          inputmode="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search route (e.g. R1,R2, City Hall)..."
          class="w-full pl-10 pr-16 py-2.5 text-sm bg-transparent rounded-2xl outline-none placeholder:text-gray-400 text-gray-800"
        />
        <button
          id="clearRouteButton"
          type="button"
          class="hidden absolute right-2.5 px-2.5 py-1 text-xs font-semibold text-gray-500 hover:text-qc-blue bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          aria-label="Clear route search"
        >
          Clear
        </button>
      </div>

      <!-- Floating Routes Dropdown (Hidden initially; shown ONLY when typing/searching) -->
      <div
        id="routeList"
        class="hidden absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 max-h-60 overflow-y-auto space-y-1.5"
      ></div>
    </div>
  `;

  // Prevent any mouse, touch, or double-tap events on route picker from leaking to map underneath
  ["pointerdown", "mousedown", "touchstart", "touchend", "dblclick"].forEach(evt => {
    wrapper.addEventListener(evt, (e) => {
      e.stopPropagation();
    });
  });

  const searchInput =
    document.getElementById(
      "routeSearchInput"
    );

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      () => {
        updateRoutePicker(
          searchInput.value
        );
      }
    );

    searchInput.addEventListener(
      "focus",
      () => {
        if (searchInput.value.trim().length > 0) {
          updateRoutePicker(searchInput.value);
        }
      }
    );
  }

  const clearButton =
    document.getElementById(
      "clearRouteButton"
    );

  if (clearButton) {
    ["click", "touchstart", "touchend", "pointerdown"].forEach(evt => {
      clearButton.addEventListener(evt, (e) => {
        e.stopPropagation();
        if (evt === "click") {
          e.preventDefault();
          clearSelectedRoute();
        }
      });
    });
  }

  // Close dropdown if user clicks outside of route picker
  document.addEventListener("click", (e) => {
    const picker = document.getElementById("routePicker");
    const list = document.getElementById("routeList");
    if (picker && list && !picker.contains(e.target)) {
      list.classList.add("hidden");
    }
  });

  updateRoutePicker();
}


// ==================================================
// UPDATE ROUTE PICKER
// ==================================================

function updateRoutePicker(
  searchTerm = ""
) {
  const list =
    document.getElementById(
      "routeList"
    );

  const clearButton =
    document.getElementById(
      "clearRouteButton"
    );

  const selectedRoute =
    selectedRouteId
      ? getRouteById(selectedRouteId)
      : null;

  if (selectedRoute) {
    if (clearButton) clearButton.classList.remove("hidden");
  }

  if (!list) return;

  const search =
    String(searchTerm || "")
      .trim()
      .toLowerCase();

  // "hide the routs in the search and when i type or search for a route it well then show me the routes"
  // If search is empty, hide the route list
  if (!search) {
    list.classList.add("hidden");
    list.innerHTML = "";
    if (!selectedRoute && clearButton) {
      clearButton.classList.add("hidden");
    }
    return;
  }

  // When searching, show the route list
  list.classList.remove("hidden");
  if (clearButton) clearButton.classList.remove("hidden");

  const routes =
    Array.isArray(
      AppState.routes
    )
      ? AppState.routes
      : [];

  const filteredRoutes =
    routes.filter(route => {
      const text = `
        ${route.code || ""}
        ${route.name || ""}
        ${route.description || ""}
      `.toLowerCase();

      return text.includes(search);
    });

  if (filteredRoutes.length === 0) {
    list.innerHTML = `
      <div
        class="
          py-4
          text-center
          text-xs
          text-gray-400
        "
      >
        No routes found matching "${escapeHtml(searchTerm)}".
      </div>
    `;

    return;
  }

  list.innerHTML =
    filteredRoutes
      .map(route => {
        const selected =
          route.id ===
          selectedRouteId;

        const color =
          getRouteColor(route);

        return `
          <button
            type="button"
            data-route-id="${escapeHtml(route.id)}"
            class="
              w-full
              text-left
              rounded-xl
              border
              px-3
              py-2.5
              transition
              flex
              items-center
              gap-3
              ${
                selected
                  ? "border-blue-300 bg-blue-50/70 shadow-sm"
                  : "border-gray-100 bg-white hover:bg-gray-50"
              }
            "
          >
            <span
              class="
                w-3.5
                h-3.5
                rounded-full
                flex-shrink-0
                border-2
                border-white
                shadow-sm
              "
              style="
                background:${escapeHtml(color)};
              "
            ></span>

            <div
              class="
                flex-1
                min-w-0
              "
            >
              <p
                class="
                  text-xs
                  font-bold
                  text-gray-800
                "
              >
                ${escapeHtml(
                  route.code ||
                  "Route"
                )}
              </p>

              <p
                class="
                  text-[11px]
                  text-gray-500
                  truncate
                  mt-0.5
                "
              >
                ${escapeHtml(
                  route.name ||
                  route.description ||
                  "Unnamed route"
                )}
              </p>
            </div>

            <span
              class="
                text-gray-300
                text-sm
              "
            >
              ›
            </span>
          </button>
        `;
      })
      .join("");

  list
    .querySelectorAll(
      "[data-route-id]"
    )
    .forEach(button => {
      const handleSelect = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const routeId =
          button.dataset.routeId;

        selectRoute(routeId);
        list.classList.add("hidden");

        const r = getRouteById(routeId);
        if (r && searchInput) {
          searchInput.value = r.code
            ? `${r.code}${r.name ? " — " + r.name : ""}`
            : (r.name || "");
        }
      };

      button.addEventListener("click", handleSelect);
      button.addEventListener("touchend", handleSelect);
    });
}


// ==================================================
// SELECT ROUTE
// ==================================================

function selectRoute(routeId) {
  const route =
    getRouteById(routeId);

  if (!route) {
    pendingSelectedRouteId = routeId;
    return;
  }

  selectedRouteId = routeId;

  const searchInput =
    document.getElementById(
      "routeSearchInput"
    );

  if (searchInput) {
    searchInput.value = route.code
      ? `${route.code}${route.name ? " — " + route.name : ""}`
      : (route.name || "");
  }

  const list =
    document.getElementById(
      "routeList"
    );

  if (list) {
    list.classList.add("hidden");
  }

  updateRoutePicker();

  if (map) {
    centerMapOnRoute(route);

    if (map.isStyleLoaded()) {
      updateRouteLayers();
      updateBusMarkers();
      updateBusLegend();
    } else {
      map.once("styledata", () => {
        updateRouteLayers();
        updateBusMarkers();
        updateBusLegend();
      });
    }
  } else {
    pendingSelectedRouteId = routeId;
  }
}

function centerMapOnRoute(route) {
  if (!map || !route) return;
  // Keep the asynchronous location callback from recentering the map on the commuter.
  hasUserMovedMap = true;
  hasCenteredOnUser = true;

  const rawRouteCoordinates = getGeometryCoordinates(
    parseRouteGeometry(route)
  );

  const routeCoordinates = (rawRouteCoordinates || [])
    .map(coord => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      let c0 = Number(coord[0]);
      let c1 = Number(coord[1]);
      if (!Number.isFinite(c0) || !Number.isFinite(c1)) return null;
      // Philippines / QC longitude is ~121, latitude is ~14. If swapped [lat, lng], normalize to [lng, lat]
      if (c0 < 50 && c1 > 100) return [c1, c0];
      return [c0, c1];
    })
    .filter(Boolean);

  const stopCoordinates = getStopsForRoute(route.id)
    .map(getStopCoordinates)
    .filter(Boolean);

  const directStops = (Array.isArray(route.stops) ? route.stops : [])
    .map(getStopCoordinates)
    .filter(Boolean);

  const allCoordinates = [
    ...routeCoordinates,
    ...stopCoordinates,
    ...directStops,
  ].filter(
    (coord) =>
      Array.isArray(coord) &&
      coord.length >= 2 &&
      Number.isFinite(Number(coord[0])) &&
      Number.isFinite(Number(coord[1])) &&
      Math.abs(Number(coord[0])) <= 180 &&
      Math.abs(Number(coord[1])) <= 90
  );

  if (!allCoordinates.length) {
    map.flyTo({ center: QC_CIRCLE_CENTER, zoom: QC_CIRCLE_ZOOM, duration: 700 });
    return;
  }

  if (allCoordinates.length === 1) {
    map.flyTo({ center: allCoordinates[0], zoom: 15, duration: 700 });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  allCoordinates.forEach((coordinate) => bounds.extend(coordinate));
  map.fitBounds(bounds, {
    padding: { top: 90, right: 40, bottom: 75, left: 40 },
    maxZoom: 15,
    duration: 700,
  });
}

// ==================================================
// CLEAR SELECTED ROUTE
// ==================================================

function clearSelectedRoute() {
  selectedRouteId = null;
  pendingSelectedRouteId = null;

  const searchInput =
    document.getElementById(
      "routeSearchInput"
    );

  if (searchInput) {
    searchInput.value = "";
  }

  const list =
    document.getElementById(
      "routeList"
    );

  if (list) {
    list.classList.add("hidden");
    list.innerHTML = "";
  }

  const clearButton =
    document.getElementById(
      "clearRouteButton"
    );

  if (clearButton) {
    clearButton.classList.add("hidden");
  }

  updateRoutePicker();
  updateRouteLayers();
  updateBusMarkers();
  updateBusLegend();

  if (map) {
    hasUserMovedMap = false;
    map.flyTo({
      center: QC_CIRCLE_CENTER,
      zoom: QC_CIRCLE_ZOOM,
      duration: 700,
    });
  }
}


// ==================================================
// BUILD ALL ROUTE FEATURES
// ==================================================

function getAllRouteFeatures() {
  const routes =
    Array.isArray(
      AppState.routes
    )
      ? AppState.routes
      : [];


  return routes
    .map(route => {

      const geometry =
        parseRouteGeometry(route);

      if (!geometry) {
        return null;
      }


      return {
        type: "Feature",

        properties: {
          routeId:
            route.id,

          routeCode:
            route.code || "",

          routeName:
            route.name || "",

          color:
            getRouteColor(route),
        },

        geometry,
      };
    })
    .filter(Boolean);
}


// ==================================================
// ROUTE LAYERS
// ==================================================

function updateRouteLayers() {
  if (!map) return;

  if (!map.isStyleLoaded()) {
    return;
  }


  const features =
    getAllRouteFeatures();


  const allRoutesData = {
    type: "FeatureCollection",
    features,
  };


  // ==================================================
  // ALL ROUTES SOURCE
  // ==================================================

  if (!map.getSource("all-routes")) {
    map.addSource("all-routes", {
      type: "geojson",
      data: allRoutesData,
    });
  }


  // ==================================================
  // ALL ROUTES CASING
  // ==================================================

  if (!map.getLayer("all-routes-casing")) {
    map.addLayer({
      id: "all-routes-casing",

      type: "line",

      source: "all-routes",

      layout: {
        "line-cap": "round",
        "line-join": "round",
      },

      paint: {
        "line-color": "#ffffff",
        "line-width": 7,
        "line-opacity": 0.9,
      },
    });
  }


  // ==================================================
  // ALL ROUTES LINE
  // ==================================================

  if (!map.getLayer("all-routes-line")) {
    map.addLayer({
      id: "all-routes-line",

      type: "line",

      source: "all-routes",

      layout: {
        "line-cap": "round",
        "line-join": "round",
      },

      paint: {
        "line-color": [
          "coalesce",
          ["get", "color"],
          "#1e40af",
        ],

        "line-width": 5,

        "line-opacity": 0.9,
      },
    });
  }


  // ==================================================
  // SELECTED ROUTE SOURCE
  // ==================================================

  if (!map.getSource("selected-route")) {
    map.addSource("selected-route", {
      type: "geojson",

      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }


  // ==================================================
  // SELECTED ROUTE CASING
  // ==================================================

  if (!map.getLayer("selected-route-casing")) {
    map.addLayer({
      id: "selected-route-casing",

      type: "line",

      source: "selected-route",

      layout: {
        "line-cap": "round",
        "line-join": "round",
      },

      paint: {
        "line-color": "#ffffff",

        "line-width": 10,

        "line-opacity": 0,
      },
    });
  }


  // ==================================================
  // SELECTED ROUTE LINE
  // ==================================================

  if (!map.getLayer("selected-route-line")) {
    map.addLayer({
      id: "selected-route-line",

      type: "line",

      source: "selected-route",

      layout: {
        "line-cap": "round",
        "line-join": "round",
      },

      paint: {
        "line-color": "#1e40af",

        "line-width": 7,

        "line-opacity": 0,
      },
    });
  }


  routeLayersInitialized = true;


  // ==================================================
  // UPDATE ALL ROUTES DATA
  // ==================================================

  const allRoutesSource =
    map.getSource("all-routes");

  if (allRoutesSource) {
    allRoutesSource.setData(
      allRoutesData
    );
  }


  // ==================================================
  // SELECTED ROUTE
  // ==================================================

  if (selectedRouteId) {

    const route =
      getRouteById(
        selectedRouteId
      );


    const geometry =
      route
        ? parseRouteGeometry(route)
        : null;


    if (route && geometry) {

      const color =
        getRouteColor(route);


      const selectedData = {
        type: "FeatureCollection",

        features: [
          {
            type: "Feature",

            properties: {
              routeId:
                selectedRouteId,
            },

            geometry,
          },
        ],
      };


      const selectedSource =
        map.getSource(
          "selected-route"
        );


      if (selectedSource) {
        selectedSource.setData(
          selectedData
        );
      }


      // Highlight selected route

      if (
        map.getLayer(
          "selected-route-line"
        )
      ) {
        map.setPaintProperty(
          "selected-route-line",
          "line-color",
          color
        );

        map.setPaintProperty(
          "selected-route-line",
          "line-opacity",
          1
        );
      }


      if (
        map.getLayer(
          "selected-route-casing"
        )
      ) {
        map.setPaintProperty(
          "selected-route-casing",
          "line-opacity",
          0.95
        );
      }


      // Dim other routes

      if (
        map.getLayer(
          "all-routes-line"
        )
      ) {
        map.setPaintProperty(
          "all-routes-line",
          "line-opacity",
          [
            "case",

            [
              "==",
              ["get", "routeId"],
              selectedRouteId,
            ],

            1,

            0.25,
          ]
        );
      }


      if (
        map.getLayer(
          "all-routes-casing"
        )
      ) {
        map.setPaintProperty(
          "all-routes-casing",
          "line-opacity",
          0.35
        );
      }


      // ==================================================
      // SHOW STOPS
      // ==================================================

      updateStopMarkers();

      return;
    }
  }


  // ==================================================
  // NO SELECTED ROUTE
  // ==================================================

  if (
    map.getLayer(
      "all-routes-line"
    )
  ) {
    map.setPaintProperty(
      "all-routes-line",
      "line-opacity",
      0.9
    );
  }


  if (
    map.getLayer(
      "all-routes-casing"
    )
  ) {
    map.setPaintProperty(
      "all-routes-casing",
      "line-opacity",
      0.9
    );
  }


  if (
    map.getLayer(
      "selected-route-line"
    )
  ) {
    map.setPaintProperty(
      "selected-route-line",
      "line-opacity",
      0
    );
  }


  if (
    map.getLayer(
      "selected-route-casing"
    )
  ) {
    map.setPaintProperty(
      "selected-route-casing",
      "line-opacity",
      0
    );
  }


  const selectedSource =
    map.getSource(
      "selected-route"
    );


  if (selectedSource) {
    selectedSource.setData({
      type: "FeatureCollection",
      features: [],
    });
  }


  // Remove stops

  stopMarkers.forEach(
    marker => marker.remove()
  );

  stopMarkers = [];
}


// ==================================================
// STOP MARKERS
// ==================================================

function updateStopMarkers() {
  if (!map) return;

  if (activeStopPopup) {
    activeStopPopup.remove();
    activeStopPopup = null;
  }


  // Remove previous stop markers

  stopMarkers.forEach(
    marker => marker.remove()
  );

  stopMarkers = [];


  // No selected route = no stops

  if (!selectedRouteId) {
    return;
  }


  // ==================================================
  // GET STOPS FROM APPSTATE
  // ==================================================

  const stops =
    getStopsForRoute(
      selectedRouteId
    );


  console.log(
    "Stops for selected route:",
    selectedRouteId,
    stops
  );


  if (!stops.length) {
    console.log(
      "No stops found for route:",
      selectedRouteId
    );

    return;
  }


  // ==================================================
  // CREATE NUMBERED STOP MARKERS
  // ==================================================

  stops.forEach(
    (stop, index) => {

      const coordinates =
        getStopCoordinates(
          stop
        );


      if (!coordinates) {
        console.warn(
          "Stop has no valid coordinates:",
          stop
        );

        return;
      }


      const [lng, lat] =
        coordinates;


      const stopName =
        stop.name ||
        stop.stopName ||
        `Stop ${index + 1}`;


      const stopPlace =
        stop.location ||
        stop.address ||
        stop.place ||
        "";


      // ----------------------------------------------
      // Marker element
      // ----------------------------------------------

      const element =
        document.createElement(
          "div"
        );


      element.className =
        "route-stop-marker";


      element.textContent =
        index + 1;


      element.title =
        stopName;


      element.style.cssText = `
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #2563eb;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        border: 3px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        cursor: pointer;
        user-select: none;
        z-index: 5;
      `;


      // ----------------------------------------------
      // STOP POPUP
      // ----------------------------------------------

      const popup =
        new maplibregl.Popup({
          offset: 22,
          closeButton: true,
          closeOnClick: true,
          maxWidth: "280px",
          className: "stop-dropoff-popup",
        });

      popup.on("close", () => {
        if (activeStopPopup === popup) {
          activeStopPopup = null;
        }
      });


      popup.setHTML(`
        <div
          style="
            min-width:180px;
            padding:2px;
          "
        >

          <div
            style="
              display:flex;
              align-items:center;
              gap:9px;
              margin-bottom:8px;
            "
          >

            <div
              style="
                width:30px;
                height:30px;
                border-radius:50%;
                background:#2563eb;
                color:#ffffff;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:700;
                font-size:12px;
                flex-shrink:0;
              "
            >
              ${index + 1}
            </div>


            <div>

              <div
                style="
                  font-size:14px;
                  font-weight:700;
                  color:#111827;
                  line-height:1.2;
                "
              >
                ${escapeHtml(
                  stopName
                )}
              </div>


              <div
                style="
                  font-size:11px;
                  color:#6b7280;
                  margin-top:2px;
                "
              >
                Bus Stop ${index + 1}
              </div>

            </div>

          </div>


          ${
            stopPlace
              ? `
                <div
                  style="
                    border-top:1px solid #e5e7eb;
                    padding-top:8px;
                    font-size:12px;
                    color:#4b5563;
                  "
                >
                  <svg style="display:inline-block;width:14px;height:14px;vertical-align:-2px;margin-right:3px" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1116 0z"/><circle cx="12" cy="10" r="2.5" stroke-width="1.8"/></svg>${escapeHtml(
                    stopPlace
                  )}
                </div>
              `
              : ""
          }

        </div>
      `);


      // ----------------------------------------------
      // Prevent map background click
      // ----------------------------------------------

      element.addEventListener(
        "pointerdown",
        event => {
          event.preventDefault();
          event.stopPropagation();
        }
      );


      element.addEventListener(
        "mousedown",
        event => {
          event.preventDefault();
          event.stopPropagation();
        }
      );


      // ----------------------------------------------
      // Confirm drop-off from the stop popup
      // ----------------------------------------------
      element.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        closeBusPopups();

        const trips = (AppState.activeTrips || []).filter(
          trip => trip.status === "active" && trip.routeId === selectedRouteId
        );
        const nearbyTrips = trips.filter(
          trip => window.isCommuterNearTripBus?.(trip)
        );
        const stopAheadTrips = trips.filter(
          trip => window.isDropoffStopAheadForTrip?.(trip, stop)
        );
        const eligibleTrips = nearbyTrips.filter(
          trip => stopAheadTrips.some(aheadTrip => aheadTrip.id === trip.id)
        );
        const tripEtas = stopAheadTrips.map(trip => {
          const bus = (AppState.buses || []).find(
            activeBus => activeBus.tripId === trip.id
          );

          return {
            busName: bus?.code || trip.busCode || trip.busId || "Bus",
            eta: getEta(bus, stop),
          };
        });
        const selectedTripId = eligibleTrips.some(
          trip => trip.id === AppState.dropoff?.tripId
        )
          ? AppState.dropoff.tripId
          : eligibleTrips.length === 1
            ? eligibleTrips[0].id
            : "";

        const renderStopPopup = () => `
          <div style="min-width:200px; padding:2px;">
            <div style="display:flex; align-items:center; gap:9px; margin-bottom:8px;">
              <div style="width:30px; height:30px; border-radius:50%; background:#2563eb; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">
                ${index + 1}
              </div>
              <div>
                <div style="font-size:14px; font-weight:700; color:#111827;">${escapeHtml(stopName)}</div>
                <div style="font-size:11px; color:#6b7280; margin-top:2px;">Bus Stop ${index + 1}</div>
              </div>
            </div>
            ${stopPlace ? `<div style="border-top:1px solid #e5e7eb; padding-top:8px; font-size:12px; color:#4b5563;">${escapeHtml(stopPlace)}</div>` : ""}
            ${tripEtas.length ? `
              <div style="margin-top:10px; border-top:1px solid #e5e7eb; padding-top:8px;">
                <div style="font-size:11px; font-weight:600; color:#4b5563; margin-bottom:4px;">Bus arrival estimates</div>
                ${tripEtas.map(({ busName, eta }) => `
                  <div style="display:flex; justify-content:space-between; gap:10px; font-size:11px; color:#4b5563; margin-top:3px;">
                    <span>${escapeHtml(busName)}</span>
                    <span style="font-weight:600; text-align:right;">${escapeHtml(eta.label)}</span>
                  </div>
                `).join("")}
              </div>
            ` : ""}
              ${eligibleTrips.length > 1 ? `
              <label style="display:block; margin-top:10px; font-size:11px; color:#4b5563;">
                Bus you are riding
                <select id="dropoffTripSelect" style="display:block; width:100%; margin-top:4px; padding:7px; border:1px solid #d1d5db; border-radius:6px; background:#fff;">
                  <option value="">Select an active bus</option>
                  ${eligibleTrips.map(trip => `
                    <option value="${escapeHtml(trip.id)}" ${trip.id === selectedTripId ? "selected" : ""}>
                      ${escapeHtml(trip.busCode || trip.busId || "Bus")}
                    </option>
                  `).join("")}
                </select>
              </label>
            ` : eligibleTrips.length === 1 ? `
              <div style="margin-top:10px; font-size:11px; color:#4b5563;">Active bus: ${escapeHtml(eligibleTrips[0].busCode || eligibleTrips[0].busId || "Bus")}</div>
            ` : trips.length && nearbyTrips.length === 0 ? `
              <div style="margin-top:10px; font-size:11px; color:#b91c1c;">
                ${AppState.userLocation ? `Get within ${DROPOFF_BUS_RADIUS_METERS} m of an active bus on this route to choose a stop.` : "Waiting for your location. Allow location access to choose a stop near your bus."}
              </div>
            ` : trips.length ? `
              <div style="margin-top:10px; font-size:11px; color:#b91c1c;">
                This stop has already been passed, or the bus's next stop cannot be verified. Choose a later stop.
              </div>
            ` : `
              <div style="margin-top:10px; font-size:11px; color:#b91c1c;">No active bus is running on this route.</div>
            `}
            <button id="confirmDropoffButton" type="button" ${selectedTripId ? "" : "disabled"} style="width:100%; margin-top:10px; padding:9px 12px; border:0; border-radius:7px; background:${selectedTripId ? "#115272" : "#9ca3af"}; color:#fff; font-size:12px; font-weight:700; cursor:${selectedTripId ? "pointer" : "not-allowed"};">
              ${AppState.dropoff?.tripId === selectedTripId && AppState.dropoff?.stopId === stop.id ? "Drop-off confirmed" : "Confirm this stop"}
            </button>
            <p id="dropoffConfirmMessage" aria-live="polite" style="margin-top:6px; font-size:11px; color:#15803d;"></p>
          </div>
        `;

        if (activeStopPopup) {
          activeStopPopup.remove();
        }

        activeStopPopup = popup;
        popup.setLngLat([lng, lat]).setHTML(renderStopPopup()).addTo(map);

        const popupElement = popup.getElement();
        const confirmButton = popupElement.querySelector("#confirmDropoffButton");
        const tripSelect = popupElement.querySelector("#dropoffTripSelect");

        if (tripSelect) {
          tripSelect.addEventListener("change", () => {
            if (confirmButton) {
              const selectedTrip = eligibleTrips.find(
                trip => trip.id === tripSelect.value
              );
              const canConfirm = Boolean(
                selectedTrip && window.isDropoffStopAheadForTrip?.(selectedTrip, stop)
              );
              confirmButton.disabled = !canConfirm;
              confirmButton.style.background = canConfirm ? "#115272" : "#9ca3af";
              confirmButton.style.cursor = canConfirm ? "pointer" : "not-allowed";
            }

            if (eligibleTrips.some(trip => trip.id === tripSelect.value)) {
              window.selectDropoffTrip(tripSelect.value);
            }
          });
        }

        confirmButton?.addEventListener("click", async () => {
          const tripId = tripSelect?.value || selectedTripId;
          if (!tripId) return;

          const selectedTrip = eligibleTrips.find((trip) => trip.id === tripId);
          if (!selectedTrip || !window.isDropoffStopAheadForTrip?.(selectedTrip, stop)) {
            confirmButton.disabled = true;
            confirmButton.style.background = "#9ca3af";
            confirmButton.style.cursor = "not-allowed";
            const message = popupElement.querySelector("#dropoffConfirmMessage");
            if (message) {
              message.style.color = "#b91c1c";
              message.textContent = "The bus has passed this stop. Choose a later stop.";
            }
            return;
          }

          confirmButton.disabled = true;
          confirmButton.textContent = "Saving...";
          const confirmed = await window.confirmDropoffStop(tripId, stop);
          const message = popupElement.querySelector("#dropoffConfirmMessage");

          if (confirmed) {
            confirmButton.textContent = "Drop-off confirmed";
            if (message) message.textContent = "Your expected drop-off has been saved.";
          } else {
            confirmButton.disabled = false;
            confirmButton.textContent = "Confirm this stop";
          }
        });
      });


      // ----------------------------------------------
      // Create marker
      // ----------------------------------------------

      const marker =
        new maplibregl.Marker({
          element,
          anchor: "center",
        })
          .setLngLat([
            lng,
            lat,
          ])
          .addTo(map);


      stopMarkers.push(
        marker
      );
    }
  );
}


// ==================================================
// BUS MARKERS
// ==================================================

function updateBusMarkers() {
  if (!map) return;

  if (
    !window.AppState ||
    !Array.isArray(
      AppState.buses
    )
  ) {
    return;
  }


  const buses = selectedRouteId
    ? AppState.buses.filter(
        bus => bus.tripActive === true && bus.routeId === selectedRouteId
      )
    : [];

  const busesWithCoordinates = buses.flatMap(bus => {
    const coordinates = getBusCoordinates(bus);
    return coordinates ? [{ bus, coordinates }] : [];
  });
  const visibleBusIds = new Set(
    busesWithCoordinates.map(({ bus }) => bus.id)
  );

  busMarkers = busMarkers.filter(({ busId, marker, popup, animation }) => {
    if (visibleBusIds.has(busId)) return true;
    if (animation?.frame !== null && animation?.frame !== undefined) cancelAnimationFrame(animation.frame);
    popup.remove();
    marker.remove();
    return false;
  });

  const getPopupContent = bus => {
    const displayId = bus.code || bus.id || "BUS";
    const capacity = Number(bus.capacity) || 0;
    const passengers = Number(bus.onboard) || 0;
    const availableSeats = Math.max(capacity - passengers, 0);
    const speed = Number(bus.speedKmh);
    const nextStopEta = window.getNextStopEtaForBus?.(bus);
    const locationDate = bus.locationUpdatedAt?.toDate
      ? bus.locationUpdatedAt.toDate()
      : bus.locationUpdatedAt instanceof Date
        ? bus.locationUpdatedAt
        : bus.locationUpdatedAt
          ? new Date(bus.locationUpdatedAt)
          : null;
    const locationUpdated = locationDate && Number.isFinite(locationDate.getTime())
      ? locationDate.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Unavailable";

    return `
      <div style="min-width:190px">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px">
          ${escapeHtml(displayId)}
        </div>
        ${bus.tripActive && bus.directionLabel ? `<div style="font-size:12px;color:#115272;font-weight:700;margin-bottom:6px">Going: ${escapeHtml(bus.directionLabel)}</div>` : ""}
        ${!bus.tripActive || !bus.directionLabel ? `<div style="font-size:12px;color:#6b7280;margin-bottom:6px">${escapeHtml(bus.route || "No route assigned")}</div>` : ""}
        ${nextStopEta ? `<div style="font-size:12px;color:#115272;font-weight:600;margin-bottom:6px">Next stop: ${escapeHtml(nextStopEta.stop.name || "Bus stop")} · ${escapeHtml(nextStopEta.eta.label)}</div>` : ""}
        <div style="font-size:12px;color:#16a34a;font-weight:600">
          ● ${escapeHtml(bus.status || "On Trip")}
        </div>
        <div style="margin-top:8px;font-size:12px;color:#555">
          Passengers: <strong>${passengers}/${capacity}</strong>
        </div>
        <div style="margin-top:4px;font-size:12px;color:#555">
          Available seats: <strong>${availableSeats}</strong>
        </div>
        <div style="margin-top:4px;font-size:12px;color:#555">
          Speed: <strong>${Number.isFinite(speed) ? `${speed} km/h` : "Unavailable"}</strong>
        </div>
        <div style="margin-top:4px;font-size:11px;color:#888">
          Location updated: ${escapeHtml(locationUpdated)}
        </div>
      </div>
    `;
  };

    const getBusNextStopDirection = bus => {
      const nextStopEta = window.getNextStopEtaForBus?.(bus);
      const nextStop = nextStopEta?.stop;
      if (!nextStop || !map) return null;

      const busLat = Number(bus.lat);
      const busLng = Number(bus.lng);
      const stopLat = Number(nextStop.lat ?? nextStop.latitude);
      const stopLng = Number(nextStop.lng ?? nextStop.longitude);
      if (![busLat, busLng, stopLat, stopLng].every(Number.isFinite)) return null;

      const busPoint = map.project([busLng, busLat]);
      const stopPoint = map.project([stopLng, stopLat]);
      const dx = stopPoint.x - busPoint.x;
      const dy = stopPoint.y - busPoint.y;
      if (Math.hypot(dx, dy) < 1) return null;

      return {
        angle: Math.atan2(dx, -dy) * 180 / Math.PI,
        stopName: nextStop.name || nextStop.stopName || "next bus stop",
      };
    };

    const getMarkerContent = bus => {
    const routeColor =
      bus.routeColor ||
      getRouteColor(getRouteById(bus.routeId));
      const nextStopDirection = getBusNextStopDirection(bus);

    return `
      <div class="relative">
        ${nextStopDirection ? `
          <div
            title="Next stop: ${escapeHtml(nextStopDirection.stopName)}"
            aria-hidden="true"
            style="position:absolute; z-index:2; left:50%; top:-20px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border:2px solid #fff; border-radius:50%; background:#fff; box-shadow:0 1px 5px rgba(0,0,0,.3); transform:translateX(-50%) rotate(${nextStopDirection.angle}deg);"
          >
            <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:#115272;">
              <path d="M12 2 21 22 12 17 3 22 12 2Z" />
            </svg>
          </div>
        ` : ""}
        <div
          class="w-11 h-11 rounded-lg shadow-lg flex items-center justify-center border-2 border-white overflow-hidden"
          style="background:${escapeHtml(routeColor)}"
        >
          <img
            src="../images/bus (2).png"
            alt="Bus"
            style="
              width: 26px;
              height: 26px;
              object-fit: contain;
              filter: brightness(0) invert(1);
            "
          />
        </div>
        <div
          class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rotate-45"
          style="background:${escapeHtml(routeColor)}"
        ></div>
      </div>
    `;
  };

  busesWithCoordinates.forEach(({ bus, coordinates }) => {
    const existing = busMarkers.find(entry => entry.busId === bus.id);

    if (existing) {
      animateMarkerTo(existing.marker, existing.animation, coordinates, 900, position => {
        if (existing.popup.isOpen()) existing.popup.setLngLat(position);
      });
      const markerElement = existing.marker.getElement();
      markerElement.innerHTML = getMarkerContent(bus);
      markerElement.setAttribute(
        "aria-label",
        `Show details for ${bus.code || bus.id || "bus"}`
      );
      existing.popup.setHTML(getPopupContent(bus));
      if (existing.popup.isOpen()) {
        existing.popup.setLngLat(coordinates);
      }
      return;
    }

    const markerElement = document.createElement("div");
    markerElement.className = "custom-bus-marker";
    markerElement.setAttribute("role", "button");
    markerElement.setAttribute("tabindex", "0");
    markerElement.setAttribute(
      "aria-label",
      `Show details for ${bus.code || bus.id || "bus"}`
    );
    markerElement.innerHTML = getMarkerContent(bus);
    const popup = new maplibregl.Popup({
      offset: 28,
      closeButton: true,
      closeOnClick: true,
      className: "bus-tooltip",
    }).setHTML(getPopupContent(bus));

    let marker;
    const openPopup = event => {
      event.stopPropagation();
      if (popup.isOpen()) {
        popup.remove();
      } else {
        closeBusPopups(popup);
        if (activeStopPopup) {
          activeStopPopup.remove();
          activeStopPopup = null;
        }
        popup.setLngLat(marker.getLngLat()).addTo(map);
      }
    };
    markerElement.addEventListener("click", openPopup);
    markerElement.addEventListener("mousedown", event => {
      event.stopPropagation();
    });
    markerElement.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPopup(event);
      }
    });

    marker = new maplibregl.Marker({
      element: markerElement,
      anchor: "bottom",
    })
      .setLngLat(coordinates)
      .addTo(map);
    popup.on("close", () => {
      markerElement.setAttribute("aria-expanded", "false");
    });
    markerElement.addEventListener("click", () => {
      markerElement.setAttribute(
        "aria-expanded",
        String(popup.isOpen())
      );
    });

    busMarkers.push({ busId: bus.id, marker, popup, animation: { frame: null } });
  });
}


// ==================================================
// BUS LEGEND
// ==================================================

function updateBusLegend() {
  const legend =
    document.getElementById(
      "busLegend"
    );

  if (!legend) return;


  if (
    !window.AppState ||
    !Array.isArray(
      AppState.buses
    )
  ) {
    return;
  }


  const buses = selectedRouteId
    ? AppState.buses.filter(
        bus => bus.tripActive === true && bus.routeId === selectedRouteId
      )
    : [];


  if (
    buses.length === 0
  ) {

    legend.innerHTML = `
      <p
        class="
          text-xs
          text-gray-400
        "
      >
        ${
          selectedRouteId
            ? "No buses currently on this route."
            : "Select a route to view active buses."
        }
      </p>
    `;

    return;
  }


  legend.innerHTML =
    buses
      .map(bus => {

        const code =
          escapeHtml(
            bus.code ||
            bus.id ||
            "BUS"
          );


        const route =
          escapeHtml(
            bus.route ||
            "No route"
          );


        const status =
          escapeHtml(
            bus.status ||
            "Idle"
          );


        return `
          <div
            class="
              flex-shrink-0
              px-3
              py-2
              bg-gray-50
              rounded-lg
              border
              border-gray-100
            "
          >

            <p
              class="
                text-xs
                font-medium
                text-gray-800
              "
            >
              ${code}
            </p>


            <p
              class="
                text-xs
                text-gray-500
              "
            >
              ${route}
            </p>



            ${
              bus.tripActive
                ? `
                  <p
                    class="
                      text-xs
                      text-green-600
                      mt-1
                    "
                  >
                    ${Number(bus.onboard) || 0}/${Number(bus.capacity) || 0}
                    onboard
                  </p>
                `
                : `
                  <p
                    class="
                      text-xs
                      text-gray-400
                      mt-1
                    "
                  >
                    ${status}
                  </p>
                `
            }

          </div>
        `;
      })
      .join("");
}


// ==================================================
// USER LOCATION
// ==================================================

function centerMapOnCommuter() {
  if (!map) return;

  const location = AppState.userLocation || AppState.nearbyLocation;
  if (!location) return;

  hasUserMovedMap = true;
  map.easeTo({
    center: [location.lng, location.lat],
    zoom: Math.max(map.getZoom(), 15),
    duration: 600,
  });
}

function getUserLocation() {
  if (!navigator.geolocation) {
    console.warn("Commuter location is unavailable in this browser.");
    return;
  }

  userLocationWatchId = navigator.geolocation.watchPosition(
    pos => {
      if (!map) return;

      const {
        latitude,
        longitude,
        accuracy,
      } = pos.coords;

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180 ||
        !Number.isFinite(accuracy) ||
        accuracy < 0
      ) {
        AppState.userLocation = null;
        return;
      }

      const nextLocation = {
        lat: latitude,
        lng: longitude,
      };

      const distanceFromDisplayedKm = displayedUserLocation
        ? getDistanceKm(displayedUserLocation, nextLocation)
        : null;
      const minimumMovementMeters = Math.max(3, Math.min(8, accuracy * 0.15));

      AppState.userLocation = {
        ...nextLocation,
        accuracy,
        updatedAt: Date.now(),
      };
      const centerButton = document.getElementById("centerMapButton");
      if (centerButton) centerButton.disabled = false;
      if (!userMarker) {
        const userElement = document.createElement("div");

        userElement.className = "user-marker";

        userElement.addEventListener("click", event => {
          event.stopPropagation();
        });

        userElement.addEventListener("mousedown", event => {
          event.stopPropagation();
        });

        userElement.innerHTML = `
          <div class="relative">
            <div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>
          </div>
        `;

        userMarker = new maplibregl.Marker({
          element: userElement,
          anchor: "center",
        })
          .setLngLat([longitude, latitude])
          .setPopup(
            new maplibregl.Popup({ offset: 12 }).setHTML(`
              <div style="font-size:12px">You are here</div>
            `)
          )
          .addTo(map);
        displayedUserLocation = nextLocation;
      } else if (
        distanceFromDisplayedKm === null ||
        distanceFromDisplayedKm * 1000 >= minimumMovementMeters
      ) {
        animateMarkerTo(userMarker, userLocationAnimation, [longitude, latitude], 700);
        displayedUserLocation = nextLocation;
      }

      if (!hasCenteredOnUser) {
        hasCenteredOnUser = true;
        if (!hasUserMovedMap) {
          map.easeTo({
            center: [longitude, latitude],
            duration: 500,
          });
        }
      }
    },
    error => {
      console.warn("Unable to get commuter location:", error.message);
      const centerButton = document.getElementById("centerMapButton");
      if (centerButton && !AppState.nearbyLocation) centerButton.disabled = true;
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    }
  );
}


// ==================================================
// DESTROY MAP
// ==================================================

function destroyMap() {
  if (userLocationAnimation.frame !== null) {
    cancelAnimationFrame(userLocationAnimation.frame);
    userLocationAnimation.frame = null;
  }
  if (userLocationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(userLocationWatchId);
    userLocationWatchId = null;
  }

  if (window.AppState) {
    AppState.userLocation = null;
  }
  displayedUserLocation = null;
  hasUserMovedMap = false;
  hasCenteredOnUser = false;

  if (activeStopPopup) {
    activeStopPopup.remove();
    activeStopPopup = null;
  }

  busMarkers.forEach(
    ({ marker, popup, animation }) => {
      if (animation?.frame !== null && animation?.frame !== undefined) cancelAnimationFrame(animation.frame);
      popup.remove();
      marker.remove()
    }
  );

  busMarkers = [];


  stopMarkers.forEach(
    marker =>
      marker.remove()
  );

  stopMarkers = [];


  if (userMarker) {
    userMarker.remove();

    userMarker = null;
  }


  const routePicker =
    document.getElementById(
      "routePicker"
    );

  if (routePicker) {
    routePicker.remove();
  }


  if (map) {
    map.remove();

    map = null;
  }


  selectedRouteId = null;
  pendingSelectedRouteId = null;

  routeLayersInitialized = false;
}


// ==================================================
// GLOBALS
// ==================================================

window.initMap =
  initMap;

window.updateBusMarkers =
  updateBusMarkers;

window.updateBusLegend =
  updateBusLegend;

window.updateRouteLayers =
  updateRouteLayers;

window.selectMapRoute =
  selectRoute;

window.updateRoutePicker =
  updateRoutePicker;

window.clearSelectedRoute =
  clearSelectedRoute;

window.centerMapOnCommuter =
  centerMapOnCommuter;

window.destroyMap =
  destroyMap;
