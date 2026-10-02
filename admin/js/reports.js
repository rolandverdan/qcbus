// ==================================================
// ADMIN — REPORTS PAGE (FRONT-END ONLY)
// Hardcoded data — no Firestore connection yet
// ==================================================

// ---------- Hardcoded sample reports ----------
let allReports = [
  {
    id: 'rep-001',
    busRoute: 'QC-1234 · R1 · QC Hall – Cubao',
    role: 'driver',
    category: 'reckless',
    description: 'Driver was speeding along Commonwealth Ave and nearly hit a motorcycle near Batasan.',
    anonymous: false,
    reporterName: 'Maria Santos',
    reporterEmail: 'maria@example.com',
    submittedAt: new Date(Date.now() - 1000 * 60 * 15),      // 15 min ago
    status: 'pending',
  },
  {
    id: 'rep-002',
    busRoute: 'QC-5678 · R5 · QC Hall – Mindanao Ave',
    role: 'conductor',
    category: 'overcharging',
    description: 'Conductor charged me ₱25 even though the Q City Bus is free. He insisted it was a "special" trip.',
    anonymous: true,
    reporterName: null,
    reporterEmail: null,
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),  // 2 hrs ago
    status: 'pending',
  },
  {
    id: 'rep-003',
    busRoute: 'QC-9012 · R3 · Welcome Rotonda – Aurora',
    role: 'passenger',
    category: 'smoking',
    description: 'Fellow passenger was vaping inside the bus and refused to stop when asked.',
    anonymous: false,
    reporterName: 'Jose Rivera',
    reporterEmail: 'jose@example.com',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),  // 5 hrs ago
    status: 'resolved',
  },
  {
    id: 'rep-004',
    busRoute: 'QC-3344 · R6 · QC Hall – Gilmore',
    role: 'driver',
    category: 'refused',
    description: 'Driver skipped the stop at Tomas Morato even though there were passengers waiting.',
    anonymous: false,
    reporterName: 'Ana Cruz',
    reporterEmail: 'ana@example.com',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    status: 'pending',
  },
  {
    id: 'rep-005',
    busRoute: 'QC-7788 · R2 · QC Hall – Litex',
    role: 'conductor',
    category: 'rude',
    description: 'Conductor was shouting at an elderly passenger who was slow to find her fare card.',
    anonymous: true,
    reporterName: null,
    reporterEmail: null,
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 30), // ~1.25 days ago
    status: 'reviewing',
  },
];

let activeFilter = 'all';

// ==================================================
// PAGE TEMPLATE
// ==================================================
window.Pages = window.Pages || {};

