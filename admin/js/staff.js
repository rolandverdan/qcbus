
// ==================================================
// ACCOUNT MANAGER
// ==================================================

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

  return `
    <div class="space-y-4 slide-in">

      <!-- HEADER -->
      <div class="flex items-center justify-between">

        <div>
          <h2 class="font-semibold text-gray-800">
            Account Manager
          </h2>

          <p class="text-xs text-gray-400 mt-0.5">
            Manage administrators, conductors, and drivers
          </p>
        </div>

        <button
          onclick="openStaffModal()"
          class="px-3 py-1.5 bg-qc-purple text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1"
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

      <!-- FILTERS -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-1 flex">

        <button
          onclick="filterStaff('all')"
          data-stafftab="all"
          class="staff-tab flex-1 py-2 text-xs font-semibold rounded-lg bg-purple-50 text-qc-purple transition"
        >
          All (${admins.length + conductors.length + drivers.length})
        </button>

        <button
          onclick="filterStaff('admin')"
          data-stafftab="admin"
          class="staff-tab flex-1 py-2 text-xs font-semibold rounded-lg text-gray-500 transition"
        >
          Admins (${admins.length})
        </button>

        <button
          onclick="filterStaff('conductor')"
          data-stafftab="conductor"
          class="staff-tab flex-1 py-2 text-xs font-semibold rounded-lg text-gray-500 transition"
        >
          Conductors (${conductors.length})
        </button>

        <button
          onclick="filterStaff('driver')"
          data-stafftab="driver"
          class="staff-tab flex-1 py-2 text-xs font-semibold rounded-lg text-gray-500 transition"
        >
          Drivers (${drivers.length})
        </button>

      </div>

      <!-- LIST -->
      <div id="staffList" class="space-y-3">
        ${await renderStaffList()}
      </div>

    </div>
  `;
};


// ==================================================
// RENDER ACCOUNT LIST
// ==================================================

async function renderStaffList(role = 'all') {
  const staff = await Store.getStaff();
  const users = await Store.getUsers();
  const buses = await Store.getBuses();

  const accounts = [];

  // ------------------------------------------
  // ADMINS
  // ------------------------------------------

  users
    .filter(user => user.role === 'admin')
    .forEach(user => {
      accounts.push({
        id: user.uid,
        uid: user.uid,
        name: user.name || 'Unnamed Admin',
        email: user.email || '',
        phone: user.phone || '',
        role: 'admin',
        status: user.status || 'active',
        isUser: true,
        isStaff: false,
      });
    });

  // ------------------------------------------
  // CONDUCTORS + DRIVERS
  // ------------------------------------------

  staff.forEach(member => {
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

  if (filtered.length === 0) {
    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">

        <div class="text-2xl mb-2">
          👤
        </div>

        <p class="text-sm text-gray-500">
          No ${role === 'all' ? 'accounts' : `${role}s`} yet
        </p>

      </div>
    `;
  }

  return filtered.map(account => {

    const isAdmin =
      account.role === 'admin';

    const isDriver =
      account.role === 'driver';

    const isConductor =
      account.role === 'conductor';

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
          : 'bg-qc-green';

    const roleClass =
      isAdmin
        ? 'bg-purple-100 text-qc-purple'
        : isDriver
          ? 'bg-blue-100 text-qc-blue'
          : 'bg-green-100 text-qc-green';

    const roleLabel =
      isAdmin
        ? 'Admin'
        : isDriver
          ? 'Driver'
          : 'Conductor';

    return `
      <div
        class="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3"
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
              ${roleLabel}
            </span>

            ${
              isAdmin || isConductor
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
                ? `🚌 ${escapeHtml(assignedBus.code)}`
                : isAdmin
                  ? 'System administrator'
                  : 'No bus assigned'
            }

          </p>

        </div>

        <!-- ACTIONS -->
        <button
          onclick="openStaffActions('${account.id}', '${account.role}')"
          class="p-1.5 hover:bg-gray-100 rounded-full transition"
        >
          <svg
            class="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 5v.01M12 12v.01M12 19v.01"
            />
          </svg>
        </button>

      </div>
    `;
  }).join('');
}


// ==================================================
// FILTER
// ==================================================

async function filterStaff(role) {

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
                👑 Admin
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
                🎫 Conductor
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
                🚗 Driver
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
            ✏️
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
            🗑️
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
  role
) {

  closeModal();

  const ok =
    await confirmAction(
      'Delete Account?',
      role === 'admin'
        ? 'This will remove the admin profile.'
        : 'This will remove the staff record.',
      'Delete'
    );

  if (!ok) return;

  try {

    if (role === 'admin') {

      // Delete Firestore profile only.
      // Firebase Authentication account
      // remains until removed through
      // Firebase Auth/Admin tooling.
      await Store.updateUserProfile(
        id,
        {
          status: 'inactive',
        }
      );

      showToast(
        'Admin account deactivated',
        'info'
      );

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
