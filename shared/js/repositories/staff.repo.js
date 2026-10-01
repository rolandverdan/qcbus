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

// ==================================================
// GET STAFF
// ==================================================

export async function getStaffRepo() {
  const snapshot = await getDocs(staffCollection);

  return snapshot.docs.map((staffDoc) => ({
    id: staffDoc.id,
    ...staffDoc.data(),
  }));
}

// ==================================================
// GET STAFF BY UID
// ==================================================

export async function getStaffByUidRepo(uid) {
  const staff = await getStaffRepo();

  return (
    staff.find(
      member => member.uid === uid
    ) || null
  );
}

// ==================================================
// ADD STAFF
// ==================================================

export async function addStaffRepo(data) {
  const staff = {
    uid: data.uid || null,

    name: data.name || "",
    email: (data.email || "").toLowerCase().trim(),
    phone: data.phone || "",

    role: data.role,

    licenseNumber:
      data.licenseNumber || "",

    status:
      data.status || "active",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef =
    await addDoc(
      staffCollection,
      staff
    );

  return {
    id: docRef.id,
    ...staff,
  };
}

// ==================================================
// UPDATE STAFF
// ==================================================

export async function updateStaffRepo(
  id,
  patch
) {
  const staffRef =
    doc(db, "staff", id);

  await updateDoc(staffRef, {
    ...patch,

    ...(patch.email !== undefined && {
      email: patch.email
        .toLowerCase()
        .trim(),
    }),

    updatedAt:
      serverTimestamp(),
  });
}

// ==================================================
// DELETE STAFF
// ==================================================

export async function deleteStaffRepo(id) {
  const staffRef =
    doc(db, "staff", id);

  await deleteDoc(staffRef);
}