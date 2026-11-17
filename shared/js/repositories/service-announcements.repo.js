import { auth, db } from "../firebase.js";
import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const ANNOUNCEMENT_REF = doc(db, "serviceAnnouncements", "current");
const MANILA_TIME_ZONE = "Asia/Manila";

function getDate(value) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function toManilaDateInput(value) {
  const date = getDate(value);
  if (!date || Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toDateRange(startDate, endDate) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    throw new Error("Choose a valid start and end date.");
  }

  const start = new Date(`${startDate}T00:00:00+08:00`);
  const end = new Date(`${endDate}T23:59:59.999+08:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    toManilaDateInput(start) !== startDate ||
    toManilaDateInput(end) !== endDate ||
    end < start
  ) {
    throw new Error("The end date must be the same as or later than the start date.");
  }

  return {
    startAt: Timestamp.fromDate(start),
    endAt: Timestamp.fromDate(end),
  };
}

export async function getServiceAnnouncementRepo() {
  const snapshot = await getDoc(ANNOUNCEMENT_REF);
  return snapshot.exists() ? snapshot.data() : null;
}

export function listenToServiceAnnouncementRepo(onChange, onError) {
  return onSnapshot(
    ANNOUNCEMENT_REF,
    (snapshot) => onChange(snapshot.exists() ? snapshot.data() : null),
    onError
  );
}

export async function publishServiceAnnouncementRepo({
  title,
  message,
  startDate,
  endDate,
}) {
  if (!auth.currentUser?.uid) {
    throw new Error("Sign in as an admin to publish an announcement.");
  }

  const cleanTitle = title.trim();
  const cleanMessage = message.trim();
  if (!cleanTitle || !cleanMessage) {
    throw new Error("Enter an announcement title and message.");
  }

  const { startAt, endAt } = toDateRange(startDate, endDate);
  await setDoc(ANNOUNCEMENT_REF, {
    title: cleanTitle,
    message: cleanMessage,
    startAt,
    endAt,
    active: true,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  });
}

export async function clearServiceAnnouncementRepo() {
  if (!auth.currentUser?.uid) {
    throw new Error("Sign in as an admin to clear the announcement.");
  }
  await deleteDoc(ANNOUNCEMENT_REF);
}

export function isServiceAnnouncementVisible(announcement, now = new Date()) {
  if (!announcement?.active) return false;
  const start = getDate(announcement.startAt);
  const end = getDate(announcement.endAt);
  return Boolean(start && end && now >= start && now <= end);
}

export function getServiceAnnouncementDateInput(value) {
  return toManilaDateInput(value);
}

export function formatServiceAnnouncementDateRange(startAt, endAt) {
  const start = getDate(startAt);
  const end = getDate(endAt);
  if (!start || !end) return "";

  const dateFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const startLabel = dateFormat.format(start);
  const endLabel = dateFormat.format(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function getTodayServiceAnnouncementDateInput() {
  return toManilaDateInput(new Date());
}
