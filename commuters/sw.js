const CACHE_NAME = 'qc-commuter-v5';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/map.js',
  './js/notifications.js',
  './js/settings.js',
  './auth.html',
    './css/auth.css',
    './js/auth.js',                                             
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/commuters/index.html#notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const existingClient = windowClients.find(client =>
        new URL(client.url).origin === self.location.origin
      );

      if (existingClient) {
        return existingClient.navigate(targetUrl).then(() => existingClient.focus());
      }

      return clients.openWindow(targetUrl);
    })
  );
});

try {
  importScripts(
    'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js'
  );

  firebase.initializeApp({
    apiKey: 'AIzaSyAnWuEtZHejl-DMZ9n4wr-Rmy4WsDhLgYE',
    authDomain: 'qcommute-88bf5.firebaseapp.com',
    projectId: 'qcommute-88bf5',
    storageBucket: 'qcommute-88bf5.firebasestorage.app',
    messagingSenderId: '1049903713277',
    appId: '1:1049903713277:web:b7f223099a21b346da6794',
    measurementId: 'G-XXNZQL7Y0G'
  });

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    if (payload.notification) return;

    const data = payload.data || {};
    const title = data.title || 'QCommute';

    self.registration.showNotification(title, {
      body: data.body || 'You have a new notification.',
      icon: '/images/qclogo2.png',
      badge: '/images/qclogo2.png',
      tag: data.notificationId || 'qc-notification',
      data: {
        url: data.url || '/commuters/index.html#notifications'
      }
    });
  });
} catch (error) {
  console.warn('Firebase background messaging is unavailable:', error);
}