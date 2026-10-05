import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../firebase.js";

export async function saveDropoffRequestRepo(tripId, commuterId, stop) {
  const requestRef = doc(
    db,
    "trips",
    tripId,
    "dropoffRequests",
    commuterId
  );

  await setDoc(requestRef, {
    commuterId,
    stopId: stop.id,
    stopName: stop.name,
    stopOrder: Number(stop.order) || 0,
    status: "pending",
    updatedAt: serverTimestamp(),
  });
}

export async function markExpectedDropoffsAlightedRepo(
  tripId,
  stopId,
  amount
) {
  const count = Math.max(0, Math.floor(Number(amount) || 0));
  if (!tripId || !stopId || count === 0) return 0;

  const requestsRef = collection(
    db,
    "trips",
    tripId,
    "dropoffRequests"
  );
  const snapshot = await getDocs(requestsRef);
  const pendingRequests = snapshot.docs
    .filter(
      (requestDoc) =>
        requestDoc.data().status !== "alighted" &&
        requestDoc.data().stopId === stopId
    )
    .sort(
      (a, b) =>
        (Number(a.data().stopOrder) || 0) -
        (Number(b.data().stopOrder) || 0)
    )
    .slice(0, count);

  if (!pendingRequests.length) return 0;

  const batch = writeBatch(db);
  pendingRequests.forEach((requestDoc) => {
    batch.update(requestDoc.ref, {
      status: "alighted",
      alightedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return pendingRequests.length;
}

export function listenToDropoffRequestRepo(
  tripId,
  commuterId,
  onChange,
  onError
) {
  const requestRef = doc(
    db,
    "trips",
    tripId,
    "dropoffRequests",
    commuterId
  );

  return onSnapshot(
    requestRef,
    (snapshot) => {
      onChange(
        snapshot.exists()
          ? { id: snapshot.id, ...snapshot.data() }
          : null
      );
    },
    onError
  );
}

export function listenToTripDropoffRequestsRepo(
  tripId,
  onChange,
  onError
) {
  const requestsRef = collection(
    db,
    "trips",
    tripId,
    "dropoffRequests"
  );

  return onSnapshot(
    requestsRef,
    (snapshot) => {
      onChange(
        snapshot.docs.map((requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data(),
        }))
      );
    },
    onError
  );
}