// ==================================================
// FIRESTORE REPOSITORY — ROUTES
// ==================================================

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

const routesCollection = collection(db, "routes");

// ==================================================
// READ — GET ALL ROUTES
// ==================================================

export async function getRoutesRepo() {
  const snapshot = await getDocs(routesCollection);

  return snapshot.docs.map((routeDoc) => ({
    id: routeDoc.id,
    ...routeDoc.data(),
  }));
}

// ==================================================
// CREATE — ADD ROUTE
// ==================================================

export async function addRouteRepo(data) {
  const route = {
    code: data.code,
    name: data.name,
    color: data.color || "#1e40af",
    description: data.description || "",
    fare: Number(data.fare) || 15,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(routesCollection, route);

  return {
    id: docRef.id,
    ...route,
  };
}

// ==================================================
// UPDATE — EDIT ROUTE
// ==================================================

export async function updateRouteRepo(id, patch) {
  const routeRef = doc(db, "routes", id);

  await updateDoc(routeRef, {
    ...patch,
    fare: Number(patch.fare),
  });
}

// ==================================================
// DELETE — DELETE ROUTE
// ==================================================

export async function deleteRouteRepo(id) {
  const routeRef = doc(db, "routes", id);

  await deleteDoc(routeRef);
}