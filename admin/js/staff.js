
// ==================================================
// ACCOUNT MANAGER
// ==================================================

let staffPage = 1;
let currentStaffRole = 'all';
let currentStaffSearch = '';
let staffSearchTimeout = null;
const STAFF_PAGE_SIZE = 10;

Pages.staff = async function () {
  const staff = await Store.getStaff();
  const users = await Store.getUsers();

  const drivers = staff.filter(
    member => member.role === 'driver'
  );

  const conductors = staff.filter(
    member => member.role === 'conductor'
  );

  const admins = users.filter(
    user => user.role === 'admin'
  );
  const commuters = users.filter(
    user => user.role === 'commuter'
  );

  return `
    <div class="space-y-4 slide-in">

      <!-- HEADER -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <h2 class="font-semibold text-gray-800">
            User Accounts
          </h2>

          <p class="text-xs text-gray-400 mt-0.5">
            View commuter, administrator, conductor, and driver accounts
          </p>
        </div>

        <button
          onclick="openStaffModal()"
          class="self-start shrink-0 px-3 py-1.5 bg-qc-purple text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1 sm:self-auto"
        >
          <svg
            class="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M12 4v16m8-8H4"
            />
          </svg>

          Add Account
        </button>

      </div>

      <label class="relative block">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke-width="2"/><path stroke-linecap="round" stroke-width="2" d="m16 16 4 4"/></svg>
        <input type="search" id="userAccountSearch" value="${escapeHtml(currentStaffSearch)}" oninput="searchUserAccounts(this.value)" placeholder="Search by name, email, phone, or role" class="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-qc-purple" aria-label="Search user accounts">
      </label>

      <!-- FILTERS -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-1 flex flex-nowrap gap-1 overflow-x-auto">

        <button
          onclick="filterStaff('all')"
          data-stafftab="all"
          class="staff-tab flex-1 shrink-0 whitespace-nowrap px-2.5 py-2 text-xs font-semibold rounded-lg bg-purple-50 text-qc-purple transition"
        >
          All (${users.length + staff.filter(member => !member.uid || !users.some(user => user.uid === member.uid)).length})
        </button>

        <button
          onclick="filterStaff('commuter')"
          data-stafftab="commuter"
          class="staff-tab flex-1 shrink-0 whitespace-nowrap px-2.5 py-2 text-xs font-semibold rounded-lg text-gray-500 transition"
        >
          Commuters (${commuters.length})
        </button>

        <button
          onclick="filterStaff('admin')"
          data-stafftab="admin"
          class="staff-tab flex-1 shrink-0 whitespace-nowrap px-2.5 py-2 text-xs font-semibold rounded-lg text-gray-500 transition"
        >
          Admins (${admins.length})
        </button>

        <button
          onclick="filterStaff('conductor')"
          data-stafftab="conductor"
          class="staff-tab flex-1 shrink-0 whitespace-nowrap px-2.5 py-2 text-xs font-semibold rounded-lg text-gray-500 transition"
        >
          Conductors (${conductors.length})
        </button>

        <button
          onclick="filterStaff('driver')"
          data-stafftab="driver"
          class="staff-tab flex-1 shrink-0 whitespace-nowrap px-2.5 py-2 text-xs font-semibold rounded-lg text-gray-500 transition"
        >
          Drivers (${drivers.length})
        </button>

      </div>

      <!-- LIST -->
      <div id="staffList" class="space-y-3">
        ${await renderStaffList(currentStaffRole)}
      </div>

    </div>
  `;
};


// ==================================================
// RENDER ACCOUNT LIST
// ==================================================

