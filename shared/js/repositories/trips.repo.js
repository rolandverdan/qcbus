import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../firebase.js";

const tripsCollection = collection(db, "trips");

export async function getTripsRepo() {
  const snapshot = await getDocs(tripsCollection);

  return snapshot.docs.map((tripDoc) => ({
    id: tripDoc.id,
    ...tripDoc.data(),
  }));
}

export async function getActiveTripRepo(conductorId) {
  const q = query(
    tripsCollection,
    where("conductorId", "==", conductorId),
    where("status", "==", "active")
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const tripDoc = snapshot.docs[0];

  return {
    id: tripDoc.id,
    ...tripDoc.data(),
  };
}

export async function addTripRepo(data) {
  const trip = {
    conductorId: data.conductorId,
    conductorName: data.conductorName || "",

    busId: data.busId,
    busCode: data.busCode || "",

    routeId: data.routeId || null,
    routeName: data.routeName || "",

    status: "active",

    capacity: Number(data.capacity) || 45,
    onboard: Number(data.onboard) || 0,
    totalIn: Number(data.totalIn) || 0,
    totalOut: Number(data.totalOut) || 0,

    startedAt: serverTimestamp(),
    endedAt: null,
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(tripsCollection, trip);

  return {
    id: docRef.id,
    ...trip,
  };
}

export async function updateTripRepo(id, patch) {
  const tripRef = doc(db, "trips", id);

  await updateDoc(tripRef, {
    ...patch,

    ...(patch.capacity !== undefined && {
      capacity: Number(patch.capacity),
    }),

    ...(patch.onboard !== undefined && {
      onboard: Number(patch.onboard),
    }),

    ...(patch.totalIn !== undefined && {
      totalIn: Number(patch.totalIn),
    }),

    ...(patch.totalOut !== undefined && {
      totalOut: Number(patch.totalOut),
    }),

    updatedAt: serverTimestamp(),
  });
}

export async function endTripRepo(id, data = {}) {
  const tripRef = doc(db, "trips", id);

  await updateDoc(tripRef, {
    status: "ended",

    onboard: Number(data.onboard) || 0,
    totalIn: Number(data.totalIn) || 0,
    totalOut: Number(data.totalOut) || 0,

    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}