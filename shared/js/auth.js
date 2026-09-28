import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { auth } from "./firebase.js";

import {
  getUserProfile,
} from "./repositories/users.repo.js";


// ==================================================
// ROLES
// ==================================================

export const ROLES = {
  COMMUTER: "commuter",
  CONDUCTOR: "conductor",
  ADMIN: "admin",
};


// ==================================================
// ROLE PATHS
// ==================================================

const ROLE_PATHS = {
  commuter: "/commuters/index.html",
  conductor: "/conductors/index.html",
  admin: "/admin/index.html",
};


// ==================================================
// CURRENT USER
// ==================================================

export function getCurrentUser() {
  return auth.currentUser;
}


// ==================================================
// AUTH STATE LISTENER
// ==================================================

export function listenForAuth(callback) {
  return onAuthStateChanged(auth, callback);
}


// ==================================================
// WAIT FOR FIREBASE AUTH
// ==================================================

export function waitForAuth() {
  return new Promise((resolve) => {

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      }
    );

  });
}


// ==================================================
// CURRENT USER PROFILE
// ==================================================

export async function getCurrentUserProfile() {

  const user = auth.currentUser;

  if (!user) {
    return null;
  }

  return await getUserProfile(user.uid);
}


// ==================================================
// CURRENT USER ROLE
// ==================================================

export async function getCurrentUserRole() {

  const profile =
    await getCurrentUserProfile();

  return profile?.role || null;
}


// ==================================================
// REQUIRE ROLE
// ==================================================

export async function requireRole(requiredRole) {

  const user = await waitForAuth();


  // Not logged in

  if (!user) {

    window.location.replace(
      "/commuters/auth.html"
    );

    return null;
  }


  // Get Firestore profile

  const profile =
    await getUserProfile(user.uid);


  // Profile missing

  if (!profile) {

    console.error(
      "User profile not found."
    );

    window.location.replace(
      "/commuters/auth.html"
    );

    return null;
  }


  // Wrong role

  if (profile.role !== requiredRole) {

    const correctPath =
      ROLE_PATHS[profile.role];

    if (correctPath) {

      window.location.replace(
        correctPath
      );

    } else {

      window.location.replace(
        "/commuters/auth.html"
      );

    }

    return null;
  }


  // Authorized

  return {
    user,
    profile,
  };
}


// ==================================================
// REDIRECT BY ROLE
// ==================================================

export async function redirectByRole() {

  const user = await waitForAuth();


  if (!user) {

    window.location.replace(
      "/commuters/auth.html"
    );

    return;
  }


  const profile =
    await getUserProfile(user.uid);


  if (!profile) {

    window.location.replace(
      "/commuters/auth.html"
    );

    return;
  }


  const targetPath =
    ROLE_PATHS[profile.role];


  if (!targetPath) {

    console.error(
      "Invalid user role:",
      profile.role
    );

    window.location.replace(
      "/commuters/auth.html"
    );

    return;
  }


  if (
    window.location.pathname !== targetPath
  ) {

    window.location.replace(
      targetPath
    );

  }

}