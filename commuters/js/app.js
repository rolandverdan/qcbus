// ==================================================
// AUTH GUARD — redirect to login if not signed in
// ==================================================
(function guard() {
  const currentUser = localStorage.getItem('qcCurrentUser');
  if (!currentUser) {
    window.location.replace('auth.html');
    return;
  }
  try {
    window.__USER__ = JSON.parse(currentUser);
  } catch (e) {
    localStorage.removeItem('qcCurrentUser');
    window.location.replace('auth.html');
  }
})();
// ===== APP STATE =====
const AppState = {
  currentPage: 'home',
  user: {
    name: window.__USER__?.name || 'Commuter',
    email: window.__USER__?.email || '',
    phone: window.__USER__?.phone || '',
    savedRoutes: ['Route 1', 'Route 5']
  },
  notifications: [
    { id: 1, title: 'Bus Arriving', message: 'Bus QC-1234 will arrive at your stop in 5 minutes', time: '2 min ago', read: false },
    { id: 2, title: 'Route Update', message: 'Route 5 is experiencing delays due to traffic', time: '15 min ago', read: false },
    { id: 3, title: 'Welcome!', message: 'Thanks for using QC Bus Tracker', time: '1 hour ago', read: true }
  ],
  settings: {
    notifications: true,
    darkMode: false,
    language: 'en',
    autoRefresh: true,
    refreshInterval: 30
  },
  buses: [
    { id: 'QC-1234', route: 'Route 1', lat: 14.6760, lng: 121.0437, status: 'On Time', capacity: 'Available' },
    { id: 'QC-5678', route: 'Route 5', lat: 14.6790, lng: 121.0500, status: 'Delayed', capacity: 'Full' },
    { id: 'QC-9012', route: 'Route 3', lat: 14.6720, lng: 121.0380, status: 'On Time', capacity: 'Moderate' }
  ]
};

