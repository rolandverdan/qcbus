import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  deleteToken,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js";

import firebaseApp, { db } from "../../shared/js/firebase.js";
import { getEta } from "../../shared/js/eta.js";

const notificationsCollection =
  collection(db, "notifications");
const FCM_VAPID_KEY = "BPBmKHBkWhjPVe_unCqoxdh8w8_dxNmT2lQp7iDDKYnu3KzOH0VZIa6O3p-eCxFlG0iLraIUx771lyk0EgmCYgk"; // Firebase Console > Cloud Messaging > Web Push certificates
const PUSH_DEVICE_ID_KEY = "qcBusPushDeviceId";

let unsubscribeNotificationFeed = null;
let foregroundMessageListener = null;

function getPushDeviceId() {
  let deviceId = localStorage.getItem(PUSH_DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(PUSH_DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

async function registerPushNotifications() {
  if (!AppState.user?.uid || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }

  if (Notification.permission !== "granted") {
    return { ok: false, reason: "permission" };
  }

  if (!FCM_VAPID_KEY) {
    return { ok: false, reason: "vapid" };
  }

  try {
    if (!(await isSupported())) {
      return { ok: false, reason: "unsupported" };
    }

    const serviceWorkerUrl = new URL("../sw.js", import.meta.url);
    const serviceWorkerScope = new URL("../", import.meta.url).pathname;
    const registration = await navigator.serviceWorker.register(
      serviceWorkerUrl,
      { scope: serviceWorkerScope }
    );
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) return { ok: false, reason: "token" };

    const deviceId = getPushDeviceId();
    await setDoc(
      doc(db, "users", AppState.user.uid, "pushTokens", deviceId),
      {
        token,
        platform: "web",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (!foregroundMessageListener) {
      foregroundMessageListener = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title;
        const body = payload.notification?.body || payload.data?.body;
        if (title) {
          showSystemNotification(title, {
            body: body || "",
            tag: payload.data?.notificationId || title,
            data: { url: "/commuters/index.html#notifications" },
          });
        }
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("Push registration failed:", error);
    return { ok: false, reason: "registration" };
  }
}

async function unregisterPushNotifications() {
  const deviceId = localStorage.getItem(PUSH_DEVICE_ID_KEY);
  if (!AppState.user?.uid || !deviceId) return;

  try {
    if (await isSupported()) {
      await deleteToken(getMessaging(firebaseApp));
    }
  } catch (error) {
    console.warn("Could not delete FCM token:", error);
  }

  await deleteDoc(
    doc(db, "users", AppState.user.uid, "pushTokens", deviceId)
  );
}

const sentAlertStorageKey = () =>
  `qcBusSentAlerts:${AppState.user.uid}`;

let evaluatingArrivalAlerts = false;

function getSentAlertKeys() {
  try {
    return JSON.parse(
      localStorage.getItem(sentAlertStorageKey()) || "[]"
    );
  } catch {
    return [];
  }
}

function rememberSentAlert(key) {
  const sent = getSentAlertKeys();
  if (sent.includes(key)) return;

  localStorage.setItem(
    sentAlertStorageKey(),
    JSON.stringify([...sent, key].slice(-250))
  );
}

async function sendDeduplicatedAlert(key, title, message, options = {}) {
  if (getSentAlertKeys().includes(key)) return;

  const notificationId = await pushAppNotification(
    title,
    message,
    {
      ...options,
      tag: key,
    }
  );

  if (notificationId) rememberSentAlert(key);
}

async function evaluateDropoffAlerts() {
  const state = window.AppState;
  if (
    evaluatingArrivalAlerts ||
    !state?.settings?.notifications ||
    !state.dropoff?.tripId ||
    !state.dropoff?.stopId
  ) {
    return;
  }

  const trip = state.activeTrips.find(
    (activeTrip) =>
      activeTrip.id === state.dropoff.tripId &&
      activeTrip.status === "active"
  );
  const stop = state.stops.find(
    (routeStop) => routeStop.id === state.dropoff.stopId
  );
  const bus = state.buses.find(
    (activeBus) => activeBus.tripId === state.dropoff.tripId
  );

  if (!trip || !stop || !bus) return;

  evaluatingArrivalAlerts = true;

  try {
    const eta = getEta(bus, stop);
    const eventBase = `${trip.id}:${stop.id}`;
    let stage = null;

    if (eta.minutes !== null && eta.minutes <= 1) {
      stage = {
        id: "arriving",
        title: "Your bus is arriving",
        message: `Bus ${bus.code || bus.id} is at or very near ${stop.name || "your drop-off stop"}.`,
      };
    } else if (eta.minutes !== null && eta.minutes <= 5) {
      stage = {
        id: "5-minutes",
        title: "Your stop is coming up",
        message: `Bus ${bus.code || bus.id} is about ${eta.label} from ${stop.name || "your drop-off stop"}.`,
      };
    } else if (eta.minutes !== null && eta.minutes <= 10) {
      stage = {
        id: "10-minutes",
        title: "Your bus is getting closer",
        message: `Bus ${bus.code || bus.id} is about ${eta.label} from ${stop.name || "your drop-off stop"}.`,
      };
    }

    if (stage) {
      await sendDeduplicatedAlert(
        `eta:${eventBase}:${stage.id}`,
        stage.title,
        stage.message,
        {
          type: "arrival",
          busCode: bus.code || bus.id,
          routeId: trip.routeId,
        }
      );
    }

    const capacity = Number(bus.capacity) || 0;
    const onboard = Number(bus.onboard) || 0;
    if (capacity > 0 && onboard >= capacity) {
      await sendDeduplicatedAlert(
        `occupancy:${trip.id}:full`,
        "Bus is full",
        `Bus ${bus.code || bus.id} has reached capacity.`,
        { type: "occupancy", busCode: bus.code || bus.id, routeId: trip.routeId }
      );
    } else if (capacity > 0 && onboard / capacity >= 0.9) {
      await sendDeduplicatedAlert(
        `occupancy:${trip.id}:nearly-full`,
        "Bus is nearly full",
        `Bus ${bus.code || bus.id} is at least 90% full.`,
        { type: "occupancy", busCode: bus.code || bus.id, routeId: trip.routeId }
      );
    }
  } finally {
    evaluatingArrivalAlerts = false;
  }
}

// =====================================================
// BROWSER NOTIFICATION PERMISSION
// =====================================================

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  const permission =
    await Notification.requestPermission();

  return permission === "granted";
}

// =====================================================
// SYSTEM / BROWSER NOTIFICATION
// =====================================================

async function showSystemNotification(
  title,
  options = {}
) {
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  const notificationOptions = {
    icon: "/images/qclogo2.png",
    badge: "/images/qclogo2.png",
    vibrate: [200, 100, 200],
    data: {
      url: "/commuters/index.html#notifications",
    },
    ...options,
  };

  if ("serviceWorker" in navigator) {
    try {
      const registration =
        await navigator.serviceWorker.ready;

      await registration.showNotification(
        title,
        notificationOptions
      );

      return;
    } catch (error) {
      console.warn(
        "Service worker notification failed:",
        error
      );
    }
  }

  new Notification(
    title,
    notificationOptions
  );
}

// =====================================================
// LOAD NOTIFICATIONS
// =====================================================

async function loadNotifications() {
  if (!AppState.user?.uid) {
    return [];
  }

  try {
    const q = query(
      notificationsCollection,

      where(
        "userId",
        "==",
        AppState.user.uid
      ),

      orderBy(
        "createdAt",
        "desc"
      ),

      limit(50)
    );

    if (unsubscribeNotificationFeed) {
      unsubscribeNotificationFeed();
    }

    unsubscribeNotificationFeed = onSnapshot(
      q,
      (snapshot) => {
        AppState.notifications = snapshot.docs.map(
        (notificationDoc) => {
          const data =
            notificationDoc.data();

          return {
            id: notificationDoc.id,

            userId:
              data.userId ||
              AppState.user.uid,

            title:
              data.title ||
              "Notification",

            message:
              data.message || "",

            type:
              data.type ||
              "general",

            busCode:
              data.busCode ||
              null,

            routeId:
              data.routeId ||
              null,

            read:
              Boolean(data.read),

            time:
              formatNotificationTime(
                data.createdAt
              ),
          };
        }
        );

        updateNotifBadge();

        if (AppState.currentPage === "notifications") {
          window.refreshCurrentPage?.();
        }
      },
      (error) => {
        console.error("Notification listener failed:", error);
      }
    );

    return AppState.notifications;

  } catch (error) {
    console.error(
      "Failed to load notifications:",
      error
    );

    return [];
  }
}

// =====================================================
// CREATE NOTIFICATION
// =====================================================

async function pushAppNotification(
  title,
  message,
  options = {}
) {
  if (!AppState.user?.uid) {
    console.error(
      "Cannot create notification: user not found."
    );

    return null;
  }

  try {
    const notification = {
      userId: AppState.user.uid,

      title,

      message,

      type:
        options.type ||
        "general",

      busCode:
        options.busCode ||
        null,

      routeId:
        options.routeId ||
        null,

      read: false,

      createdAt:
        serverTimestamp(),
    };

    const notificationRef =
      await addDoc(
        notificationsCollection,
        notification
      );

    AppState.notifications.unshift({
      id: notificationRef.id,

      userId:
        AppState.user.uid,

      title,

      message,

      type:
        options.type ||
        "general",

      busCode:
        options.busCode ||
        null,

      routeId:
        options.routeId ||
        null,

      read: false,

      time: "Just now",
    });

    updateNotifBadge();

    if (
      AppState.currentPage ===
      "notifications"
    ) {
      window.refreshCurrentPage?.();
    }

    return notificationRef.id;

  } catch (error) {
    console.error(
      "Failed to create notification:",
      error
    );

    return null;
  }
}

// =====================================================
// MARK NOTIFICATION AS READ
// =====================================================

async function markNotificationAsRead(
  id
) {
  try {
    const notification =
      AppState.notifications.find(
        (item) =>
          item.id === id
      );

    if (!notification) {
      return;
    }

    const notificationRef =
      doc(
        db,
        "notifications",
        id
      );

    await updateDoc(
      notificationRef,
      {
        read: true,
      }
    );

    notification.read = true;

    updateNotifBadge();

    if (
      AppState.currentPage ===
      "notifications"
    ) {
      window.refreshCurrentPage?.();
    }

  } catch (error) {
    console.error(
      "Failed to mark notification as read:",
      error
    );
  }
}

// =====================================================
// MARK ALL AS READ
// =====================================================

async function markAllNotificationsAsRead() {
  try {
    const unread =
      AppState.notifications.filter(
        (notification) =>
          !notification.read
      );

    if (!unread.length) return;

    const batch = writeBatch(db);
    unread.forEach((notification) => {
      batch.update(doc(db, "notifications", notification.id), {
        read: true,
      });
      notification.read = true;
    });

    await batch.commit();

    updateNotifBadge();
    if (AppState.currentPage === "notifications") {
      window.refreshCurrentPage?.();
    }

  } catch (error) {
    console.error(
      "Failed to mark all notifications:",
      error
    );
  }
}

// =====================================================
// NOTIFICATION BADGE
// =====================================================

function updateNotifBadge() {
  const unreadCount =
    AppState.notifications.filter(
      (notification) =>
        !notification.read
    ).length;

  const badge =
    document.getElementById(
      "notifBadge"
    );

  if (!badge) {
    return;
  }

  badge.textContent =
    unreadCount > 99
      ? "99+"
      : unreadCount;

  badge.classList.toggle(
    "hidden",
    unreadCount === 0
  );
}

// =====================================================
// TIME FORMATTER
// =====================================================

function formatNotificationTime(
  timestamp
) {
  if (!timestamp) {
    return "Just now";
  }

  const date =
    timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

  const diff =
    Date.now() -
    date.getTime();

  const seconds =
    Math.floor(
      diff / 1000
    );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString();
}

// =====================================================
// BUS NOTIFICATION HELPER
// =====================================================

async function notifyBusUpdate(
  bus,
  message,
  options = {}
) {
  const busCode =
    bus?.code ||
    "Unknown Bus";

  const route =
    bus?.route ||
    "No route assigned";

  const title =
    options.title ||
    `Bus ${busCode} Update`;

  const body =
    message ||
    `${route} has a new update.`;

  return await pushAppNotification(
    title,
    body,
    {
      type:
        options.type ||
        "bus",

      busCode,

      routeId:
        bus?.routeId ||
        null,

      tag:
        options.tag ||
        `bus-${busCode}`,
    }
  );
}

// =====================================================
// EXPORTS
// =====================================================

window.requestNotificationPermission =
  requestNotificationPermission;

window.registerPushNotifications =
  registerPushNotifications;

window.unregisterPushNotifications =
  unregisterPushNotifications;

window.registerPushNotifications =
  registerPushNotifications;

window.unregisterPushNotifications =
  unregisterPushNotifications;

window.showSystemNotification =
  showSystemNotification;

window.loadNotifications =
  loadNotifications;

window.pushAppNotification =
  pushAppNotification;

window.markNotificationAsRead =
  markNotificationAsRead;

window.markAllNotificationsAsRead =
  markAllNotificationsAsRead;

window.updateNotifBadge =
  updateNotifBadge;

window.notifyBusUpdate =
  notifyBusUpdate;

window.evaluateDropoffAlerts =
  evaluateDropoffAlerts;

setInterval(evaluateDropoffAlerts, 30000);