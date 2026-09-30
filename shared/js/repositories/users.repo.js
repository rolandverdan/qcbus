
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

import {
  initializeApp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  db,
  firebaseConfig,
} from "../firebase.js";

const usersCollection = "users";

// ==================================================
// CREATE USER PROFILE
// ==================================================

export async function createUserProfile(user, data = {}) {
  const userRef = doc(db, usersCollection, user.uid);

  await setDoc(userRef, {
    uid: user.uid,
    name: data.name || user.displayName || "",
    email: (user.email || "").toLowerCase(),
    phone: data.phone || user.phoneNumber || "",
    role: data.role || "commuter",
    status: data.status || "active",
    provider: data.provider || "password",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ==================================================
// GET ALL USERS
// ==================================================

export async function getUsersRepo() {
  const usersRef = collection(db, usersCollection);

  const snapshot = await getDocs(usersRef);

  return snapshot.docs.map((userDoc) => ({
    id: userDoc.id,
    ...userDoc.data(),
  }));
}

// ==================================================
// CREATE LOGIN ACCOUNT
// ==================================================

export async function createLoginAccountRepo({
  email,
  password,
  name,
  phone = "",
  role,
}) {
  const normalizedEmail = email.toLowerCase().trim();

  const secondaryApp = initializeApp(
    firebaseConfig,
    `account-creator-${Date.now()}`
  );

  const secondaryAuth = getAuth(secondaryApp);

  const credential = await createUserWithEmailAndPassword(
    secondaryAuth,
    normalizedEmail,
    password
  );

  const user = credential.user;

  await createUserProfile(user, {
    name,
    phone,
    role,
    provider: "password",
    status: "active",
  });

  return {
    uid: user.uid,
    email: normalizedEmail,
    name,
    phone,
    role,
    status: "active",
  };
}

// ==================================================
// GET USER PROFILE
// ==================================================

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

// ==================================================
// GET USER BY EMAIL
// ==================================================

export async function getUserByEmailRepo(email) {
  const usersRef = collection(db, usersCollection);

  const q = query(
    usersRef,
    where(
      "email",
      "==",
      (email || "").toLowerCase().trim()
    )
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

// ==================================================
// UPDATE USER PROFILE
// ==================================================

export async function updateUserProfile(uid, patch) {
  const userRef = doc(db, usersCollection, uid);

  await updateDoc(userRef, {
    ...patch,

    ...(patch.email !== undefined && {
      email: patch.email.toLowerCase().trim(),
    }),

    updatedAt: serverTimestamp(),
  });
}

