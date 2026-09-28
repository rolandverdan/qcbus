// ==================================================
// FIRESTORE OCCUPANCY SYNC
// ==================================================

import {
  updateTripRepo,
} from "../../shared/js/repositories/trips.repo.js";


async function broadcastOccupancy() {
  if (!AppState.trip.active) return;

  if (!AppState.trip.tripId) return;

  try {
    await updateTripRepo(
      AppState.trip.tripId,
      {
        onboard: AppState.occupancy.onboard,
        totalIn: AppState.occupancy.totalIn,
        totalOut: AppState.occupancy.totalOut,
      }
    );
  } catch (error) {
    console.error(
      'Occupancy sync failed:',
      error
    );
  }
}


// Auto-sync every 5 seconds
setInterval(() => {
  if (AppState.trip.active) {
    broadcastOccupancy();
  }
}, 5000);


// Expose
window.broadcastOccupancy = broadcastOccupancy;