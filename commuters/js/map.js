let map = null;
let busMarkers = [];
let userMarker = null;
let simulationInterval = null;

function initMap() {
  const container = document.getElementById('mapContainer');
  if (!container || map) return;

  const qcCenter = [14.6760, 121.0437];

  map = L.map('mapContainer', {
    center: qcCenter,
    zoom: 14,
    zoomControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  updateBusMarkers();
  getUserLocation();

  // Clean up any previous simulation
  if (simulationInterval) clearInterval(simulationInterval);
  startBusSimulation();
}

function updateBusMarkers() {
  busMarkers.forEach(m => map.removeLayer(m));
  busMarkers = [];

  AppState.buses.forEach(bus => {
    const icon = L.divIcon({
      className: 'custom-bus-marker',
      html: `
        <div class="relative">
          <div class="w-10 h-10 bg-qc-blue rounded-lg shadow-lg flex items-center justify-center text-white text-xs font-bold border-2 border-white">
            ${bus.id.split('-')[1]}
          </div>
          <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-qc-blue rotate-45"></div>
        </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40]
    });

    const marker = L.marker([bus.lat, bus.lng], { icon })
      .addTo(map)
      .bindPopup(`
        <div style="min-width:150px">
          <strong>${bus.id}</strong><br>
          <span style="font-size:12px">${bus.route}</span><br>
          <span style="color:${bus.status === 'On Time' ? 'green' : 'red'};font-size:12px">● ${bus.status}</span>
          <span style="color:#888;font-size:12px"> · ${bus.capacity}</span>
        </div>
      `);

    busMarkers.push(marker);
  });
}

function getUserLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;

      if (userMarker) map.removeLayer(userMarker);

      const userIcon = L.divIcon({
        className: 'user-marker',
        html: `
          <div class="relative">
            <div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>
            <div class="absolute inset-0 w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-30"></div>
          </div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      userMarker = L.marker([latitude, longitude], { icon: userIcon })
        .addTo(map)
        .bindPopup('<div style="font-size:12px">You are here</div>');
    },
    (err) => console.log('Geo error:', err),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function startBusSimulation() {
  simulationInterval = setInterval(() => {
    AppState.buses.forEach((bus, i) => {
      bus.lat += (Math.random() - 0.5) * 0.001;
      bus.lng += (Math.random() - 0.5) * 0.001;

      if (busMarkers[i]) busMarkers[i].setLatLng([bus.lat, bus.lng]);
    });

    const legend = document.getElementById('busLegend');
    if (legend) {
      legend.innerHTML = AppState.buses.map(bus => `
        <div class="flex-shrink-0 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
          <p class="text-xs font-medium text-gray-800">${bus.id}</p>
          <p class="text-xs text-gray-500">${bus.route}</p>
        </div>
      `).join('');
    }
  }, 5000);
}

window.initMap = initMap;