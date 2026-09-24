// ==================================================
// BROADCAST OCCUPANCY — temporary "sync" via localStorage
// The commuter side can read this to show live occupancy.
// Replace with WebSocket / API later.
// ==================================================
function broadcastOccupancy() {
  const payload = {
    busId: AppState.bus.id,
    route: AppState.bus.route,
    capacity: AppState.occupancy.capacity,
    onboard: AppState.occupancy.onboard,
    totalIn: AppState.occupancy.totalIn,
    totalOut: AppState.occupancy.totalOut,
    tripActive: AppState.trip.active,
    tripId: AppState.trip.tripId,
    lastUpdate: Date.now(),
  };

  localStorage.setItem('qcBusOccupancy', JSON.stringify(payload));
  localStorage.setItem('qcBusOccupancy_updated', Date.now().toString());
}

// Auto broadcast every 5s while trip active
setInterval(() => {
  if (AppState.trip.active) broadcastOccupancy();
}, 5000);

// Broadcast when tab closes (nice-to-have)
window.addEventListener('beforeunload', () => {
  if (AppState.trip.active) broadcastOccupancy();
});

// Expose
window.broadcastOccupancy = broadcastOccupancy;