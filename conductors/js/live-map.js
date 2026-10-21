import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";

if (!document.querySelector("link[data-live-maplibre]")) {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css";
  stylesheet.dataset.liveMaplibre = "true";
  document.head.appendChild(stylesheet);
}

let liveMap = null;
let isLiveMapLoaded = false;
let busMarker = null;
let busPopup = null;
let busMarkerAnimation = { frame: null };
let stopMarkers = [];
let lastStopsSignature = "";
let hasCenteredOnBus = false;
let hasUserMovedLiveMap = false;

function getCoordinates(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lng = Number(point?.lng ?? point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lng, lat];
}

function normalizeGeometryCoords(geometry) {
  if (!geometry || typeof geometry !== "object") return null;

  const fixPair = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return coord;
    const c0 = Number(coord[0]);
    const c1 = Number(coord[1]);
    if (!Number.isFinite(c0) || !Number.isFinite(c1)) return coord;
    if (c0 < 50 && c1 > 100) return [c1, c0];
    return [c0, c1];
  };

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(fixPair),
    };
  }
  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((line) =>
        Array.isArray(line) ? line.map(fixPair) : line
      ),
    };
  }
  if (geometry.type === "Feature" && geometry.geometry) {
    return {
      ...geometry,
      geometry: normalizeGeometryCoords(geometry.geometry),
    };
  }
  if (geometry.type === "FeatureCollection" && Array.isArray(geometry.features)) {
    return {
      ...geometry,
      features: geometry.features.map((f) => normalizeGeometryCoords(f)),
    };
  }
  return geometry;
}