// ===== PAGE TEMPLATES =====
const Pages = {
  home: () => `
    <div class="space-y-4 slide-in">
      <!-- Welcome Card -->
      <div class="bg-gradient-to-r from-qc-blue to-blue-700 text-white rounded-xl p-4 shadow-lg">
        <p class="text-sm opacity-90">Good day,</p>
        <h2 class="text-xl font-bold">${AppState.user.name}</h2>
        <p class="text-xs opacity-75 mt-1">Track your bus in real-time</p>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-3">
        <button onclick="navigateTo('map')" class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition">
          <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <svg class="w-5 h-5 text-qc-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <span class="text-sm font-medium text-gray-700">Live Map</span>
        </button>
        <button onclick="navigateTo('notifications')" class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition">
          <div class="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg class="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <span class="text-sm font-medium text-gray-700">Arrivals</span>
        </button>
      </div>

      <!-- Nearby Buses -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-800">Nearby Buses</h3>
          <span class="text-xs text-qc-blue font-medium flex items-center gap-1">
            <span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Live
          </span>
        </div>
        <div class="space-y-3">
          ${AppState.buses.map(bus => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-qc-blue rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  ${bus.id.split('-')[1]}
                </div>
                <div>
                  <p class="font-medium text-sm text-gray-800">${bus.route}</p>
                  <p class="text-xs text-gray-500">${bus.id}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xs font-medium ${bus.status === 'On Time' ? 'text-green-600' : 'text-red-600'}">${bus.status}</p>
                <p class="text-xs text-gray-400">${bus.capacity}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Saved Routes -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 class="font-semibold text-gray-800 mb-3">Your Saved Routes</h3>
        <div class="flex flex-wrap gap-2">
          ${AppState.user.savedRoutes.map(route => `
            <span class="px-3 py-1.5 bg-blue-50 text-qc-blue rounded-full text-xs font-medium">${route}</span>
          `).join('')}
          <button class="px-3 py-1.5 border border-dashed border-gray-300 text-gray-400 rounded-full text-xs font-medium hover:border-qc-blue hover:text-qc-blue transition">
            + Add Route
          </button>
        </div>
      </div>
    </div>
  `,

  map: () => `
    <div class="space-y-3 slide-in">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-qc-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" placeholder="Search route or destination..." class="flex-1 text-sm outline-none bg-transparent">
        </div>
      </div>
      <div id="mapContainer" class="w-full h-[55vh] rounded-xl shadow-sm border border-gray-100 overflow-hidden"></div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 class="font-semibold text-gray-800 mb-2 text-sm">Active Buses on Map</h3>
        <div class="flex gap-2 overflow-x-auto pb-1" id="busLegend">
          ${AppState.buses.map(bus => `
            <div class="flex-shrink-0 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
              <p class="text-xs font-medium text-gray-800">${bus.id}</p>
              <p class="text-xs text-gray-500">${bus.route}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `,

  notifications: () => `
    <div class="space-y-3 slide-in">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-gray-800">Notifications</h2>
        <button onclick="markAllRead()" class="text-xs text-qc-blue font-medium">Mark all read</button>
      </div>
      ${AppState.notifications.map(notif => `
        <div class="bg-white rounded-xl shadow-sm border ${notif.read ? 'border-gray-100' : 'border-blue-200 bg-blue-50/30'} p-4">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 ${notif.read ? 'bg-gray-100' : 'bg-blue-100'} rounded-full flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 ${notif.read ? 'text-gray-500' : 'text-qc-blue'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </div>
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <h3 class="font-medium text-sm ${notif.read ? 'text-gray-700' : 'text-gray-900'}">${notif.title}</h3>
                ${!notif.read ? '<span class="w-2 h-2 bg-qc-blue rounded-full"></span>' : ''}
              </div>
              <p class="text-xs text-gray-500 mt-1">${notif.message}</p>
              <p class="text-xs text-gray-400 mt-1">${notif.time}</p>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `,

  settings: () => `
    <div class="space-y-4 slide-in">
      <h2 class="font-semibold text-gray-800">Settings</h2>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        <div class="p-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-800">Push Notifications</p>
            <p class="text-xs text-gray-500">Get bus arrival alerts</p>
          </div>
          <button onclick="toggleSetting('notifications')" class="relative w-12 h-6 ${AppState.settings.notifications ? 'bg-qc-blue' : 'bg-gray-300'} rounded-full transition">
            <span class="absolute top-0.5 ${AppState.settings.notifications ? 'left-6' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all"></span>
          </button>
        </div>

        <div class="p-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-800">Dark Mode</p>
            <p class="text-xs text-gray-500">Easy on the eyes at night</p>
          </div>
          <button onclick="toggleSetting('darkMode')" class="relative w-12 h-6 ${AppState.settings.darkMode ? 'bg-qc-blue' : 'bg-gray-300'} rounded-full transition">
            <span class="absolute top-0.5 ${AppState.settings.darkMode ? 'left-6' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all"></span>
          </button>
        </div>

        <div class="p-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-800">Auto Refresh</p>
            <p class="text-xs text-gray-500">Update bus locations automatically</p>
          </div>
          <button onclick="toggleSetting('autoRefresh')" class="relative w-12 h-6 ${AppState.settings.autoRefresh ? 'bg-qc-blue' : 'bg-gray-300'} rounded-full transition">
            <span class="absolute top-0.5 ${AppState.settings.autoRefresh ? 'left-6' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all"></span>
          </button>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        <button class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition">
          <span class="text-sm text-gray-700">Language</span>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500">English</span>
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </button>
        <button class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition">
          <span class="text-sm text-gray-700">About</span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  `,

  account: () => `
    <div class="space-y-4 slide-in">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
        <div class="w-20 h-20 bg-gradient-to-br from-qc-blue to-blue-500 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg">
          ${AppState.user.name.split(' ').map(n => n[0]).join('')}
        </div>
        <h2 class="font-semibold text-gray-800 mt-3">${AppState.user.name}</h2>
        <p class="text-sm text-gray-500">${AppState.user.email}</p>
        <button class="mt-3 px-4 py-1.5 bg-blue-50 text-qc-blue rounded-full text-xs font-medium hover:bg-blue-100 transition">
          Edit Profile
        </button>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
          <p class="text-lg font-bold text-qc-blue">12</p>
          <p class="text-xs text-gray-500">Rides</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
          <p class="text-lg font-bold text-qc-blue">3</p>
          <p class="text-xs text-gray-500">Routes</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
          <p class="text-lg font-bold text-qc-blue">5</p>
          <p class="text-xs text-gray-500">Favorites</p>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        <button class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
          </svg>
          <span class="text-sm text-gray-700">My Favorites</span>
        </button>
        <button class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="text-sm text-gray-700">Fare History</span>
        </button>
        <button class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="text-sm text-gray-700">Help & Support</span>
        </button>
        <button onclick="logout()" class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition text-left">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          <span class="text-sm text-red-600">Logout</span>
        </button>
      </div>
    </div>
  `
};

// ===== NAVIGATION =====
function navigateTo(page) {
  AppState.currentPage = page;

  const content = document.getElementById('content');
  content.innerHTML = Pages[page]();

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.page === page;
    btn.className = `nav-btn flex flex-col items-center justify-center gap-1 text-xs transition ${
      isActive ? 'text-qc-blue' : 'text-gray-400'
    }`;
  });

  // Page title
  const titles = {
    home: 'QC Bus Tracker',
    map: 'Live Map',
    notifications: 'Notifications',
    settings: 'Settings',
    account: 'My Account'
  };
  document.getElementById('pageTitle').textContent = titles[page] || 'QC Bus Tracker';

  // Init map if needed
  if (page === 'map') {
    setTimeout(initMap, 100);
  } else if (typeof map !== 'undefined' && map) {
    map.remove();
    map = null;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  window.location.hash = page;
}

// ===== SETTINGS =====
function toggleSetting(key) {
  AppState.settings[key] = !AppState.settings[key];

  if (key === 'darkMode') {
    document.body.classList.toggle('dark-mode', AppState.settings.darkMode);
  }

  localStorage.setItem('qcSettings', JSON.stringify(AppState.settings));
  navigateTo('settings');
}

// ===== NOTIFICATIONS =====
function markAllRead() {
  AppState.notifications.forEach(n => n.read = true);
  updateNotifBadge();
  navigateTo('notifications');
}

function updateNotifBadge() {
  const unread = AppState.notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notifBadge');
  badge.classList.toggle('hidden', unread === 0);
}

function logout() {
  if (confirm('Are you sure you want to log out?')) {
    localStorage.removeItem('qcCurrentUser');
    window.location.replace('auth.html');
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Load settings
  const saved = localStorage.getItem('qcSettings');
  if (saved) {
    AppState.settings = { ...AppState.settings, ...JSON.parse(saved) };
    document.body.classList.toggle('dark-mode', AppState.settings.darkMode);
  }

  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Header notification button
  document.getElementById('notifBtn').addEventListener('click', () => navigateTo('notifications'));

  // Initial page (hash or home)
  const hash = window.location.hash.replace('#', '');
  const valid = ['home', 'map', 'notifications', 'settings', 'account'];
  navigateTo(valid.includes(hash) ? hash : 'home');

  updateNotifBadge();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW failed:', err));
  }
});

// Global exposure
window.navigateTo = navigateTo;
window.toggleSetting = toggleSetting;
window.markAllRead = markAllRead;
window.logout = logout;
window.AppState = AppState;