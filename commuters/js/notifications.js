import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { db } from "../../shared/js/firebase.js";

const notificationsCollection =
  collection(db, "notifications");

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

    const snapshot =
      await getDocs(q);

    AppState.notifications =
      snapshot.docs.map(
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

    if (
      AppState.currentPage ===
      "notifications"
    ) {
      navigateTo("notifications");
    }

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
      navigateTo("notifications");
    }

    if (
      AppState.settings.notifications
    ) {
      await showSystemNotification(
        title,
        {
          body: message,

          tag:
            options.tag ||
            notificationRef.id,
        }
      );
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
      navigateTo("notifications");
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

    await Promise.all(
      unread.map(
        (notification) =>
          markNotificationAsRead(
            notification.id
          )
      )
    );

    updateNotifBadge();

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