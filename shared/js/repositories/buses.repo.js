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