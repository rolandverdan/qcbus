import {
  collection,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../../shared/js/firebase.js";

let map = null;
let busMarkers = [];
let userMarker = null;
let unsubscribeBuses = null;
let unsubscribeTrips = null;


function listenToBusLocations() {
  if (unsubscribeBuses) {
    unsubscribeBuses();
  }

  const busesRef = collection(db, "buses");

  unsubscribeBuses = onSnapshot(
    busesRef,
    (snapshot) => {
      snapshot.forEach((busDoc) => {
        const data = busDoc.data();

        const bus = AppState.buses.find(
          (item) => item.id === busDoc.id
        );

        if (!bus) return;

        bus.lat = Number(data.lat) || bus.lat;
        bus.lng = Number(data.lng) || bus.lng;
      });

      updateBusMarkers();
      updateBusLegend();
    },
    (error) => {
      console.error(
        "Bus location listener failed:",
        error
      );
    }
  );
}

function initMap() {
  const container = document.getElementById("mapContainer");

  if (!container) return;

  // If Leaflet is already attached, just refresh markers.
  if (map) {
    updateBusMarkers();
    updateBusLegend();
    return;
  }

  const qcCenter = [14.6760, 121.0437];

  map = L.map("mapContainer", {
    center: qcCenter,
    zoom: 14,
    zoomControl: false,
  });

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }
  ).addTo(map);

  L.control.zoom({
    position: "bottomright",
  }).addTo(map);

  updateBusMarkers();
  updateBusLegend();
  getUserLocation();
  listenToActiveTrips();

  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

function listenToActiveTrips() {
  if (unsubscribeTrips) {
    unsubscribeTrips();
  }

  const tripsRef = collection(db, "trips");

  const q = query(
    tripsRef,
    where("status", "==", "active")
  );

  unsubscribeTrips = onSnapshot(
    q,
    (snapshot) => {
      const activeTrips = new Map();

      snapshot.forEach((tripDoc) => {
        activeTrips.set(tripDoc.id, {
          id: tripDoc.id,
          ...tripDoc.data(),
        });
      });

      AppState.buses.forEach((bus) => {
        const trip = [...activeTrips.values()].find(
          (t) =>
            t.busId === bus.id ||
            t.busCode === bus.code
        );

        if (trip) {
          bus.tripId = trip.id;
          bus.tripActive = true;

          bus.capacity =
            Number(trip.capacity) ||
            bus.capacity;

          bus.onboard =
            Number(trip.onboard) || 0;

          bus.totalIn =
            Number(trip.totalIn) || 0;

          bus.totalOut =
            Number(trip.totalOut) || 0;

          bus.status = "On Trip";
        } else {
          bus.tripId = null;
          bus.tripActive = false;
          bus.onboard = 0;
          bus.totalIn = 0;
          bus.totalOut = 0;
          bus.status = "Idle";
        }
      });

      updateBusMarkers();
      updateBusLegend();
    },
    (error) => {
      console.error(
        "Active trip listener failed:",
        error
      );
    }
  );
}

function updateBusMarkers() {
  if (!map) return;

  busMarkers.forEach((marker) => {
    map.removeLayer(marker);
  });

  busMarkers = [];

  AppState.buses.forEach((bus) => {
    const displayId =
      bus.code ||
      bus.id ||
      "BUS";

    const icon = L.divIcon({
      className: "custom-bus-marker",

      html: `
        <div class="relative">
          <div class="w-10 h-10 bg-qc-blue rounded-lg shadow-lg flex items-center justify-center text-white text-xs font-bold border-2 border-white">
            ${displayId.split("-")[1] || displayId}
          </div>

          <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-qc-blue rotate-45"></div>
        </div>
      `,

      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    const marker = L.marker(
      [
        Number(bus.lat) || 14.6760,
        Number(bus.lng) || 121.0437,
      ],
      { icon }
    )
      .addTo(map)
      .bindPopup(`
        <div style="min-width:170px">
          <strong>${displayId}</strong><br>

          <span style="font-size:12px">
            ${bus.route || "No route"}
          </span><br>

          <span style="
            color:${bus.tripActive ? "green" : "#888"};
            font-size:12px
          ">
            ● ${bus.status || "Idle"}
          </span>

          ${
            bus.tripActive
              ? `
                <br>
                <span style="font-size:12px">
                  Passengers:
                  ${bus.onboard || 0}/${bus.capacity || 0}
                </span>
              `
              : ""
          }
        </div>
      `);

    busMarkers.push(marker);
  });
}

function updateBusLegend() {
  const legend =
    document.getElementById("busLegend");

  if (!legend) return;

  legend.innerHTML = AppState.buses
    .map(
      (bus) => `
        <div class="flex-shrink-0 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">

          <p class="text-xs font-medium text-gray-800">
            ${bus.code || bus.id}
          </p>

          <p class="text-xs text-gray-500">
            ${bus.route || "No route"}
          </p>

          ${
            bus.tripActive
              ? `
                <p class="text-xs text-green-600">
                  ${bus.onboard || 0}/${bus.capacity || 0}
                  onboard
                </p>
              `
              : `
                <p class="text-xs text-gray-400">
                  No active trip
                </p>
              `
          }

        </div>
      `
    )
    .join("");
}

function getUserLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const {
        latitude,
        longitude,
      } = pos.coords;

      if (userMarker) {
        map.removeLayer(userMarker);
      }

      const userIcon = L.divIcon({
        className: "user-marker",

        html: `
          <div class="relative">
            <div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>

            <div class="absolute inset-0 w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-30"></div>
          </div>
        `,

        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      userMarker = L.marker(
        [latitude, longitude],
        { icon: userIcon }
      )
        .addTo(map)
        .bindPopup(
          '<div style="font-size:12px">You are here</div>'
        );
    },
    (err) => {
      console.log("Geo error:", err);
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
    }
  );
}

window.initMap = initMap;
window.updateBusMarkers = updateBusMarkers;
window.updateBusLegend = updateBusLegend;