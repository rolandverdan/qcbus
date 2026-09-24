// Browser push notification permission
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

// Show a system notification (browser-level)
function showSystemNotification(title, options = {}) {
  if (Notification.permission !== 'granted') return;
  new Notification(title, {
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: [200, 100, 200],
    ...options
  });
}

// Add notification to the in-app list + badge
function pushAppNotification(title, message) {
  AppState.notifications.unshift({
    id: Date.now(),
    title,
    message,
    time: 'Just now',
    read: false
  });
  updateNotifBadge();

  // If currently on the notifications page, refresh it
  if (AppState.currentPage === 'notifications') {
    navigateTo('notifications');
  }
}

// Simulated bus arrival alert
function simulateBusArrival(busId, route, minutesAway) {
  const title = `Bus ${busId} Arriving`;
  const body = `${route} will arrive in ${minutesAway} minutes at your stop.`;

  pushAppNotification(title, body);
  showSystemNotification(title, { body, tag: busId });
}

// Random simulation (remove when backend is ready)
setInterval(() => {
  if (!AppState.settings.notifications) return;
  if (Math.random() > 0.9) {
    const bus = AppState.buses[Math.floor(Math.random() * AppState.buses.length)];
    simulateBusArrival(bus.id, bus.route, Math.floor(Math.random() * 10) + 2);
  }
}, 45000);

window.showSystemNotification = showSystemNotification;
window.simulateBusArrival = simulateBusArrival;
window.requestNotificationPermission = requestNotificationPermission;