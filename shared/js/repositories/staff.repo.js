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

const staffCollection = collection(db, "staff");

export async function getStaffRepo() {
  const snapshot = await getDocs(staffCollection);

  return snapshot.docs.map((staffDoc) => ({
    id: staffDoc.id,
    ...staffDoc.data(),
  }));
}

export async function addStaffRepo(data) {
  const staff = {
    name: data.name,
    email: (data.email || "").toLowerCase(),
    phone: data.phone || "",
    role: data.role,
    licenseNumber: data.licenseNumber || "",
    status: "active",
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(staffCollection, staff);

  return {
    id: docRef.id,
    ...staff,
  };
}

export async function updateStaffRepo(id, patch) {
  const staffRef = doc(db, "staff", id);

  await updateDoc(staffRef, {
    ...patch,
  });
}

export async function deleteStaffRepo(id) {
  const staffRef = doc(db, "staff", id);

  await deleteDoc(staffRef);
}