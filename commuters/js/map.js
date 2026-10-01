import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";

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

let selectedRouteId = null;

let routeLayersInitialized = false;


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


  if (map) {
    map.resize();

    updateRoutePicker();
    updateRouteLayers();
    updateBusMarkers();
    updateBusLegend();

    return;
  }


  routeLayersInitialized = false;


  createRoutePicker();


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


  map.on("load", () => {
    if (!map) return;

    updateRouteLayers();
    updateBusMarkers();
    updateBusLegend();
    getUserLocation();

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


  const existing =
    document.getElementById(
      "routePicker"
    );

  if (existing) {
    updateRoutePicker();
    return;
  }


  const wrapper =
    document.createElement("div");

  wrapper.id =
    "routePicker";

  wrapper.className =
    "mb-3";


  wrapper.innerHTML = `
    <div
      class="
        bg-white
        rounded-2xl
        border
        border-gray-100
        shadow-sm
        p-3
      "
    >

      <div
        class="
          flex
          items-center
          justify-between
          gap-2
          mb-3
        "
      >

        <div>
          <p
            class="
              text-sm
              font-semibold
              text-gray-800
            "
          >
            QC Bus Routes
          </p>

          <p
            class="
              text-[11px]
              text-gray-400
              mt-0.5
            "
          >
            Tap a route or its line on the map
          </p>
        </div>


        <button
          id="clearRouteButton"
          type="button"
          class="
            hidden
            text-xs
            font-semibold
            text-qc-purple
            px-2
            py-1
            rounded-lg
            hover:bg-purple-50
          "
        >
          All routes
        </button>

      </div>


      <div
        class="
          relative
          mb-3
        "
      >

        <input
          id="routeSearchInput"
          type="search"
          placeholder="Search route..."
          class="
            w-full
            px-3
            py-2.5
            pl-9
            text-sm
            bg-gray-50
            border
            border-gray-200
            rounded-xl
            outline-none
            focus:border-qc-purple
          "
        >

        <span
          class="
            absolute
            left-3
            top-1/2
            -translate-y-1/2
            text-gray-400
            text-sm
          "
        >
          🔍
        </span>

      </div>


      <div
        id="routeList"
        class="
          space-y-2
          max-h-52
          overflow-y-auto
        "
      ></div>

    </div>
  `;


  mapContainer.parentNode.insertBefore(
    wrapper,
    mapContainer
  );


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
  }


  const clearButton =
    document.getElementById(
      "clearRouteButton"
    );

  if (clearButton) {
    clearButton.addEventListener(
      "click",
      clearSelectedRoute
    );
  }


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

  if (!list) return;


  const routes =
    Array.isArray(
      AppState.routes
    )
      ? AppState.routes
      : [];


  const search =
    String(searchTerm || "")
      .trim()
      .toLowerCase();


  const filteredRoutes =
    routes.filter(route => {

      if (!search) {
        return true;
      }

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
          py-5
          text-center
          text-xs
          text-gray-400
        "
      >
        No routes found.
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
              py-3
              transition
              ${
                selected
                  ? "border-gray-300 bg-gray-50 shadow-sm"
                  : "border-gray-100 bg-white hover:bg-gray-50"
              }
            "
          >

            <div
              class="
                flex
                items-center
                gap-3
              "
            >

              <span
                class="
                  w-4
                  h-4
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
                    text-sm
                    font-semibold
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
                    text-xs
                    text-gray-500
                    truncate
                    mt-0.5
                  "
                >
                  ${escapeHtml(
                    route.name ||
                    "Unnamed route"
                  )}
                </p>

              </div>


              <span
                class="
                  text-gray-300
                  text-lg
                  leading-none
                "
              >
                ›
              </span>

            </div>

          </button>
        `;
      })
      .join("");


  list
    .querySelectorAll(
      "[data-route-id]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const routeId =
            button.dataset.routeId;

          selectRoute(routeId);
        }
      );
    });


  const clearButton =
    document.getElementById(
      "clearRouteButton"
    );

  if (clearButton) {
    clearButton.classList.toggle(
      "hidden",
      !selectedRouteId
    );
  }
}


// ==================================================
// SELECT ROUTE
// ==================================================

function selectRoute(routeId) {
  const route =
    getRouteById(routeId);

  if (!route) return;


  // Same route stays selected
  if (selectedRouteId === routeId) {
    return;
  }


  selectedRouteId =
    routeId;


  updateRoutePicker();
  updateRouteLayers();
  updateBusMarkers();
  updateBusLegend();

  fitMapToRoute(route);
}


// ==================================================
// CLEAR SELECTED ROUTE
// ==================================================

function clearSelectedRoute() {
  selectedRouteId = null;


  updateRoutePicker();
  updateRouteLayers();
  updateBusMarkers();
  updateBusLegend();

  resetMapView();
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
  
  let activeStopPopup = null;
  let tooltipTimer = null;


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
        z-index: 20;
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
                  📍 ${escapeHtml(
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
      // Click numbered stop
      // ----------------------------------------------
let tooltipTimer;

element.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();

  clearTimeout(tooltipTimer);

  popup
    .setLngLat([lng, lat])
    .setHTML(`
      <div style="font-weight:700; font-size:14px;">
        ${stopName}
      </div>
      ${
        stopPlace
          ? `<div style="font-size:12px; color:#666; margin-top:3px;">
              ${stopPlace}
            </div>`
          : ""
      }
    `)
    .addTo(map);

  tooltipTimer = setTimeout(() => {
    popup.remove();
  }, 2500);
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
// FIT MAP TO ROUTE
// ==================================================

function fitMapToRoute(route) {
  if (!map) return;


  const geometry =
    parseRouteGeometry(
      route
    );


  let coordinates =
    getGeometryCoordinates(
      geometry
    );


  // Fallback to stops

  if (
    coordinates.length === 0
  ) {

    coordinates =
      getStopsForRoute(
        route.id
      )
        .map(
          stop =>
            getStopCoordinates(
              stop
            )
        )
        .filter(Boolean);
  }


  if (
    coordinates.length === 0
  ) {
    return;
  }


  const bounds =
    new maplibregl.LngLatBounds();


  coordinates.forEach(
    coordinate => {

      if (
        Array.isArray(
          coordinate
        ) &&
        coordinate.length >= 2
      ) {

        const lng =
          Number(
            coordinate[0]
          );

        const lat =
          Number(
            coordinate[1]
          );


        if (
          Number.isFinite(lng) &&
          Number.isFinite(lat)
        ) {
          bounds.extend([
            lng,
            lat,
          ]);
        }
      }
    }
  );


  if (
    bounds.isEmpty()
  ) {
    return;
  }


  map.fitBounds(
    bounds,
    {
      padding: {
        top: 100,
        bottom: 100,
        left: 40,
        right: 40,
      },

      maxZoom: 15,

      duration: 800,
    }
  );
}


// ==================================================
// RESET MAP VIEW
// ==================================================

function resetMapView() {
  if (!map) return;


  map.flyTo({
    center:
      QC_CIRCLE_CENTER,

    zoom:
      QC_CIRCLE_ZOOM,

    duration:
      800,
  });
}


// ==================================================
// BUS MARKERS
// ==================================================

function updateBusMarkers() {
  if (!map) return;


  busMarkers.forEach(
    marker =>
      marker.remove()
  );

  busMarkers = [];


  if (
    !window.AppState ||
    !Array.isArray(
      AppState.buses
    )
  ) {
    return;
  }


  const buses =
    selectedRouteId
      ? AppState.buses.filter(
          bus =>
            bus.routeId ===
            selectedRouteId
        )
      : AppState.buses;


  buses.forEach(
    bus => {

      const coordinates =
        getBusCoordinates(
          bus
        );


      if (!coordinates) {
        return;
      }


      const displayId =
        bus.code ||
        bus.id ||
        "BUS";


      const shortId =
        displayId.includes("-")
          ? displayId
              .split("-")
              .pop()
          : displayId;


      const route =
        escapeHtml(
          bus.route ||
          "No route assigned"
        );


      const status =
        escapeHtml(
          bus.status ||
          "Idle"
        );


      const routeColor =
        bus.routeColor ||
        getRouteColor(
          getRouteById(
            bus.routeId
          )
        );


      const markerElement =
        document.createElement(
          "div"
        );


      markerElement.className =
        "custom-bus-marker";


      markerElement.addEventListener(
        "click",
        event => {
          event.stopPropagation();
        }
      );


      markerElement.addEventListener(
        "mousedown",
        event => {
          event.stopPropagation();
        }
      );


      markerElement.innerHTML = `
        <div class="relative">

          <div
            class="
              w-10
              h-10
              rounded-lg
              shadow-lg
              flex
              items-center
              justify-center
              text-white
              text-xs
              font-bold
              border-2
              border-white
            "
            style="
              background:${escapeHtml(
                routeColor
              )};
            "
          >
            ${escapeHtml(
              shortId
            )}
          </div>


          <div
            class="
              absolute
              -bottom-1
              left-1/2
              transform
              -translate-x-1/2
              w-2
              h-2
              rotate-45
            "
            style="
              background:${escapeHtml(
                routeColor
              )};
            "
          ></div>

        </div>
      `;


      const passengerInfo =
        bus.tripActive
          ? `
            <div
              style="
                margin-top:8px;
                font-size:12px;
                color:#555;
              "
            >
              Passengers:
              <strong>
                ${Number(bus.onboard) || 0}/${Number(bus.capacity) || 0}
              </strong>
            </div>
          `
          : `
            <div
              style="
                margin-top:8px;
                font-size:12px;
                color:#888;
              "
            >
              No active trip
            </div>
          `;


      const statusColor =
        bus.tripActive
          ? "#16a34a"
          : "#6b7280";


      const popup =
        new maplibregl.Popup({
          offset: 28,
          closeButton: true,
          closeOnClick: true,
        })
          .setHTML(`
            <div
              style="
                min-width:190px;
              "
            >

              <div
                style="
                  font-weight:700;
                  font-size:14px;
                  margin-bottom:4px;
                "
              >
                ${escapeHtml(
                  displayId
                )}
              </div>


              <div
                style="
                  font-size:12px;
                  color:#6b7280;
                  margin-bottom:6px;
                "
              >
                ${route}
              </div>


              <div
                style="
                  font-size:12px;
                  color:${statusColor};
                  font-weight:600;
                "
              >
                ● ${status}
              </div>


              ${passengerInfo}

            </div>
          `);


      const marker =
        new maplibregl.Marker({
          element:
            markerElement,

          anchor:
            "bottom",
        })
          .setLngLat(
            coordinates
          )
          .setPopup(
            popup
          )
          .addTo(map);


      busMarkers.push(
        marker
      );
    }
  );
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


  const buses =
    selectedRouteId
      ? AppState.buses.filter(
          bus =>
            bus.routeId ===
            selectedRouteId
        )
      : AppState.buses;


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
            : "No buses available."
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

function getUserLocation() {
  if (
    !navigator.geolocation
  ) {
    return;
  }


  navigator.geolocation.getCurrentPosition(
    pos => {

      if (!map) return;


      const {
        latitude,
        longitude,
      } = pos.coords;


      if (userMarker) {
        userMarker.remove();
      }


      const userElement =
        document.createElement(
          "div"
        );


      userElement.className =
        "user-marker";


      userElement.addEventListener(
        "click",
        event => {
          event.stopPropagation();
        }
      );


      userElement.addEventListener(
        "mousedown",
        event => {
          event.stopPropagation();
        }
      );


      userElement.innerHTML = `
        <div class="relative">

          <div
            class="
              w-4
              h-4
              bg-blue-500
              rounded-full
              border-2
              border-white
              shadow-lg
            "
          ></div>


          <div
            class="
              absolute
              inset-0
              w-4
              h-4
              bg-blue-500
              rounded-full
              animate-ping
              opacity-30
            "
          ></div>

        </div>
      `;


      userMarker =
        new maplibregl.Marker({
          element:
            userElement,

          anchor:
            "center",
        })
          .setLngLat([
            longitude,
            latitude,
          ])
          .setPopup(
            new maplibregl.Popup({
              offset: 12,
            }).setHTML(`
              <div
                style="
                  font-size:12px;
                "
              >
                You are here
              </div>
            `)
          )
          .addTo(map);
    },

    error => {
      console.log(
        "Geo error:",
        error
      );
    },

    {
      enableHighAccuracy:
        true,

      timeout:
        8000,
    }
  );
}


// ==================================================
// DESTROY MAP
// ==================================================

function destroyMap() {

  busMarkers.forEach(
    marker =>
      marker.remove()
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

window.destroyMap =
  destroyMap;