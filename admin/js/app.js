import { requireRole } from "../../shared/js/auth.js";

requireRole("admin");

const AppState = {
  currentPage: 'dashboard',
  admin: { name: 'Admin User', email: 'admin@qcbus.ph' },
  map: null,
  mapMarkers: [],
  mapPickMode: null,   // callback when user taps the map
};

// ==================================================
// NAVIGATION
// ==================================================
async function navigateTo(page) {
  AppState.currentPage = page;

  // Stop map if leaving a map page
  if (AppState.map && !['stops', 'monitor'].includes(page)) {
    AppState.map.remove();
    AppState.map = null;
  }

  // Render page
  document.getElementById('content').innerHTML =
    Pages[page] ? await Pages[page]() : '';

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const active = btn.dataset.page === page;

    btn.className = `nav-btn flex flex-col items-center justify-center gap-1 text-xs transition ${
      active ? 'text-qc-blue-accent' : 'text-gray-400'
    }`;
  });

  const meta = {
    dashboard: {
      title: 'Admin Dashboard',
      sub: 'Quezon City · Manage everything'
    },
    routes: {
      title: 'Routes',
      sub: 'Quezon City · Bus routes'
    },
    buses: {
      title: 'Buses',
      sub: 'Quezon City · Fleet & assignments'
    },
    staff: {
      title: 'Staff',
      sub: 'Quezon City · Drivers & conductors'
    },
    monitor: {
      title: 'Live Monitor',
      sub: 'Quezon City · Real-time fleet'
    },
    stops: {
      title: 'Stops',
      sub: 'Quezon City · Route stops'
    },
  };

  document.getElementById('pageTitle').textContent =
    meta[page]?.title || 'Admin';

  document.getElementById('pageSub').textContent =
    meta[page]?.sub || 'Quezon City';

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

  // Page-specific init
  if (page === 'stops') {
    await initStopsPage();
  }

  if (page === 'monitor') {
    await initMonitorPage();
  }

  if (page === 'routes') {
    // No map on route list
  }
}

// ==================================================
// MODAL
// ==================================================
function openModal(title, html) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.body.style.overflow = '';
  AppState.mapPickMode = null;
}

// ==================================================
// CONFIRM MODAL
// ==================================================
let confirmResolver = null;

function confirmAction(title, message, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmOkBtn').textContent = okLabel;
    document.getElementById('confirmModal').classList.remove('hidden');

    confirmResolver = resolve;
  });
}

function resolveConfirm(value) {
  document.getElementById('confirmModal').classList.add('hidden');

  if (confirmResolver) {
    confirmResolver(value);
  }

  confirmResolver = null;
}

// ==================================================
// TOAST
// ==================================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');

  toast.textContent = message;

  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg text-white transition-all duration-300 z-[120] show ${
    type === 'success'
      ? 'bg-qc-green'
      : type === 'error'
        ? 'bg-qc-red'
        : type === 'warn'
          ? 'bg-yellow-500'
          : 'bg-qc-blue-accent'
  }`;

  setTimeout(() => toast.classList.remove('show'), 2200);
}

// ==================================================
// HELPERS
// ==================================================
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[s]));
}

async function routeById(id) {
  const routes = await Store.getRoutes();
  return routes.find(r => r.id === id);
}

async function staffById(id) {
  const staff = await Store.getStaff();
  return staff.find(s => s.id === id);
}


function busById(id) {
  return Store.getBuses().find(b => b.id === id);
}

// ==================================================
// LOGOUT
// ==================================================
function logout() {
  if (confirm('Log out of admin panel?')) {
    showToast('Logged out (frontend only)', 'info');
    // window.location.href = 'auth.html';
  }
}

// ==================================================
// INIT
// ==================================================
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => navigateTo(btn.dataset.page))
  );

  await navigateTo('dashboard');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});

// ==================================================
// EXPOSE
// ==================================================
window.AppState = AppState;
window.navigateTo = navigateTo;
window.openModal = openModal;
window.closeModal = closeModal;
window.confirmAction = confirmAction;
window.resolveConfirm = resolveConfirm;
window.showToast = showToast;
window.escapeHtml = escapeHtml;
window.routeById = routeById;
window.staffById = staffById;
window.busById = busById;
window.logout = logout;
window.Pages = {};