function getRouteGeometry() {
  const rawGeometry = window.AppState?.bus?.routeGeometry;
  if (!rawGeometry) return null;

  try {
    const parsed = typeof rawGeometry === "string"
      ? JSON.parse(rawGeometry)
      : rawGeometry;

    if (parsed.type === "FeatureCollection") return normalizeGeometryCoords(parsed);
    if (parsed.type === "Feature") return normalizeGeometryCoords(parsed);
    if (parsed.type && parsed.coordinates) {
      return {
        type: "Feature",
        properties: {},
        geometry: normalizeGeometryCoords(parsed),
      };
    }
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

function getBusLiveCoordinates(state = window.AppState) {
  const busCoords = getCoordinates(state?.bus);
  if (busCoords) return busCoords;

  const localGpsCoords = getCoordinates(window.__conductorLocalGps);
  if (localGpsCoords) return localGpsCoords;

  if (state?.trip?.active) {
    const stops = state?.routeStops || [];
    const fromStop = state?.trip?.directionFromId
      ? stops.find((s) => s.id === state.trip.directionFromId)
      : stops[0];
    const stopCoords = getCoordinates(fromStop || stops[0]);
    if (stopCoords) return stopCoords;
  }

  return null;
}

function getInitialCenter() {
  const busCoordinates = getBusLiveCoordinates(window.AppState);
  if (busCoordinates) return busCoordinates;

  const firstStop = (window.AppState?.routeStops || [])
    .map(getCoordinates)
    .find(Boolean);
  return firstStop || [121.0494, 14.6517];
}

function animateBusMarkerTo(marker, animation, targetCoordinates, durationMs = 800) {
  const startLngLat = marker.getLngLat();
  if (!startLngLat) {
    marker.setLngLat(targetCoordinates);
    return;
  }

  const startLng = startLngLat.lng;
  const startLat = startLngLat.lat;
  const [targetLng, targetLat] = targetCoordinates;

  if (Math.abs(targetLng - startLng) < 0.000001 && Math.abs(targetLat - startLat) < 0.000001) {
    marker.setLngLat(targetCoordinates);
    return;
  }

  if (animation.frame !== null) {
    cancelAnimationFrame(animation.frame);
  }

  const startTime = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    const nextPosition = [
      startLng + (targetLng - startLng) * eased,
      startLat + (targetLat - startLat) * eased,
    ];
    marker.setLngLat(nextPosition);
    if (busPopup?.isOpen()) {
      busPopup.setLngLat(nextPosition);
    }

    if (progress < 1) {
      animation.frame = requestAnimationFrame(step);
    } else {
      animation.frame = null;
    }
  };

  animation.frame = requestAnimationFrame(step);
}

function getStopExpectedCount(stopId, stopName) {
  const requests = window.AppState?.dropoffRequests || [];
  return requests.filter((req) => {
    if (req.status === "alighted") return false;
    if (stopId && req.stopId === stopId) return true;
    if (!req.stopId && stopName && req.stopName === stopName) return true;
    return false;
  }).length;
}

function renderStopPopupHtml(stop, index) {
  const stopName = stop.name || `Stop ${index + 1}`;
  const expectedCount = getStopExpectedCount(stop.id, stopName);
  return `
    <div style="font-size:13px;font-weight:700;color:#1f2937">
      ${escapeStopName(stopName)}
    </div>
    <div style="font-size:11px;color:${expectedCount > 0 ? "#1d4ed8" : "#6b7280"};font-weight:${expectedCount > 0 ? "700" : "500"};margin-top:2px">
      ${expectedCount > 0 ? `${expectedCount} passenger${expectedCount === 1 ? "" : "s"} getting off` : `Stop #${index + 1}`}
    </div>
  `;
}

function syncRouteSourceAndLayer() {
  if (!liveMap) return;
  if (!isLiveMapLoaded && typeof liveMap.isStyleLoaded === "function" && !liveMap.isStyleLoaded()) {
    return;
  }

  const route = getRouteGeometry() || getFallbackRoute() || {
    type: "FeatureCollection",
    features: [],
  };

  try {
    const existingSource = liveMap.getSource("conductor-route");
    if (existingSource) {
      existingSource.setData(route);
    } else {
      liveMap.addSource("conductor-route", {
        type: "geojson",
        data: route,
      });
    }

    if (!liveMap.getLayer("conductor-route-line")) {
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
    isLiveMapLoaded = true;
  } catch (err) {
    // Style still initializing; styledata/load listener will retry
  }
}

function syncStopMarkers() {
  if (!liveMap) return;

  const stops = window.AppState?.routeStops || [];
  const signature = stops
    .map((stop, idx) => {
      const coords = getCoordinates(stop);
      return `${stop.id || idx}|${stop.name || ""}|${coords ? `${coords[0]},${coords[1]}` : "null"}`;
    })
    .join(";");

  if (signature !== lastStopsSignature) {
    lastStopsSignature = signature;
    stopMarkers.forEach(({ marker, popup }) => {
      popup?.remove();
      marker.remove();
    });

    stopMarkers = stops.flatMap((stop, index) => {
      const coordinates = getCoordinates(stop);
      if (!coordinates) return [];

      const element = document.createElement("div");
      element.className = "live-map-stop-marker";
      element.textContent = String(index + 1);
      element.title = stop.name || `Stop ${index + 1}`;

      const popup = new maplibregl.Popup({
        offset: 14,
        closeButton: false,
        closeOnClick: true,
      }).setHTML(renderStopPopupHtml(stop, index));

      const marker = new maplibregl.Marker({ element })
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(liveMap);

      return [{ id: stop.id, stop, index, marker, popup, element }];
    });
  } else {
    stopMarkers.forEach(({ stop, index, popup }) => {
      popup?.setHTML(renderStopPopupHtml(stop, index));
    });
  }
}

function addRouteAndStops() {
  if (!liveMap) return;
  isLiveMapLoaded = true;

  syncRouteSourceAndLayer();
  syncStopMarkers();
  updateFloatingLiveMap();
  if (!hasUserMovedLiveMap) {
    fitMapToRoute();
  }
}

function refreshConductorLiveMapRoute() {
  if (!liveMap) return;
  syncStopMarkers();
  syncRouteSourceAndLayer();
  updateFloatingLiveMap();
}

function escapeStopName(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fitMapToRoute() {
  if (!liveMap) return;

  const bounds = new maplibregl.LngLatBounds();
  (window.AppState?.routeStops || []).forEach((stop) => {
    const coordinates = getCoordinates(stop);
    if (coordinates) bounds.extend(coordinates);
  });

  const busCoordinates = getBusLiveCoordinates(window.AppState);
  if (busCoordinates) bounds.extend(busCoordinates);

  if (!bounds.isEmpty()) {
    liveMap.fitBounds(bounds, {
      padding: 36,
      maxZoom: 15,
      duration: 0,
    });
  }
}

function renderBusPopupHtml() {
  const state = window.AppState;
  const busId = state?.bus?.id || "Bus";
  const onboard = Number(state?.occupancy?.onboard) || 0;
  const capacity = Number(state?.occupancy?.capacity || state?.bus?.capacity) || 45;
  const speed = Number(state?.bus?.speedKmh);
  return `
    <div style="font-size:12px;color:#1f2937;min-width:130px">
      <div style="font-weight:700;font-size:13px;color:#115272">${escapeStopName(busId)}</div>
      <div style="margin-top:2px">Onboard: <strong>${onboard}/${capacity}</strong></div>
      ${Number.isFinite(speed) ? `<div style="margin-top:2px">Speed: <strong>${Math.round(speed)} km/h</strong></div>` : ""}
    </div>
  `;
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

  busPopup = new maplibregl.Popup({
    offset: 16,
    closeButton: false,
    closeOnClick: true,
  }).setHTML(renderBusPopupHtml());

  busMarker = new maplibregl.Marker({ element, anchor: "center" }).setPopup(busPopup);
}

function updateFloatingLiveMap() {
  const state = window.AppState;
  if (!state) return;

  const stop = state.routeStops?.find(
    (routeStop) => routeStop.id === state.currentAlightStopId
  );
  const label = document.getElementById("liveMapStopLabel");
  if (label) {
    const speed = Number(state?.bus?.speedKmh);
    const speedSuffix = Number.isFinite(speed) ? ` · ${Math.round(speed)} km/h` : "";
    if (stop) {
      const expected = getStopExpectedCount(stop.id, stop.name);
      label.textContent = expected > 0
        ? `${stop.name} · ${expected} getting off${speedSuffix}`
        : `${stop.name}${speedSuffix}`;
    } else {
      label.textContent = speedSuffix ? `Live GPS active${speedSuffix}` : "Nearest stop unavailable";
    }
  }

  if (liveMap) {
    syncStopMarkers();
  }

  stopMarkers.forEach(({ id, stop: routeStop, index, element, popup }) => {
    const isNearest = id === state.currentAlightStopId;
    const expected = getStopExpectedCount(id, routeStop?.name);
    element.classList.toggle("is-nearest", isNearest);
    element.title = expected > 0
      ? `${routeStop?.name || `Stop ${index + 1}`} (${expected} getting off)`
      : routeStop?.name || `Stop ${index + 1}`;
    popup?.setHTML(renderStopPopupHtml(routeStop, index));
  });

  if (!liveMap) return;

  const coordinates = getBusLiveCoordinates(state);
  if (!coordinates) return;

  ensureBusMarker();
  busPopup?.setHTML(renderBusPopupHtml());

  const prevLngLat = busMarker.getLngLat();
  if (!busMarker.getElement().isConnected) {
    busMarker.setLngLat(coordinates).addTo(liveMap);
  } else {
    animateBusMarkerTo(busMarker, busMarkerAnimation, coordinates, 750);
  }

  const panel = document.getElementById("liveMapPanel");
  const isPanelVisible = panel && !panel.classList.contains("hidden");

  if (!hasCenteredOnBus) {
    hasCenteredOnBus = true;
    if (!hasUserMovedLiveMap) {
      fitMapToRoute();
    }
  } else if (isPanelVisible && !hasUserMovedLiveMap && prevLngLat) {
    const moved =
      Math.abs(prevLngLat.lng - coordinates[0]) > 0.00001 ||
      Math.abs(prevLngLat.lat - coordinates[1]) > 0.00001;
    if (moved) {
      liveMap.easeTo({
        center: coordinates,
        duration: 750,
      });
    }
  }
}

function createLiveMap() {
  const container = document.getElementById("liveMapCanvas");
  if (!container) return;

  if (liveMap && liveMap.getContainer() !== container) {
    if (busMarkerAnimation.frame !== null) {
      cancelAnimationFrame(busMarkerAnimation.frame);
      busMarkerAnimation.frame = null;
    }
    liveMap.remove();
    liveMap = null;
    isLiveMapLoaded = false;
    busMarker = null;
    busPopup = null;
    stopMarkers = [];
    lastStopsSignature = "";
  }

  if (liveMap) {
    liveMap.resize();
    refreshConductorLiveMapRoute();
    return;
  }

  hasCenteredOnBus = Boolean(getBusLiveCoordinates(window.AppState));
  hasUserMovedLiveMap = false;

  liveMap = new maplibregl.Map({
    container: "liveMapCanvas",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: getInitialCenter(),
    zoom: 14,
    attributionControl: false,
  });

  liveMap.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    "bottom-right"
  );

  liveMap.on("dragstart", () => {
    hasUserMovedLiveMap = true;
  });

  liveMap.on("zoomstart", (event) => {
    if (event.originalEvent) {
      hasUserMovedLiveMap = true;
    }
  });

  liveMap.on("styledata", () => {
    if (!isLiveMapLoaded && liveMap?.isStyleLoaded()) {
      addRouteAndStops();
    }
  });

  liveMap.on("load", addRouteAndStops);

  // Immediately render HTML stop markers and bus marker without waiting for vector tiles
  syncStopMarkers();
  updateFloatingLiveMap();
  fitMapToRoute();
}

function toggleLiveMap() {
  const panel = document.getElementById("liveMapPanel");
  if (!panel) return;

  const isOpening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !isOpening);
  panel.setAttribute("aria-hidden", String(!isOpening));

  if (!isOpening) {
    panel.classList.remove("is-fullscreen");
    updateLiveMapFullscreenButton(false);
  }

  if (isOpening) {
    panel.classList.remove("is-fullscreen");
    updateLiveMapFullscreenButton(false);
    hasUserMovedLiveMap = false;
    window.requestConductorDevicePosition?.(true);
    createLiveMap();
    requestAnimationFrame(() => {
      liveMap?.resize();
      refreshConductorLiveMapRoute();
    });
  }
}

function updateLiveMapFullscreenButton(isFullscreen) {
  const button = document.getElementById("liveMapFullscreen");
  if (!button) return;

  const label = isFullscreen ? "Restore live map size" : "Expand live map";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(isFullscreen));
  button.title = label;
  button.innerHTML = isFullscreen
    ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 3v3a2 2 0 0 1-2 2H3m13-5v3a2 2 0 0 0 2 2h3M3 16h3a2 2 0 0 1 2 2v3m8 0v-3a2 2 0 0 1 2-2h3"/></svg>'
    : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/></svg>';
}

function toggleLiveMapFullscreen() {
  const panel = document.getElementById("liveMapPanel");
  if (!panel || panel.classList.contains("hidden")) return;

  const isFullscreen = panel.classList.toggle("is-fullscreen");
  updateLiveMapFullscreenButton(isFullscreen);
  requestAnimationFrame(() => liveMap?.resize());
}

function setLiveMapAvailability(isAvailable) {
  const button = document.getElementById("liveMapFab");
  if (!button) return;

  button.classList.toggle("hidden", !isAvailable);
  if (!isAvailable) {
    const panel = document.getElementById("liveMapPanel");
    panel?.classList.add("hidden");
    panel?.classList.remove("is-fullscreen");
    panel?.setAttribute("aria-hidden", "true");
    updateLiveMapFullscreenButton(false);
  }
}

document.getElementById("liveMapFab")?.addEventListener("click", toggleLiveMap);
document.getElementById("liveMapClose")?.addEventListener("click", toggleLiveMap);
document.getElementById("liveMapFullscreen")?.addEventListener("click", toggleLiveMapFullscreen);

window.setLiveMapAvailability = setLiveMapAvailability;
window.updateFloatingLiveMap = updateFloatingLiveMap;
window.refreshConductorLiveMapRoute = refreshConductorLiveMapRoute;
setLiveMapAvailability(window.__liveMapAvailable === true);

