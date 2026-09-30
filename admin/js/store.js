
import {
  getRoutesRepo,
  addRouteRepo,
  updateRouteRepo,
  deleteRouteRepo,
} from "../../shared/js/repositories/routes.repo.js";

import {
  getStaffRepo,
  getStaffByUidRepo,
  addStaffRepo,
  updateStaffRepo,
  deleteStaffRepo,
} from "../../shared/js/repositories/staff.repo.js";

import {
  getUserByEmailRepo,
  getUsersRepo,
  createLoginAccountRepo,
  updateUserProfile,
} from "../../shared/js/repositories/users.repo.js";

import {
  getStopsRepo,
  addStopRepo,
  updateStopRepo,
  deleteStopRepo,
  reorderStopsRepo,
} from "../../shared/js/repositories/stops.repo.js";

import {
  getBusesRepo,
  addBusRepo,
  updateBusRepo,
  deleteBusRepo,
} from "../../shared/js/repositories/buses.repo.js";



const Store = {
  KEYS: {
    routes: 'qcAdminRoutes',
    stops: 'qcAdminStops',
    buses: 'qcAdminBuses',
    staff: 'qcAdminStaff',
    admin: 'qcAdminUser',
  },

  read(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));

    window.dispatchEvent(
      new CustomEvent('store:change', {
        detail: { key }
      })
    );
  },

  async getUserByEmail(email) {
  return await getUserByEmailRepo(email);
  },

  uid(prefix = '') {
    return (
      prefix +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6)
    );
  },

  // ==================================================
  // ROUTES — FIRESTORE
  // ==================================================

  async getRoutes() {
    return await getRoutesRepo();
  },

  async addRoute(data) {
    return await addRouteRepo(data);
  },

  async updateRoute(id, patch) {
    return await updateRouteRepo(id, patch);
  },

  async deleteRoute(id) {
  await deleteRouteRepo(id);

  // Remove route assignment from buses
  const buses = await this.getBuses();

  await Promise.all(
    buses
      .filter(bus => bus.routeId === id)
      .map(bus =>
        this.updateBus(bus.id, {
          routeId: null
        })
      )
  );
},

      // ==================================================
    // STOPS — FIRESTORE
    // ==================================================

    async getStops() {
      return await getStopsRepo();
    },

    async saveStops(list) {
      // No longer used for Firestore stops.
      // Kept out intentionally to avoid mixing localStorage with Firestore.
    },

    async addStop(data) {
      const stops = await this.getStops();

      return await addStopRepo({
        routeId: data.routeId,
        name: data.name,
        lat: data.lat,
        lng: data.lng,
        order:
          data.order ??
          stops.filter(s => s.routeId === data.routeId).length + 1,
      });
    },

    async updateStop(id, patch) {
      return await updateStopRepo(id, patch);
    },

    async reorderStops(routeId, orderedStopIds) {
      return await reorderStopsRepo(
        routeId,
        orderedStopIds
      );
    },

    async deleteStop(id) {
      return await deleteStopRepo(id);
    },

    async getStopsByRoute(routeId) {
      const stops = await this.getStops();

      return stops
        .filter(stop => stop.routeId === routeId)
        .sort((a, b) => a.order - b.order);
    },

    // BUSES — FIRESTORE
  async getBuses() {
    return await getBusesRepo();
  },

  async addBus(data) {
    return await addBusRepo(data);
  },

  async updateBus(id, patch) {
    return await updateBusRepo(id, patch);
  },

  async deleteBus(id) {
    return await deleteBusRepo(id);
  },

  // ==================================================
  // STAFF — FIRESTORE
  // ==================================================

  async getStaff() {
    return await getStaffRepo();
  },

  async getStaffByUid(uid) {
  return await getStaffByUidRepo(uid);
  },

  async addStaff(data) {
    return await addStaffRepo(data);
  },

  async updateStaff(id, patch) {
    return await updateStaffRepo(id, patch);
  },

  async deleteStaff(id) {
    return await deleteStaffRepo(id);
  },

  async getStaffByRole(role) {
    const staff = await this.getStaff();

    return staff.filter(
      member => member.role === role
    );
  },
    async createLoginAccount(data) {
    return await createLoginAccountRepo(data);
  },

  async updateUserProfile(uid, patch) {
    return await updateUserProfile(uid, patch);
  },
  async getUsers() {
  return await getUsersRepo();
},

async getUsers() {
  return await getUsersRepo();
},


};

window.Store = Store;