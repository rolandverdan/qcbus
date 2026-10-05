import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";

if (!document.querySelector("link[data-live-maplibre]")) {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css";
  stylesheet.dataset.liveMaplibre = "true";
  document.head.appendChild(stylesheet);
}

let liveMap = null;
let busMarker = null;
let stopMarkers = [];

function getCoordinates(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lng = Number(point?.lng ?? point?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng)
    ? [lng, lat]
    : null;
}

function getRouteGeometry() {
  const rawGeometry = window.AppState?.bus?.routeGeometry;
  if (!rawGeometry) return null;

  try {
    const parsed = typeof rawGeometry === "string"
      ? JSON.parse(rawGeometry)
      : rawGeometry;

    if (parsed.type === "FeatureCollection") return parsed;
    if (parsed.type === "Feature") return parsed;
    if (parsed.type && parsed.coordinates) return parsed;
  } catch (error) {
    console.warn("Unable to parse conductor route geometry:", error);
  }

  return null;
}

function getFallbackRoute() {
  const coordinates = (window.AppState?.routeStops || [])
    .map(getCoordinates)
    .filter(Boolean);

  if (coordinates.length < 2) return null;

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

function getInitialCenter() {
  const busCoordinates = getCoordinates(window.AppState?.bus);
  if (busCoordinates) return busCoordinates;

  const firstStop = (window.AppState?.routeStops || [])
    .map(getCoordinates)
    .find(Boolean);
  return firstStop || [121.0494, 14.6517];
}

function addRouteAndStops() {
  if (!liveMap) return;

  const route = getRouteGeometry() || getFallbackRoute();
  if (route) {
    liveMap.addSource("conductor-route", {
      type: "geojson",
      data: route,
    });
    liveMap.addLayer({
      id: "conductor-route-line",
      type: "line",
      source: "conductor-route",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#115272",
        "line-width": 5,
        "line-opacity": 0.9,
      },
    });
  }

  stopMarkers = (window.AppState?.routeStops || []).flatMap((stop, index) => {
    const coordinates = getCoordinates(stop);
    if (!coordinates) return [];

    const element = document.createElement("div");
    element.className = "live-map-stop-marker";
    element.textContent = String(index + 1);
    element.title = stop.name || `Stop ${index + 1}`;

    const marker = new maplibregl.Marker({ element })
      .setLngLat(coordinates)
      .addTo(liveMap);

    return [{ id: stop.id, marker, element }];
  });

  updateFloatingLiveMap();
  fitMapToRoute();
}

function fitMapToRoute() {
  if (!liveMap) return;

  const bounds = new maplibregl.LngLatBounds();
  (window.AppState?.routeStops || []).forEach((stop) => {
    const coordinates = getCoordinates(stop);
    if (coordinates) bounds.extend(coordinates);
  });

  const busCoordinates = getCoordinates(window.AppState?.bus);
  if (busCoordinates) bounds.extend(busCoordinates);

  if (!bounds.isEmpty()) {
    liveMap.fitBounds(bounds, {
      padding: 36,
      maxZoom: 15,
      duration: 0,
    });
  }
}

function ensureBusMarker() {
  if (!liveMap || busMarker) return;

  const element = document.createElement("div");
  element.className = "live-map-bus-marker";
  element.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 6v6m8-6v6M5 12h14l1 7H4l1-7Zm0 0V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M7 19v2m10-2v2" />
    </svg>
  `;

  busMarker = new maplibregl.Marker({ element, anchor: "center" });
}

function updateFloatingLiveMap() {
  const state = window.AppState;
  if (!state) return;

  const stop = state.routeStops?.find(
    (routeStop) => routeStop.id === state.currentAlightStopId
  );
  const label = document.getElementById("liveMapStopLabel");
  if (label) {
    label.textContent = stop?.name || "Nearest stop unavailable";
  }

  stopMarkers.forEach(({ id, element }) => {
    element.classList.toggle("is-nearest", id === state.currentAlightStopId);
  });

  if (!liveMap) return;

  const coordinates = getCoordinates(state.bus);
  if (!coordinates) return;

  ensureBusMarker();
  busMarker.setLngLat(coordinates);
  if (!busMarker.getElement().isConnected) busMarker.addTo(liveMap);
}

function createLiveMap() {
  if (liveMap) {
    liveMap.resize();
    updateFloatingLiveMap();
    return;
  }

  liveMap = new maplibregl.Map({
    container: "liveMapCanvas",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: getInitialCenter(),
    zoom: 12,
    attributionControl: false,
  });

  liveMap.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    "bottom-right"
  );

  liveMap.on("load", addRouteAndStops);
}

function toggleLiveMap() {
  const panel = document.getElementById("liveMapPanel");
  if (!panel) return;

  const isOpening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !isOpening);
  panel.setAttribute("aria-hidden", String(!isOpening));

  if (isOpening) {
    createLiveMap();
    requestAnimationFrame(() => liveMap?.resize());
  }
}

function setLiveMapAvailability(isAvailable) {
  const button = document.getElementById("liveMapFab");
  if (!button) return;

  button.classList.toggle("hidden", !isAvailable);
  if (!isAvailable) {
    const panel = document.getElementById("liveMapPanel");
    panel?.classList.add("hidden");
    panel?.setAttribute("aria-hidden", "true");
  }
}

document.getElementById("liveMapFab")?.addEventListener("click", toggleLiveMap);
document.getElementById("liveMapClose")?.addEventListener("click", toggleLiveMap);

window.setLiveMapAvailability = setLiveMapAvailability;
window.updateFloatingLiveMap = updateFloatingLiveMap;
setLiveMapAvailability(window.__liveMapAvailable === true);