async function renderStaffList(role = 'all') {
  currentStaffRole = role;
  const staff = await Store.getStaff();
  const users = await Store.getUsers();
  const buses = await Store.getBuses();

  const accounts = [];

  // ------------------------------------------
  // Add every login profile, including commuter accounts. If a profile is
  // linked to a conductor record, retain the staff ID for bus assignments.
  // ------------------------------------------

  users.forEach(user => {
      const linkedStaff = staff.find(member => member.uid && member.uid === user.uid);
      accounts.push({
        ...(linkedStaff || {}),
        id: linkedStaff?.id || user.uid,
        uid: user.uid,
        userId: user.uid,
        name: user.name || linkedStaff?.name || 'Unnamed User',
        email: user.email || linkedStaff?.email || '',
        phone: user.phone || linkedStaff?.phone || '',
        role: linkedStaff?.role || user.role || 'commuter',
        status: user.status || linkedStaff?.status || 'active',
        isUser: true,
        isStaff: Boolean(linkedStaff),
      });
    });

  // ------------------------------------------
  // CONDUCTORS + DRIVERS
  // ------------------------------------------

  staff
    .filter(member => !member.uid || !users.some(user => user.uid === member.uid))
    .forEach(member => {
    accounts.push({
      ...member,
      isUser: member.role === 'conductor',
      isStaff: true,
    });
  });

  const filtered =
    role === 'all'
      ? accounts
      : accounts.filter(
          account => account.role === role
        );
  const normalizedSearch = currentStaffSearch.trim().toLowerCase();
  const searched = normalizedSearch
    ? filtered.filter(account => [account.name, account.email, account.phone, account.role, account.status]
        .some(value => String(value || '').toLowerCase().includes(normalizedSearch)))
    : filtered;

  if (searched.length === 0) {
    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">

        <div class="text-2xl mb-2">
          <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke-width="1.8"/><path stroke-linecap="round" stroke-width="1.8" d="M4 21a8 8 0 0 1 16 0"/></svg>
        </div>

        <p class="text-sm text-gray-500">
          ${normalizedSearch ? 'No matching accounts found' : `No ${role === 'all' ? 'accounts' : `${role}s`} yet`}
        </p>

      </div>
    `;
  }

  const pageCount = Math.max(1, Math.ceil(searched.length / STAFF_PAGE_SIZE));
  staffPage = Math.min(staffPage, pageCount);
  const visibleAccounts = searched.slice(
    (staffPage - 1) * STAFF_PAGE_SIZE,
    staffPage * STAFF_PAGE_SIZE
  );

  return visibleAccounts.map(account => {

    const isAdmin =
      account.role === 'admin';

    const isDriver =
      account.role === 'driver';

    const isConductor =
      account.role === 'conductor';
    const isCommuter =
      account.role === 'commuter';

    const assignedBus = buses.find(
      bus =>
        isDriver
          ? bus.driverId === account.id
          : isConductor
            ? bus.conductorId === account.id
            : false
    );

    const initials =
      (account.name || 'U')
        .split(' ')
        .filter(Boolean)
        .map(name => name[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const avatarClass =
      isAdmin
        ? 'bg-qc-purple'
        : isDriver
          ? 'bg-qc-blue'
          : isCommuter
            ? 'bg-gray-500'
            : 'bg-qc-green';

    const roleClass =
      isAdmin
        ? 'bg-purple-100 text-qc-purple'
        : isDriver
          ? 'bg-blue-100 text-qc-blue'
          : isCommuter
            ? 'bg-gray-100 text-gray-600'
            : 'bg-green-100 text-qc-green';

    const roleLabel =
      isAdmin
        ? 'Admin'
        : isDriver
          ? 'Driver'
          : isConductor
            ? 'Conductor'
            : account.role.charAt(0).toUpperCase() + account.role.slice(1);

    return `
      <div
        class="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 grid grid-cols-[3rem_minmax(0,1fr)] sm:grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3"
      >

        <!-- AVATAR -->
        <div
          class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 ${avatarClass}"
        >
          ${escapeHtml(initials)}
        </div>

        <!-- INFO -->
        <div class="flex-1 min-w-0">

          <div class="flex items-center gap-2 flex-wrap">

            <p class="font-semibold text-sm text-gray-800 truncate">
              ${escapeHtml(account.name)}
            </p>

            <span
              class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${roleClass}"
            >
              ${escapeHtml(roleLabel)}
            </span>

            ${
              isAdmin || isConductor || isCommuter
                ? `
                  <span
                    class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      account.status === 'active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }"
                  >
                    ${
                      account.status === 'active'
                        ? 'Active'
                        : 'Inactive'
                    }
                  </span>
                `
                : ''
            }

            ${
              isConductor
                ? `
                  <span
                    class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      account.uid
                        ? 'bg-green-50 text-green-700'
                        : 'bg-yellow-50 text-yellow-700'
                    }"
                  >
                    ${
                      account.uid
                        ? 'Login linked'
                        : 'No login'
                    }
                  </span>
                `
                : ''
            }

          </div>

          <p class="text-xs text-gray-500 truncate">
            ${escapeHtml(account.email || 'No email')}
          </p>

          <p class="text-xs text-gray-400">

            ${
              assignedBus
                ? `Bus ${escapeHtml(assignedBus.code)}`
                : isAdmin
                  ? 'System administrator'
                  : 'No bus assigned'
            }

          </p>

        </div>

        <!-- ACCOUNT ACTIONS -->
        <div class="col-span-2 flex w-full justify-end gap-1 sm:col-span-1 sm:w-auto sm:flex-col md:flex-row">
          <button onclick="viewUserAccount('${account.id}', '${account.role}')" class="min-h-9 flex-1 px-3 text-xs font-semibold text-qc-blue hover:bg-blue-50 rounded-md sm:flex-none sm:px-2 sm:text-[11px]">View</button>
          <button onclick="${isCommuter ? `openUserProfileModal('${account.userId || account.uid}')` : `openStaffModal('${account.id}')`}" class="min-h-9 flex-1 px-3 text-xs font-semibold text-qc-purple hover:bg-purple-50 rounded-md sm:flex-none sm:px-2 sm:text-[11px]">Edit</button>
          <button onclick="confirmDeleteStaff('${account.id}', '${account.role}', '${account.userId || account.uid || ''}')" class="min-h-9 flex-1 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-md sm:flex-none sm:px-2 sm:text-[11px]">Delete</button>
        </div>

      </div>
    `;
  }).join('') + window.renderAdminPagination(staffPage, searched.length, 'setStaffPage');
}


// ==================================================
// FILTER
// ==================================================

async function filterStaff(role) {
  staffPage = 1;
  currentStaffRole = role;
  const search = document.getElementById('userAccountSearch');
  if (search) currentStaffSearch = search.value;

  document.querySelectorAll('.staff-tab').forEach(btn => {

    const active =
      btn.dataset.stafftab === role;

    btn.className =
      `staff-tab flex-1 py-2 text-xs font-semibold rounded-lg transition ${
        active
          ? 'bg-purple-50 text-qc-purple'
          : 'text-gray-500'
      }`;
  });

  document.getElementById('staffList').innerHTML =
    await renderStaffList(role);
}

window.searchUserAccounts = async function (value) {
  currentStaffSearch = value || '';
  staffPage = 1;
  clearTimeout(staffSearchTimeout);
  staffSearchTimeout = setTimeout(async () => {
    const list = document.getElementById('staffList');
    if (list) list.innerHTML = await renderStaffList(currentStaffRole);
  }, 220);
};

window.setStaffPage = async function (page) {
  staffPage = page;
  const list = document.getElementById('staffList');
  if (list) list.innerHTML = await renderStaffList(currentStaffRole);
};


// ==================================================
// CREATE / EDIT ACCOUNT
// ==================================================

async function openStaffModal(
  id = null,
  presetRole = null
) {

  const staff = await Store.getStaff();
  const users = await Store.getUsers();

  let member = null;

  let isAdmin = false;
  let isEdit = false;

  // ------------------------------------------
  // FIND EXISTING ACCOUNT
  // ------------------------------------------

  if (id) {

    const staffMember =
      staff.find(
        member => member.id === id
      );

    const user =
      users.find(
        user => user.uid === id
      );

    if (staffMember) {
      member = staffMember;
    }

    if (user) {
      member = {
        ...user,
        id: user.uid,
        isUser: true,
      };

      isAdmin = true;
    }

    isEdit = !!member;
  }

  const role =
    member?.role ||
    presetRole ||
    'conductor';

  openModal(
    isEdit
      ? `Edit ${role === 'admin' ? 'Admin' : role === 'driver' ? 'Driver' : 'Conductor'}`
      : 'Add Account',
    `
      <form
        id="staffForm"
        class="space-y-4"
      >

        <!-- ROLE -->
        <div>

          <label
            class="block text-xs font-medium text-gray-600 mb-1.5"
          >
            Account Type
          </label>

          <div class="grid grid-cols-3 gap-2">

            <!-- ADMIN -->

            <label
              class="cursor-pointer ${
                isEdit
                  ? 'pointer-events-none opacity-60'
                  : ''
              }"
            >

              <input
                type="radio"
                name="role"
                value="admin"
                ${
                  role === 'admin'
                    ? 'checked'
                    : ''
                }
                class="peer sr-only"
              >

              <span
                class="block text-center py-2.5 text-xs font-semibold rounded-xl border-2 border-gray-200 peer-checked:border-qc-purple peer-checked:bg-purple-50 peer-checked:text-qc-purple transition"
              >
                Admin
              </span>

            </label>

            <!-- CONDUCTOR -->

            <label
              class="cursor-pointer ${
                isEdit
                  ? 'pointer-events-none opacity-60'
                  : ''
              }"
            >

              <input
                type="radio"
                name="role"
                value="conductor"
                ${
                  role === 'conductor'
                    ? 'checked'
                    : ''
                }
                class="peer sr-only"
              >

              <span
                class="block text-center py-2.5 text-xs font-semibold rounded-xl border-2 border-gray-200 peer-checked:border-qc-green peer-checked:bg-green-50 peer-checked:text-qc-green transition"
              >
                Conductor
              </span>

            </label>

            <!-- DRIVER -->

            <label
              class="cursor-pointer ${
                isEdit
                  ? 'pointer-events-none opacity-60'
                  : ''
              }"
            >

              <input
                type="radio"
                name="role"
                value="driver"
                ${
                  role === 'driver'
                    ? 'checked'
                    : ''
                }
                class="peer sr-only"
              >

              <span
                class="block text-center py-2.5 text-xs font-semibold rounded-xl border-2 border-gray-200 peer-checked:border-qc-blue peer-checked:bg-blue-50 peer-checked:text-qc-blue transition"
              >
                Driver
              </span>

            </label>

          </div>

        </div>


        <!-- NAME -->
        <div>

          <label
            class="block text-xs font-medium text-gray-600 mb-1.5"
          >
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


        <!-- EMAIL -->
        <div>

          <label
            class="block text-xs font-medium text-gray-600 mb-1.5"
          >
            Email
          </label>

          <input
            name="email"
            type="email"
            ${
              role === 'driver'
                ? ''
                : 'required'
            }
            placeholder="juan@qcbus.ph"
            value="${escapeHtml(member?.email || '')}"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
          >

          ${
            role === 'driver'
              ? `
                <p class="text-[10px] text-gray-400 mt-1">
                  Optional for drivers. Drivers do not need a login.
                </p>
              `
              : ''
          }

        </div>


        <!-- PHONE -->
        <div>

          <label
            class="block text-xs font-medium text-gray-600 mb-1.5"
          >
            Mobile Number
          </label>

          <input
            name="phone"
            type="tel"
            placeholder="912 345 6789"
            value="${escapeHtml(member?.phone || '')}"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
          >

        </div>


        <!-- PASSWORD -->
        ${
          !isEdit && role !== 'driver'
            ? `
              <div>

                <label
                  class="block text-xs font-medium text-gray-600 mb-1.5"
                >
                  Password
                </label>

                <input
                  name="password"
                  type="password"
                  minlength="6"
                  required
                  placeholder="Minimum 6 characters"
                  class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
                >

              </div>

              <div>

                <label
                  class="block text-xs font-medium text-gray-600 mb-1.5"
                >
                  Confirm Password
                </label>

                <input
                  name="confirmPassword"
                  type="password"
                  minlength="6"
                  required
                  placeholder="Re-enter password"
                  class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
                >

              </div>
            `
            : ''
        }


        <!-- DRIVER LICENSE -->
        <div id="driverFields">

          <label
            class="block text-xs font-medium text-gray-600 mb-1.5"
          >
            License Number
          </label>

          <input
            name="licenseNumber"
            placeholder="N01-23-456789"
            value="${escapeHtml(member?.licenseNumber || '')}"
            class="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-qc-purple outline-none"
          >

        </div>


        <!-- INFO -->
        ${
          !isEdit
            ? `
              <div
                class="bg-purple-50 border border-purple-100 rounded-xl p-3"
              >

                <p
                  class="text-[11px] text-purple-800 font-semibold mb-1"
                >
                  Account Access
                </p>

                <p class="text-[11px] text-purple-700">

                  ${
                    role === 'driver'
                      ? 'Drivers are operational staff and do not receive a Firebase login.'
                      : 'A Firebase login account will be created automatically.'
                  }

                </p>

              </div>
            `
            : ''
        }


        <!-- BUTTONS -->
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
            ${
              isEdit
                ? 'Save Changes'
                : 'Create Account'
            }
          </button>

        </div>

      </form>
    `
  );

// ==================================================
// ROLE FIELD VISIBILITY
// ==================================================

const syncFields = () => {

  const checked =
    document.querySelector(
      'input[name="role"]:checked'
    )?.value;

  const driverFields =
    document.getElementById(
      'driverFields'
    );

  if (driverFields) {
    driverFields.style.display =
      checked === 'driver'
        ? ''
        : 'none';
  }


  // ----------------------------------------------
  // PASSWORD FIELDS
  // ----------------------------------------------

  const passwordFields =
    document.querySelectorAll(
      'input[name="password"], input[name="confirmPassword"]'
    );

  passwordFields.forEach(input => {

    const passwordContainer =
      input.closest('div');

    const isDriver =
      checked === 'driver';

    if (passwordContainer) {
      passwordContainer.style.display =
        isDriver
          ? 'none'
          : '';
    }

    // Drivers do not have Firebase login accounts.
    input.required = !isDriver;

    if (isDriver) {
      input.value = '';
    }
  });

};


syncFields();


document
  .querySelectorAll(
    'input[name="role"]'
  )
  .forEach(input => {
    input.addEventListener(
      'change',
      syncFields
    );
  });

  const staffForm = document.getElementById('staffForm');

  staffForm.addEventListener('input', () => {
    staffForm.dataset.dirty = 'true';
  });

  staffForm.addEventListener('change', () => {
    staffForm.dataset.dirty = 'true';
  });

  if (!window.__staffFormUnloadGuard) {
    window.addEventListener('beforeunload', event => {
      const activeForm = document.getElementById('staffForm');
      const modal = document.getElementById('modal');

      if (
        activeForm?.dataset.dirty === 'true' &&
        modal &&
        !modal.classList.contains('hidden')
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    window.__staffFormUnloadGuard = true;
  }


  // ==================================================
  // SUBMIT
  // ==================================================

  document
    .getElementById('staffForm')
    .addEventListener(
      'submit',
      async e => {

        e.preventDefault();

        const data =
          Object.fromEntries(
            new FormData(e.target)
          );

        const selectedRole =
          data.role;

        const name =
          data.name.trim();

        const email =
          (data.email || '')
            .toLowerCase()
            .trim();

        try {

          // ==========================================
          // VALIDATE PASSWORD
          // ==========================================

          if (
            !isEdit &&
            selectedRole !== 'driver'
          ) {

            if (
              data.password !==
              data.confirmPassword
            ) {
              showToast(
                'Passwords do not match',
                'error'
              );

              return;
            }

            if (
              data.password.length < 6
            ) {
              showToast(
                'Password must be at least 6 characters',
                'error'
              );

              return;
            }
          }


          // ==========================================
          // EDIT ADMIN
          // ==========================================

          if (
            isEdit &&
            isAdmin
          ) {

            await Store.updateUserProfile(
              member.uid,
              {
                name,
                phone: data.phone || '',
              }
            );

            showToast(
              'Admin updated',
              'success'
            );

          }


          // ==========================================
          // EDIT STAFF
          // ==========================================

          else if (isEdit) {

            await Store.updateStaff(
              id,
              {
                name,
                email,
                phone: data.phone || '',
                licenseNumber:
                  data.licenseNumber || '',
              }
            );

            // Keep linked user profile synced.
            if (
              member.uid &&
              member.role === 'conductor'
            ) {

              await Store.updateUserProfile(
                member.uid,
                {
                  name,
                  email,
                  phone: data.phone || '',
                }
              );

            }

            showToast(
              'Account updated',
              'success'
            );

          }


          // ==========================================
          // CREATE ADMIN / CONDUCTOR
          // ==========================================

          else if (
            selectedRole === 'admin' ||
            selectedRole === 'conductor'
          ) {

            if (!email) {
              showToast(
                'Email is required',
                'error'
              );

              return;
            }

            const existingUser =
              await Store.getUserByEmail(
                email
              );

            if (existingUser) {
              showToast(
                'An account with this email already exists',
                'error'
              );

              return;
            }

            const existingStaff =
              await Store.getStaff();

            if (
              existingStaff.some(
                staff =>
                  staff.email === email
              )
            ) {
              showToast(
                'This email is already used by staff',
                'error'
              );

              return;
            }

            const account =
              await Store.createLoginAccount({
                email,
                password: data.password,
                name,
                phone: data.phone || '',
                role: selectedRole,
              });

            // Conductor gets a staff profile too.
            if (
              selectedRole === 'conductor'
            ) {

              await Store.addStaff({
                uid: account.uid,
                name,
                email,
                phone: data.phone || '',
                role: 'conductor',
                licenseNumber: '',
              });

            }

            showToast(
              selectedRole === 'admin'
                ? 'Admin account created'
                : 'Conductor account created',
              'success'
            );

          }


          // ==========================================
          // CREATE DRIVER
          // ==========================================

          else if (
            selectedRole === 'driver'
          ) {

            const existingStaff =
              await Store.getStaff();

            if (
              email &&
              existingStaff.some(
                staff =>
                  staff.email === email
              )
            ) {
              showToast(
                'This email is already used by staff',
                'error'
              );

              return;
            }

            await Store.addStaff({
              uid: null,
              name,
              email,
              phone: data.phone || '',
              role: 'driver',
              licenseNumber:
                data.licenseNumber || '',
            });

            showToast(
              'Driver added',
              'success'
            );
          }


          closeModal();

          await navigateTo(
            'staff'
          );

        } catch (error) {

          console.error(
            'Account save error:',
            error
          );

          showToast(
            error?.message ||
              'Failed to save account',
            'error'
          );
        }
      }
    );
}


// ==================================================
// ACCOUNT ACTIONS
// ==================================================

window.viewUserAccount = async function (id, role) {
  const [users, staff, buses] = await Promise.all([
    Store.getUsers(),
    Store.getStaff(),
    Store.getBuses(),
  ]);
  const staffMember = staff.find(member => member.id === id);
  const user = users.find(profile => profile.uid === id || profile.uid === staffMember?.uid);
  const account = { ...(staffMember || {}), ...(user || {}) };
  if (!staffMember && !user) return;

  const assignedBus = buses.find(bus =>
    role === 'driver' ? bus.driverId === id : role === 'conductor' ? bus.conductorId === id : false
  );
  openModal(escapeHtml(account.name || 'User account'), `
    <div class="space-y-3 text-sm">
      <div><p class="text-xs text-gray-400">Account type</p><p class="font-medium text-gray-800">${escapeHtml(role)}</p></div>
      <div><p class="text-xs text-gray-400">Email</p><p class="font-medium text-gray-800 break-all">${escapeHtml(account.email || 'No email')}</p></div>
      <div><p class="text-xs text-gray-400">Phone</p><p class="font-medium text-gray-800">${escapeHtml(account.phone || 'No phone number')}</p></div>
      <div><p class="text-xs text-gray-400">Status</p><p class="font-medium text-gray-800">${escapeHtml(account.status || 'Active')}</p></div>
      ${assignedBus ? `<div><p class="text-xs text-gray-400">Assigned bus</p><p class="font-medium text-gray-800">${escapeHtml(assignedBus.code || assignedBus.id)}</p></div>` : ''}
    </div>
  `);
};

window.openUserProfileModal = async function (uid) {
  const users = await Store.getUsers();
  const user = users.find(profile => profile.uid === uid);
  if (!user) return;

  openModal('Edit Commuter', `
    <form id="commuterAccountForm" class="space-y-4">
      <label class="block text-xs font-medium text-gray-600">Full name
        <input name="name" required value="${escapeHtml(user.name || '')}" class="mt-1 w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-qc-purple">
      </label>
      <label class="block text-xs font-medium text-gray-600">Email
        <input type="email" value="${escapeHtml(user.email || '')}" disabled class="mt-1 w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-500">
        <span class="block mt-1 text-[11px] text-gray-400">Email changes must be made through Firebase Authentication.</span>
      </label>
      <label class="block text-xs font-medium text-gray-600">Phone
        <input name="phone" type="tel" maxlength="12" inputmode="numeric" value="${escapeHtml(user.phone || '')}" class="mt-1 w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-qc-purple">
      </label>
      <button type="submit" class="w-full py-2.5 bg-qc-purple text-white text-sm font-semibold rounded-xl">Save changes</button>
    </form>
  `);

  document.getElementById('commuterAccountForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      await Store.updateUserProfile(uid, {
        name: String(formData.get('name') || '').trim(),
        phone: String(formData.get('phone') || '').replace(/\D/g, '').slice(0, 12),
      });
      closeModal();
      showToast('Commuter account updated', 'success');
      await navigateTo('staff');
    } catch (error) {
      console.error('Commuter account update error:', error);
      showToast('Failed to update account', 'error');
    }
  });
};

async function openStaffActions(
  id,
  role
) {

  let member = null;

  if (role === 'admin') {

    const users =
      await Store.getUsers();

    member =
      users.find(
        user => user.uid === id
      );

  } else {

    const staff =
      await Store.getStaff();

    member =
      staff.find(
        staff => staff.id === id
      );
  }

  if (!member) return;

  openModal(
    escapeHtml(
      member.name || 'Account'
    ),

    `
      <div class="space-y-2">

        <!-- EDIT -->

        <button
          onclick="openStaffModal('${id}')"
          class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl transition text-left"
        >

          <span
            class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center"
          >
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 4 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z"/></svg>
          </span>

          <span class="text-sm font-medium text-gray-700">
            Edit Details
          </span>

        </button>


        <!-- DELETE -->

        <button
          onclick="confirmDeleteStaff('${id}', '${role}')"
          class="w-full p-3 flex items-center gap-3 hover:bg-red-50 rounded-xl transition text-left"
        >

          <span
            class="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center"
          >
            <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>
          </span>

          <span class="text-sm font-medium text-red-600">
            Delete Account
          </span>

        </button>

      </div>
    `
  );
}


// ==================================================
// DELETE ACCOUNT
// ==================================================

async function confirmDeleteStaff(
  id,
  role,
  userId = ''
) {

  closeModal();

  const ok =
    await confirmAction(
      'Delete Account?',
      role === 'admin' || role === 'commuter' || (role === 'conductor' && userId)
        ? 'This will mark the user profile inactive. Their Firebase sign-in will remain available.'
        : 'This will remove the staff record.',
      'Delete'
    );

  if (!ok) return;

  try {

    if (role === 'admin' || role === 'commuter' || (role === 'conductor' && userId)) {

      // Delete Firestore profile only.
      // Firebase Authentication account
      // remains until removed through
      // Firebase Auth/Admin tooling.
      await Store.updateUserProfile(
        userId || id,
        {
          status: 'inactive',
        }
      );

      showToast(
        'User account deactivated',
        'info'
      );

      if (role === 'conductor') {
        await Store.deleteStaff(id);
      }

    } else {

      await Store.deleteStaff(id);

      showToast(
        'Account removed',
        'info'
      );
    }

    await navigateTo(
      'staff'
    );

  } catch (error) {

    console.error(
      'Account delete error:',
      error
    );

    showToast(
      'Failed to update account',
      'error'
    );
  }
}


// ==================================================
// EXPOSE
// ==================================================

window.openStaffModal =
  openStaffModal;

window.openStaffActions =
  openStaffActions;

window.filterStaff =
  filterStaff;

window.confirmDeleteStaff =
  confirmDeleteStaff;
