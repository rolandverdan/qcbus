Pages.staff = async function () {
  const staff = await Store.getStaff();
  const drivers = staff.filter(s => s.role === 'driver');
  const conductors = staff.filter(s => s.role === 'conductor');

  return `
    <div class="space-y-4 slide-in">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-gray-800">Staff (${staff.length})</h2>
        <button onclick="openStaffModal()" class="px-3 py-1.5 bg-qc-purple text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
          </svg>
          Add Staff
        </button>
      </div>

      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-1 flex">
        <button onclick="filterStaff('all')" data-stafftab="all" class="staff-tab flex-1 py-2 text-xs font-semibold rounded-lg bg-purple-50 text-qc-purple transition">All (${staff.length})</button>
        <button onclick="filterStaff('driver')" data-stafftab="driver" class="staff-tab flex-1 py-2 text-xs font-semibold rounded-lg text-gray-500 transition">Drivers (${drivers.length})</button>
        <button onclick="filterStaff('conductor')" data-stafftab="conductor" class="staff-tab flex-1 py-2 text-xs font-semibold rounded-lg text-gray-500 transition">Conductors (${conductors.length})</button>
      </div>

      <div id="staffList" class="space-y-3">
        ${await renderStaffList(staff)}
      </div>
    </div>
  `;
};

