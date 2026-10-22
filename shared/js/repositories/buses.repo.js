import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../firebase.js";

const busesCollection = collection(db, "buses");

export async function getBusesRepo() {
  const snapshot = await getDocs(busesCollection);

  return snapshot.docs.map((busDoc) => ({
    id: busDoc.id,
    ...busDoc.data(),
  }));
}

export async function addBusRepo(data) {
  const bus = {
    code: data.code,
    plateNumber: data.plateNumber,
    capacity: Number(data.capacity) || 45,
    routeId: data.routeId || null,
    driverId: data.driverId || null,
    conductorId: data.conductorId || null,
    status: data.status || "idle",
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(busesCollection, bus);

  return {
    id: docRef.id,
    ...bus,
  };
}

export async function updateBusRepo(id, patch) {
  const busRef = doc(db, "buses", id);

  await updateDoc(busRef, {
    ...patch,
    ...(patch.capacity !== undefined && {
      capacity: Number(patch.capacity),
    }),
  });
}

export async function updateBusLocationRepo(id, location) {
  const rawLat = location?.lat;
  const rawLng = location?.lng;
  if (rawLat === null || rawLat === undefined || rawLat === "" || rawLng === null || rawLng === undefined || rawLng === "") {
    throw new Error("Bus location requires valid coordinates");
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Bus location coordinates are invalid");
  }
  const busRef = doc(db, "buses", id);
  const accuracy = Number(location.accuracy);

  await updateDoc(busRef, {
    lat,
    lng,
    speedKmh: Number(location.speedKmh) || 0,
    ...(Number.isFinite(accuracy) && accuracy > 0 ? { accuracy } : {}),
    ...(location.deviceId ? { locationDeviceId: String(location.deviceId) } : {}),
    ...(location.tripId ? { locationTripId: String(location.tripId) } : {}),
    locationUpdatedAt: serverTimestamp(),
  });
}

export async function clearBusLocationRepo(id) {
  if (!id) return;
  await updateDoc(doc(db, "buses", id), {
    lat: null, lng: null, speedKmh: null, accuracy: null,
    locationTripId: null, locationDeviceId: null, locationUpdatedAt: null,
  });
}

export async function deleteBusRepo(id) {
  const busRef = doc(db, "buses", id);

  await deleteDoc(busRef);
}

export async function getBusByConductorIdRepo(conductorId) {
  const buses = await getBusesRepo();

  return (
    buses.find(bus => bus.conductorId === conductorId) ||
    null
  );
}
