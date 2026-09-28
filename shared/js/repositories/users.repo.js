import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../firebase.js";

const usersCollection = "users";

export async function createUserProfile(user, data = {}) {
  const userRef = doc(db, usersCollection, user.uid);

  await setDoc(userRef, {
    uid: user.uid,
    name: data.name || user.displayName || "",
    email: (user.email || "").toLowerCase(),
    phone: data.phone || user.phoneNumber || "",
    role: "commuter",
    provider: data.provider || "password",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid) {
  const userRef = doc(db, usersCollection, uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export async function getUserByEmailRepo(email) {
  const usersRef = collection(db, usersCollection);

  const q = query(
    usersRef,
    where("email", "==", (email || "").toLowerCase())
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const userDoc = snapshot.docs[0];

  return {
    id: userDoc.id,
    ...userDoc.data(),
  };
}

export async function updateUserProfile(uid, patch) {
  const userRef = doc(db, usersCollection, uid);

  await updateDoc(userRef, {
    ...patch,
    ...(patch.email !== undefined && {
      email: patch.email.toLowerCase(),
    }),
    updatedAt: serverTimestamp(),
  });
}