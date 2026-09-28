Pages.buses = async function () {
  const buses = await Store.getBuses();
  const routes = await Store.getRoutes();
  const staff = await Store.getStaff();

  return `
    <div class="space-y-4 slide-in">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-gray-800">Fleet (${buses.length})</h2>

        <button onclick="openBusModal()" class="px-3 py-1.5 bg-qc-purple text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
          </svg>
          New Bus
        </button>
      </div>

      ${buses.length === 0 ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p class="text-sm text-gray-500 mb-3">No buses registered</p>

          <button onclick="openBusModal()" class="px-4 py-2 bg-qc-purple text-white text-xs font-semibold rounded-lg">
            Register First Bus
          </button>
        </div>
      ` : buses.map(bus => {
        const route = bus.routeId
          ? routes.find(r => r.id === bus.routeId)
          : null;

        const driver = bus.driverId
          ? staff.find(s => s.id === bus.driverId)
          : null;

        const conductor = bus.conductorId
          ? staff.find(s => s.id === bus.conductorId)
          : null;

        return `
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div class="flex items-center gap-3 mb-3">

              <div class="w-12 h-12 rounded-xl bg-qc-purple/10 flex items-center justify-center text-qc-purple font-bold text-sm">
                ${escapeHtml(bus.code.split('-')[1] || bus.code)}
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-semibold text-sm text-gray-800">
                    ${escapeHtml(bus.code)}
                  </p>

                  ${statusBadge(bus.status)}
                </div>

                <p class="text-xs text-gray-500 truncate">
                  ${escapeHtml(bus.plateNumber)} · ${bus.capacity} seats
                </p>
              </div>

              <button
                onclick="openBusActions('${bus.id}')"
                class="p-1.5 hover:bg-gray-100 rounded-full transition"
              >
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01"/>
                </svg>
              </button>
            </div>

            <div class="space-y-1.5 text-xs">

              <div class="flex items-center gap-2">
                <span class="text-gray-400 w-16">Route</span>

                ${
                  route
                    ? `<span class="flex items-center gap-1.5">
                        <span
                          class="w-2 h-2 rounded-full"
                          style="background:${route.color}"
                        ></span>
                        ${escapeHtml(route.code)} · ${escapeHtml(route.name)}
                      </span>`
                    : `<span class="text-gray-400 italic">Unassigned</span>`
                }
              </div>

              <div class="flex items-center gap-2">
                <span class="text-gray-400 w-16">Driver</span>

                <span class="${driver ? 'text-gray-700' : 'text-gray-400 italic'}">
                  ${driver ? escapeHtml(driver.name) : 'Unassigned'}
                </span>
              </div>

              <div class="flex items-center gap-2">
                <span class="text-gray-400 w-16">Conductor</span>

                <span class="${conductor ? 'text-gray-700' : 'text-gray-400 italic'}">
                  ${conductor ? escapeHtml(conductor.name) : 'Unassigned'}
                </span>
              </div>

            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
};

function statusBadge(status) {
  const map = {
    active: ['Active', 'bg-green-100 text-qc-green'],
    idle: ['Idle', 'bg-yellow-100 text-yellow-700'],
    maintenance: ['Maintenance', 'bg-red-100 text-qc-red'],
  };

  const [label, cls] =
    map[status] || ['Unknown', 'bg-gray-100 text-gray-600'];

  return `
    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}">
      ${label}
    </span>
  `;
}

// ---------- CREATE / EDIT BUS ----------

async function openBusModal(id = null) {
  const buses = await Store.getBuses();

  const bus = id
    ? buses.find(b => b.id === id)
    : null;

  const routes = await Store.getRoutes();
  const staff = await Store.getStaff();

  const drivers = staff.filter(s => s.role === 'driver');
  const conductors = staff.filter(s => s.role === 'conductor');

  const isEdit = !!bus;

  openModal(isEdit ? 'Edit Bus' : 'Register New Bus', `
    <form id="busForm" class="space-y-4">

      <div class="grid grid-cols-2 gap-3">

        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            Bus Code
          </label>

          <input
            name="code"
            required
            placeholder="QC-1234"
            value="${escapeHtml(bus?.code || '')}"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
          >
        </div>

        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            Plate No.
          </label>

          <input
            name="plateNumber"
            required
            placeholder="NCR 4521"
            value="${escapeHtml(bus?.plateNumber || '')}"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
          >
        </div>

      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Seating Capacity
        </label>

        <input
          name="capacity"
          type="number"
          min="10"
          max="100"
          value="${bus?.capacity ?? 45}"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
        >
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Assign Route
        </label>

        <select
          name="routeId"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none bg-white"
        >
          <option value="">— Unassigned —</option>

          ${routes.map(r => `
            <option
              value="${r.id}"
              ${bus?.routeId === r.id ? 'selected' : ''}
            >
              ${escapeHtml(r.code)} · ${escapeHtml(r.name)}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="grid grid-cols-2 gap-3">

        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            Driver
          </label>

          <select
            name="driverId"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none bg-white"
          >
            <option value="">— None —</option>

            ${drivers.map(d => `
              <option
                value="${d.id}"
                ${bus?.driverId === d.id ? 'selected' : ''}
              >
                ${escapeHtml(d.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            Conductor
          </label>

          <select
            name="conductorId"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none bg-white"
          >
            <option value="">— None —</option>

            ${conductors.map(c => `
              <option
                value="${c.id}"
                ${bus?.conductorId === c.id ? 'selected' : ''}
              >
                ${escapeHtml(c.name)}
              </option>
            `).join('')}
          </select>
        </div>

      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Status
        </label>

        <div class="grid grid-cols-3 gap-2">

          ${['idle', 'active', 'maintenance'].map(s => `
            <label class="cursor-pointer">

              <input
                type="radio"
                name="status"
                value="${s}"
                ${(bus?.status || 'idle') === s ? 'checked' : ''}
                class="peer sr-only"
              >

              <span class="block text-center py-2 text-xs font-medium rounded-xl border border-gray-200 peer-checked:border-qc-purple peer-checked:bg-purple-50 peer-checked:text-qc-purple capitalize transition">
                ${s}
              </span>

            </label>
          `).join('')}

        </div>
      </div>

      <div class="flex gap-3 pt-2">

        <button
          type="button"
          onclick="closeModal()"
          class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm"
        >
          Cancel
        </button>

        <button
          type="submit"
          class="flex-1 py-3 rounded-xl bg-qc-purple text-white font-semibold text-sm shadow-md shadow-purple-200"
        >
          ${isEdit ? 'Save' : 'Register'}
        </button>

      </div>

    </form>
  `);

  document
  .getElementById('busForm')
  .addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = Object.fromEntries(
      new FormData(e.target)
    );

    try {
      const staff = await Store.getStaff();

      // Validate driver
      if (data.driverId) {
        const driver = staff.find(
          s => s.id === data.driverId
        );

        if (!driver || driver.role !== 'driver') {
          showToast('Invalid driver assignment', 'error');
          return;
        }
      }

      // Validate conductor
      if (data.conductorId) {
        const conductor = staff.find(
          s => s.id === data.conductorId
        );

        if (!conductor || conductor.role !== 'conductor') {
          showToast('Invalid conductor assignment', 'error');
          return;
        }

        if (!conductor.uid) {
          showToast(
            'This conductor has no linked login',
            'error'
          );
          return;
        }
      }

      if (isEdit) {
        await Store.updateBus(id, data);
        showToast('Bus updated', 'success');
      } else {
        await Store.addBus(data);
        showToast('Bus registered', 'success');
      }

      closeModal();
      await navigateTo('buses');

    } catch (error) {
      console.error('Bus save error:', error);
      showToast('Failed to save bus', 'error');
    }
  });
}

// ---------- BUS ACTIONS ----------

async function openBusActions(id) {
  const buses = await Store.getBuses();

  const bus = buses.find(b => b.id === id);

  if (!bus) return;

  openModal(escapeHtml(bus.code), `
    <div class="space-y-2">

      <button
        onclick="openBusModal('${id}')"
        class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl transition text-left"
      >
        <span class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
          ✏️
        </span>

        <span class="text-sm font-medium text-gray-700">
          Edit Bus
        </span>
      </button>

      <button
        onclick="cycleBusStatus('${id}')"
        class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl transition text-left"
      >
        <span class="w-9 h-9 bg-yellow-50 rounded-lg flex items-center justify-center">
          🔄
        </span>

        <span class="text-sm font-medium text-gray-700">
          Cycle Status
        </span>
      </button>

      <button
        onclick="confirmDeleteBus('${id}')"
        class="w-full p-3 flex items-center gap-3 hover:bg-red-50 rounded-xl transition text-left"
      >
        <span class="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
          🗑️
        </span>

        <span class="text-sm font-medium text-red-600">
          Delete Bus
        </span>
      </button>

    </div>
  `);
}

async function cycleBusStatus(id) {
  const buses = await Store.getBuses();

  const bus = buses.find(b => b.id === id);

  if (!bus) return;

  const next = {
    idle: 'active',
    active: 'maintenance',
    maintenance: 'idle',
  };

  const nextStatus =
    next[bus.status] || 'idle';

  await Store.updateBus(id, {
    status: nextStatus,
  });

  closeModal();

  showToast(`Status: ${nextStatus}`, 'info');

  await navigateTo('buses');
}

async function confirmDeleteBus(id) {
  closeModal();

  const ok = await confirmAction(
    'Delete Bus?',
    'This will remove the bus from the fleet.',
    'Delete'
  );

  if (!ok) return;

  try {
    await Store.deleteBus(id);

    showToast('Bus deleted', 'info');

    await navigateTo('buses');

  } catch (error) {
    console.error('Bus delete error:', error);
    showToast('Failed to delete bus', 'error');
  }
}

// Expose
window.openBusModal = openBusModal;
window.openBusActions = openBusActions;
window.cycleBusStatus = cycleBusStatus;
window.confirmDeleteBus = confirmDeleteBus;