import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../firebase.js";

const stopsCollection = collection(db, "stops");

export async function getStopsRepo() {
  const snapshot = await getDocs(stopsCollection);

  return snapshot.docs.map((stopDoc) => ({
    id: stopDoc.id,
    ...stopDoc.data(),
  }));
}

export async function addStopRepo(data) {
  const stop = {
    routeId: data.routeId,
    name: data.name,
    lat: Number(data.lat),
    lng: Number(data.lng),
    order: Number(data.order) || 1,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(stopsCollection, stop);

  return {
    id: docRef.id,
    ...stop,
  };
}

export async function updateStopRepo(id, patch) {
  const stopRef = doc(db, "stops", id);

  await updateDoc(stopRef, {
    ...patch,

    ...(patch.lat !== undefined && {
      lat: Number(patch.lat),
    }),

    ...(patch.lng !== undefined && {
      lng: Number(patch.lng),
    }),

    ...(patch.order !== undefined && {
      order: Number(patch.order),
    }),
  });
}

export async function reorderStopsRepo(
  routeId,
  orderedStopIds
) {
  const batch = writeBatch(db);

  orderedStopIds.forEach((stopId, index) => {
    const stopRef = doc(db, "stops", stopId);

    batch.update(stopRef, {
      routeId,
      order: index + 1,
    });
  });

  await batch.commit();
}

export async function deleteStopRepo(id) {
  const stopRef = doc(db, "stops", id);

  await deleteDoc(stopRef);
}