import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
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

export function listenToTripsRepo(onChange, onError) {
  return onSnapshot(
    tripsCollection,
    (snapshot) => {
      onChange(
        snapshot.docs.map((tripDoc) => ({
          id: tripDoc.id,
          ...tripDoc.data(),
        }))
      );
    },
    onError
  );
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

    let conductorTrips = [];
    let busTrips = [];
    let conductorReady = false;
    let busReady = !busId;
    const publishActiveTrip = () => {
      if (!conductorReady || !busReady) return;
      const tripDoc = conductorTrips[0] || busTrips[0];
      callback(tripDoc ? { id: tripDoc.id, ...tripDoc.data() } : null);
    };

    const unsubscribeConductor = onSnapshot(
      q,
      (snapshot) => {
        conductorTrips = snapshot.docs;
        conductorReady = true;
        publishActiveTrip();
      },
      (error) => {
        console.error("listenToActiveTripRepo error:", error);
      }
    );

    if (!busId) return unsubscribeConductor;

    const qBus = query(
      tripsCollection,
      where("busId", "==", busId),
      where("status", "==", "active")
    );
    const unsubscribeBus = onSnapshot(
      qBus,
      (snapshot) => {
        busTrips = snapshot.docs;
        busReady = true;
        publishActiveTrip();
      },
      (error) => {
        console.error("listenToActiveTripRepo bus query error:", error);
      }
    );

    return () => {
      unsubscribeConductor();
      unsubscribeBus();
    };
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
    directionFromId: data.directionFromId || null,
    directionFromName: data.directionFromName || "",
    directionToId: data.directionToId || null,
    directionToName: data.directionToName || "",
    directionLabel: data.directionLabel || "",

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

export async function endAllActiveTripsRepo() {
  const activeTripsQuery = query(
    tripsCollection,
    where("status", "==", "active")
  );
  const snapshot = await getDocs(activeTripsQuery);
  if (snapshot.empty) return 0;

  // Firestore batches allow at most 500 writes; leave headroom for future additions.
  const chunkSize = 450;
  for (let start = 0; start < snapshot.docs.length; start += chunkSize) {
    const batch = writeBatch(db);
    const docs = snapshot.docs.slice(start, start + chunkSize);
    docs.forEach((tripDoc) => {
      const trip = tripDoc.data();
      batch.update(tripDoc.ref, {
        status: "ended",
        onboard: Number(trip.onboard) || 0,
        totalIn: Number(trip.totalIn) || 0,
        totalOut: Number(trip.totalOut) || 0,
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return snapshot.docs.length;
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
