// ==================================================
// QC BUS TRACKER — EMERGENCIES REPOSITORY
// ==================================================

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../firebase.js";

const emergenciesCollection = collection(db, "emergencies");

export async function createEmergencyRepo(data) {
  if (!data) throw new Error("Emergency data is required");

  const payload = {
    type: data.type || "other",
    label: data.label || "Other Emergency",
    status: "active", // 'active' | 'resolved'

    busId: data.busId || "Unknown Bus",
    busCode: data.busCode || data.busId || "BUS",
    plateNumber: data.plateNumber || "",

    route: data.route || "No Route Assigned",
    routeId: data.routeId || null,
    tripId: data.tripId || null,
    tripDirection: data.tripDirection || "",

    conductorId: data.conductorId || null,
    conductorName: data.conductorName || "Unknown Conductor",
    conductorEmail: data.conductorEmail || "",

    occupancy: {
      onboard: Number(data.onboard) || 0,
      capacity: Number(data.capacity) || 45,
      totalIn: Number(data.totalIn) || 0,
      totalOut: Number(data.totalOut) || 0,
    },

    location: {
      lat:
        data.lat !== null && data.lat !== undefined && Number.isFinite(Number(data.lat))
          ? Number(data.lat)
          : null,
      lng:
        data.lng !== null && data.lng !== undefined && Number.isFinite(Number(data.lng))
          ? Number(data.lng)
          : null,
      speedKmh:
        data.speedKmh !== null &&
        data.speedKmh !== undefined &&
        Number.isFinite(Number(data.speedKmh))
          ? Number(data.speedKmh)
          : null,
    },

    nearestStop: data.nearestStop || "",
    notes: data.notes || "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  };

  const docRef = await addDoc(emergenciesCollection, payload);
  return {
    id: docRef.id,
    ...payload,
  };
}

export async function getEmergenciesRepo() {
  const q = query(emergenciesCollection, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export function listenToEmergenciesRepo(onChange, onError) {
  const q = query(emergenciesCollection, orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const emergencies = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      onChange(emergencies);
    },
    (err) => {
      console.error("listenToEmergenciesRepo error:", err);
      if (onError) onError(err);
    }
  );
}

export async function resolveEmergencyRepo(id, resolvedBy = "Admin") {
  if (!id) return;
  const docRef = doc(db, "emergencies", id);
  await updateDoc(docRef, {
    status: "resolved",
    resolvedAt: serverTimestamp(),
    resolvedBy: resolvedBy || "Admin",
    updatedAt: serverTimestamp(),
  });
}

export async function updateEmergencyStatusRepo(id, status, extra = {}) {
  if (!id) return;
  const docRef = doc(db, "emergencies", id);
  await updateDoc(docRef, {
    status,
    ...extra,
    updatedAt: serverTimestamp(),
  });
}