window.Pages.reports = function () {
  const filtered = filterReports(allReports);

  return `
    <div class="space-y-4 slide-in">

      <!-- Header card -->
      <div class="bg-gradient-to-br from-qc-blue to-qc-blue-accent text-white rounded-2xl p-5 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs opacity-80 uppercase tracking-wider">Reports</p>
            <h2 class="text-2xl font-bold leading-tight">${allReports.length}</h2>
            <p class="text-xs opacity-80 mt-0.5">Total submissions</p>
          </div>
          <div class="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Filter chips -->
      <div class="flex gap-2 overflow-x-auto pb-1">
        ${renderFilterChip('all',       'All',       allReports.length)}
        ${renderFilterChip('driver',    'Driver',    allReports.filter(r => r.role === 'driver').length)}
        ${renderFilterChip('conductor', 'Conductor', allReports.filter(r => r.role === 'conductor').length)}
        ${renderFilterChip('passenger', 'Passenger', allReports.filter(r => r.role === 'passenger').length)}
        ${renderFilterChip('pending',   'Pending',   allReports.filter(r => r.status !== 'resolved').length)}
        ${renderFilterChip('resolved',  'Resolved',  allReports.filter(r => r.status === 'resolved').length)}
      </div>

      <!-- Reports list -->
      ${filtered.length === 0 ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <div class="w-14 h-14 bg-gray-100 rounded-full mx-auto flex items-center justify-center mb-3">
            <svg class="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <p class="text-sm text-gray-500">No reports ${activeFilter === 'all' ? 'yet' : 'in this category'}</p>
        </div>
      ` : filtered.map(r => renderReportCard(r)).join('')}

    </div>
  `;
};

// ==================================================
// FILTER CHIP
// ==================================================
function renderFilterChip(key, label, count) {
  const active = activeFilter === key;
  const cls = active
    ? 'bg-qc-blue-accent text-white'
    : 'bg-white text-gray-700 border border-gray-200';
  return `
    <button onclick="setReportFilter('${key}')"
      class="${cls} flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition">
      ${label} (${count})
    </button>
  `;
}

// ==================================================
// REPORT CARD
// ==================================================
function renderReportCard(r) {
  const roleBadge =
    r.role === 'driver'    ? { label: 'Driver',    cls: 'bg-blue-100 text-blue-700' } :
    r.role === 'conductor' ? { label: 'Conductor', cls: 'bg-green-100 text-green-700' } :
    r.role === 'passenger' ? { label: 'Passenger', cls: 'bg-yellow-100 text-yellow-700' } :
                             { label: 'Unknown',   cls: 'bg-gray-100 text-gray-600' };

  const statusBadge =
    r.status === 'resolved'  ? { label: 'Resolved',  cls: 'bg-green-100 text-green-700' } :
    r.status === 'reviewing' ? { label: 'Reviewing', cls: 'bg-blue-100 text-blue-700' } :
                               { label: 'Pending',   cls: 'bg-red-100 text-red-700' };

  const categoryLabel = formatCategory(r.category);
  const timeLabel = r.submittedAt instanceof Date
    ? r.submittedAt.toLocaleString()
    : 'Just now';

  return `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="p-4">

        <!-- Top row: role + status -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${roleBadge.cls}">
              ${roleBadge.label}
            </span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge.cls}">
              ${statusBadge.label}
            </span>
          </div>
          <span class="text-[10px] text-gray-400">${timeLabel}</span>
        </div>

        <!-- Category -->
        <p class="font-semibold text-sm text-gray-800 mb-1">
          ${escapeHtml(categoryLabel)}
        </p>

        <!-- Bus/route -->
        <p class="text-xs text-gray-500 mb-2">
          🚌 ${escapeHtml(r.busRoute || 'Unknown bus')}
        </p>

        <!-- Description -->
        <p class="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 mb-3 leading-relaxed">
          ${escapeHtml(r.description || '(no description)')}
        </p>

        <!-- Reporter -->
        <p class="text-[11px] text-gray-400 mb-3">
          ${r.anonymous
            ? '🕶️ Anonymous report'
            : `👤 ${escapeHtml(r.reporterName || 'Unknown')} · ${escapeHtml(r.reporterEmail || '')}`}
        </p>

        <!-- Actions -->
        <div class="flex gap-2">
          ${r.status !== 'resolved' ? `
            <button onclick="markReportResolved('${r.id}')"
              class="flex-1 py-2 text-xs font-semibold bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition">
              Mark Resolved
            </button>
          ` : `
            <button onclick="markReportPending('${r.id}')"
              class="flex-1 py-2 text-xs font-semibold bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition">
              Reopen
            </button>
          `}
          <button onclick="confirmDeleteReport('${r.id}')"
            class="px-3 py-2 text-xs font-semibold bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition">
            🗑️
          </button>
        </div>

      </div>
    </div>
  `;
}

function formatCategory(cat) {
  const map = {
    'rude': 'Rude behavior',
    'overcharging': 'Overcharging / fare issue',
    'reckless': 'Reckless driving',
    'refused': 'Refused to stop / pick up',
    'not-wearing-id': 'Not wearing ID / uniform',
    'harassment': 'Harassment',
    'unruly': 'Unruly behavior',
    'smoking': 'Smoking / vaping inside bus',
    'noise': 'Excessive noise',
    'vandalism': 'Vandalism / damage',
    'theft': 'Theft / pickpocketing',
    'other': 'Other',
  };
  return map[cat] || cat || 'Uncategorized';
}

// ==================================================
// FILTER LOGIC
// ==================================================
function filterReports(list) {
  if (activeFilter === 'all') return list;
  if (activeFilter === 'pending') return list.filter(r => r.status !== 'resolved');
  if (activeFilter === 'resolved') return list.filter(r => r.status === 'resolved');
  return list.filter(r => r.role === activeFilter);
}

function setReportFilter(key) {
  activeFilter = key;
  window.navigateTo('reports');
}

// ==================================================
// ACTIONS (local only — no Firestore yet)
// ==================================================
function markReportResolved(id) {
  const r = allReports.find(x => x.id === id);
  if (!r) return;
  r.status = 'resolved';
  window.showToast('Marked as resolved', 'success');
  window.navigateTo('reports');
}

function markReportPending(id) {
  const r = allReports.find(x => x.id === id);
  if (!r) return;
  r.status = 'pending';
  window.showToast('Report reopened', 'info');
  window.navigateTo('reports');
}

async function confirmDeleteReport(id) {
  const ok = await window.confirmAction(
    'Delete Report?',
    'This will permanently remove the report. This cannot be undone.',
    'Delete'
  );
  if (!ok) return;

  allReports = allReports.filter(x => x.id !== id);
  window.showToast('Report deleted', 'info');
  window.navigateTo('reports');
}

// ==================================================
// EXPOSE
// ==================================================
window.setReportFilter = setReportFilter;
window.markReportResolved = markReportResolved;
window.markReportPending = markReportPending;
window.confirmDeleteReport = confirmDeleteReport;