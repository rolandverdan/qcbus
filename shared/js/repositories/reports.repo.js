// ==================================================
// QC BUS TRACKER — REPORTS REPOSITORY
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
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../firebase.js";

// ==================================================
// COLLECTION
// ==================================================

const reportsCollection = collection(db, "reports");

// ==================================================
// CREATE REPORT
// ==================================================

export async function createReport(reportData) {
  if (!reportData) {
    throw new Error("Report data is required.");
  }

  const report = {
    busRoute: reportData.busRoute || "Unknown",
    role: reportData.role || "",
    category: reportData.category || "other",
    description: reportData.description || "",

    // Filled in later when authentication is connected
    reporterId: reportData.reporterId || null,

    status: "pending",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(
    reportsCollection,
    report
  );

  return {
    id: docRef.id,
    ...report,
  };
}

// ==================================================
// GET ALL REPORTS
// ==================================================

export async function getReports() {
  const reportsQuery = query(
    reportsCollection,
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(reportsQuery);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

// ==================================================
// GET REPORT BY ID
// ==================================================

export async function getReportById(reportId) {
  if (!reportId) {
    throw new Error("Report ID is required.");
  }

  const reportRef = doc(
    db,
    "reports",
    reportId
  );

  const snapshot = await getDoc(reportRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

// ==================================================
// UPDATE REPORT STATUS
// ==================================================

export async function updateReportStatus(
  reportId,
  status
) {
  if (!reportId) {
    throw new Error("Report ID is required.");
  }

  const validStatuses = [
    "pending",
    "reviewing",
    "resolved",
    "dismissed",
  ];

  if (!validStatuses.includes(status)) {
    throw new Error("Invalid report status.");
  }

  const reportRef = doc(
    db,
    "reports",
    reportId
  );

  await updateDoc(reportRef, {
    status,
    updatedAt: serverTimestamp(),
  });

  return true;
}