async function renderStaffList(list) {
  const buses = await Store.getBuses();

  if (list.length === 0) {
    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <p class="text-sm text-gray-500">No staff yet</p>
      </div>
    `;
  }

  return list.map(member => {
    const isDriver = member.role === 'driver';
    const assignedBus = buses.find(
      b => isDriver
        ? b.driverId === member.id
        : b.conductorId === member.id
    );

    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
        <div class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 ${
          isDriver ? 'bg-qc-blue' : 'bg-qc-green'
        }">
          ${escapeHtml(
            member.name
              .split(' ')
              .map(n => n[0])
              .slice(0, 2)
              .join('')
          )}
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="font-semibold text-sm text-gray-800 truncate">
              ${escapeHtml(member.name)}
            </p>

            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              isDriver
                ? 'bg-blue-100 text-qc-blue'
                : 'bg-green-100 text-qc-green'
            }">
              ${isDriver ? 'Driver' : 'Conductor'}
            </span>
          </div>

          <p class="text-xs text-gray-500 truncate">
            ${escapeHtml(member.email)}
          </p>

          <p class="text-xs text-gray-400">
            ${
              assignedBus
                ? `🚌 ${escapeHtml(assignedBus.code)}`
                : 'No bus assigned'
            }
          </p>
        </div>

        <button
          onclick="openStaffActions('${member.id}')"
          class="p-1.5 hover:bg-gray-100 rounded-full transition"
        >
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');
}

async function filterStaff(role) {
  document.querySelectorAll('.staff-tab').forEach(btn => {
    const active = btn.dataset.stafftab === role;

    btn.className = `staff-tab flex-1 py-2 text-xs font-semibold rounded-lg transition ${
      active
        ? 'bg-purple-50 text-qc-purple'
        : 'text-gray-500'
    }`;
  });

  const all = await Store.getStaff();

  const filtered =
    role === 'all'
      ? all
      : all.filter(s => s.role === role);

  document.getElementById('staffList').innerHTML =
    renderStaffList(filtered);
}

// ---------- CREATE / EDIT STAFF ----------

async function openStaffModal(id = null, presetRole = null) {
  const staff = await Store.getStaff();

  const member = id
    ? staff.find(s => s.id === id)
    : null;

  const isEdit = !!member;
  const role = member?.role || presetRole || 'conductor';

  openModal(isEdit ? 'Edit Staff' : 'Add Staff Member', `
    <form id="staffForm" class="space-y-4">

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Role
        </label>

        <div class="grid grid-cols-2 gap-2">

          <label class="cursor-pointer ${
            isEdit ? 'pointer-events-none opacity-60' : ''
          }">
            <input
              type="radio"
              name="role"
              value="driver"
              ${role === 'driver' ? 'checked' : ''}
              class="peer sr-only"
            >

            <span class="block text-center py-2.5 text-xs font-semibold rounded-xl border-2 border-gray-200 peer-checked:border-qc-blue peer-checked:bg-blue-50 peer-checked:text-qc-blue transition">
              🚗 Driver
            </span>
          </label>

          <label class="cursor-pointer ${
            isEdit ? 'pointer-events-none opacity-60' : ''
          }">
            <input
              type="radio"
              name="role"
              value="conductor"
              ${role === 'conductor' ? 'checked' : ''}
              class="peer sr-only"
            >

            <span class="block text-center py-2.5 text-xs font-semibold rounded-xl border-2 border-gray-200 peer-checked:border-qc-green peer-checked:bg-green-50 peer-checked:text-qc-green transition">
              🎫 Conductor
            </span>
          </label>

        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Full Name
        </label>

        <input
          name="name"
          required
          placeholder="Juan Dela Cruz"
          value="${escapeHtml(member?.name || '')}"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
        >
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Email (login username)
        </label>

        <input
          name="email"
          type="email"
          required
          placeholder="juan@qcbus.ph"
          value="${escapeHtml(member?.email || '')}"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
        >
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          Mobile Number
        </label>

        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
            +63
          </span>

          <input
            name="phone"
            type="tel"
            placeholder="912 345 6789"
            value="${escapeHtml(member?.phone || '')}"
            class="w-full pl-12 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
          >
        </div>
      </div>

      <div id="driverFields">
        <label class="block text-xs font-medium text-gray-600 mb-1.5">
          License Number
        </label>

        <input
          name="licenseNumber"
          placeholder="N01-23-456789"
          value="${escapeHtml(member?.licenseNumber || '')}"
          class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
        >
      </div>

      ${
        !isEdit
          ? `
            <div class="bg-purple-50 border border-purple-100 rounded-xl p-3">
              <p class="text-[11px] text-purple-800 font-semibold mb-2">
                🔐 Account Credentials
              </p>

              <p class="text-[11px] text-purple-700">
                Staff authentication will be handled by Firebase Authentication.
              </p>
            </div>
          `
          : ''
      }

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
          ${isEdit ? 'Save' : 'Create Account'}
        </button>

      </div>

    </form>
  `);

  const syncDriverFields = () => {
    const checked =
      document.querySelector(
        'input[name="role"]:checked'
      )?.value;

    document.getElementById('driverFields').style.display =
      checked === 'driver' ? '' : 'none';
  };

  syncDriverFields();

  document
    .querySelectorAll('input[name="role"]')
    .forEach(r =>
      r.addEventListener('change', syncDriverFields)
    );

  document
    .getElementById('staffForm')
    .addEventListener('submit', async e => {
      e.preventDefault();

      const data = Object.fromEntries(
        new FormData(e.target)
      );

      try {
        if (isEdit) {
          const patch = {
            name: data.name,
            email: data.email.toLowerCase(),
            phone: data.phone,
            licenseNumber: data.licenseNumber || '',
          };

          await Store.updateStaff(id, patch);

          showToast('Staff updated', 'success');
        } else {
          const currentStaff = await Store.getStaff();

          if (
            currentStaff.some(
              s => s.email === data.email.toLowerCase()
            )
          ) {
            showToast('Email already in use', 'error');
            return;
          }

          await Store.addStaff({
            name: data.name,
            email: data.email,
            phone: data.phone,
            role: data.role,
            licenseNumber: data.licenseNumber || '',
          });

          showToast('Staff added to Firestore', 'success');
        }

        closeModal();
        await navigateTo('staff');

      } catch (error) {
        console.error('Staff save error:', error);
        showToast('Failed to save staff', 'error');
      }
    });
}

// ---------- STAFF ACTIONS ----------

async function openStaffActions(id) {
  const staff = await Store.getStaff();

  const member = staff.find(s => s.id === id);

  if (!member) return;

  openModal(escapeHtml(member.name), `
    <div class="space-y-2">

      <button
        onclick="openStaffModal('${id}')"
        class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl transition text-left"
      >
        <span class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
          ✏️
        </span>

        <span class="text-sm font-medium text-gray-700">
          Edit Details
        </span>
      </button>

      <button
        onclick="confirmDeleteStaff('${id}')"
        class="w-full p-3 flex items-center gap-3 hover:bg-red-50 rounded-xl transition text-left"
      >
        <span class="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
          🗑️
        </span>

        <span class="text-sm font-medium text-red-600">
          Delete Account
        </span>
      </button>

    </div>
  `);
}

// ---------- DELETE STAFF ----------

async function confirmDeleteStaff(id) {
  closeModal();

  const ok = await confirmAction(
    'Delete Staff?',
    'This will remove their staff record.',
    'Delete'
  );

  if (!ok) return;

  try {
    await Store.deleteStaff(id);

    showToast('Staff removed', 'info');

    await navigateTo('staff');

  } catch (error) {
    console.error('Staff delete error:', error);
    showToast('Failed to delete staff', 'error');
  }
}

// Expose

window.openStaffModal = openStaffModal;
window.openStaffActions = openStaffActions;
window.filterStaff = filterStaff;
window.confirmDeleteStaff = confirmDeleteStaff;