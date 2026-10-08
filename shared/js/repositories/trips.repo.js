import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
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

export async function getActiveTripRepo(conductorId, busId = null) {
  if (conductorId) {
    const q = query(
      tripsCollection,
      where("conductorId", "==", conductorId),
      where("status", "==", "active")
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const tripDoc = snapshot.docs[0];
      return {
        id: tripDoc.id,
        ...tripDoc.data(),
      };
    }
  }

  if (busId) {
    const qBus = query(
      tripsCollection,
      where("busId", "==", busId),
      where("status", "==", "active")
    );
    const busSnap = await getDocs(qBus);
    if (!busSnap.empty) {
      const tripDoc = busSnap.docs[0];
      return {
        id: tripDoc.id,
        ...tripDoc.data(),
      };
    }
  }

  return null;
}

export function listenToActiveTripRepo(conductorId, callback, busId = null) {
  if (!conductorId && !busId) return () => {};

  if (conductorId) {
    const q = query(
      tripsCollection,
      where("conductorId", "==", conductorId),
      where("status", "==", "active")
    );

    return onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const tripDoc = snapshot.docs[0];
          callback({
            id: tripDoc.id,
            ...tripDoc.data(),
          });
        } else if (busId) {
          const qBus = query(
            tripsCollection,
            where("busId", "==", busId),
            where("status", "==", "active")
          );
          getDocs(qBus)
            .then((busSnap) => {
              if (!busSnap.empty) {
                callback({
                  id: busSnap.docs[0].id,
                  ...busSnap.docs[0].data(),
                });
              } else {
                callback(null);
              }
            })
            .catch(() => callback(null));
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error("listenToActiveTripRepo error:", error);
      }
    );
  }

  const qBus = query(
    tripsCollection,
    where("busId", "==", busId),
    where("status", "==", "active")
  );
  return onSnapshot(
    qBus,
    (snapshot) => {
      if (!snapshot.empty) {
        const tripDoc = snapshot.docs[0];
        callback({
          id: tripDoc.id,
          ...tripDoc.data(),
        });
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error("listenToActiveTripRepo bus query error:", error);
    }
  );
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

export function listenToTripOccupancyRepo(tripId, callback) {
  if (!tripId) return () => {};
  const tripRef = doc(db, "trips", tripId); 
  
  return onSnapshot(
    tripRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() });
      }
    },
    (error) => {
      console.error("listenToTripOccupancyRepo error:", error);
    }
  );
}