// ==================================================
// STORE — localStorage-backed data layer
// ==================================================

const Store = {
  KEYS: {
    routes: 'qcAdminRoutes',
    stops:  'qcAdminStops',
    buses:  'qcAdminBuses',
    staff:  'qcAdminStaff',
    admin:  'qcAdminUser',
  },

  // ---- Generic helpers ----
  read(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    // Notify listeners on this tab
    window.dispatchEvent(new CustomEvent('store:change', { detail: { key } }));
  },

  // ---- ID generator ----
  uid(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  // ========== ROUTES ==========
  getRoutes() { return this.read(this.KEYS.routes); },
  saveRoutes(list) { this.write(this.KEYS.routes, list); },
  addRoute(data) {
    const list = this.getRoutes();
    const route = {
      id: this.uid('R-'),
      code: data.code,          // e.g. "R1"
      name: data.name,          // e.g. "Fairview – Cubao"
      color: data.color || '#1e40af',
      description: data.description || '',
      fare: Number(data.fare) || 15,
      createdAt: Date.now(),
    };
    list.push(route);
    this.saveRoutes(list);
    return route;
  },
  updateRoute(id, patch) {
    const list = this.getRoutes().map(r => r.id === id ? { ...r, ...patch } : r);
    this.saveRoutes(list);
  },
  deleteRoute(id) {
    this.saveRoutes(this.getRoutes().filter(r => r.id !== id));
    // Also delete orphan stops
    this.saveStops(this.getStops().filter(s => s.routeId !== id));
  },

  // ========== STOPS ==========
  getStops() { return this.read(this.KEYS.stops); },
  saveStops(list) { this.write(this.KEYS.stops, list); },
  addStop(data) {
    const list = this.getStops();
    const stop = {
      id: this.uid('S-'),
      routeId: data.routeId,
      name: data.name,
      lat: Number(data.lat),
      lng: Number(data.lng),
      order: data.order ?? list.filter(s => s.routeId === data.routeId).length + 1,
      createdAt: Date.now(),
    };
    list.push(stop);
    this.saveStops(list);
    return stop;
  },
  updateStop(id, patch) {
    const list = this.getStops().map(s => s.id === id ? { ...s, ...patch } : s);
    this.saveStops(list);
  },
  deleteStop(id) {
    this.saveStops(this.getStops().filter(s => s.id !== id));
  },
  getStopsByRoute(routeId) {
    return this.getStops()
      .filter(s => s.routeId === routeId)
      .sort((a, b) => a.order - b.order);
  },

  // ========== BUSES ==========
  getBuses() { return this.read(this.KEYS.buses); },
  saveBuses(list) { this.write(this.KEYS.buses, list); },
  addBus(data) {
    const list = this.getBuses();
    const bus = {
      id: this.uid('B-'),
      code: data.code,          // e.g. "QC-1234"
      plateNumber: data.plateNumber,
      capacity: Number(data.capacity) || 45,
      routeId: data.routeId || null,
      driverId: data.driverId || null,
      conductorId: data.conductorId || null,
      status: data.status || 'idle', // idle | active | maintenance
      createdAt: Date.now(),
    };
    list.push(bus);
    this.saveBuses(list);
    return bus;
  },
  updateBus(id, patch) {
    this.saveBuses(this.getBuses().map(b => b.id === id ? { ...b, ...patch } : b));
  },
  deleteBus(id) {
    this.saveBuses(this.getBuses().filter(b => b.id !== id));
  },

  // ========== STAFF (drivers + conductors) ==========
  getStaff() { return this.read(this.KEYS.staff); },
  saveStaff(list) { this.write(this.KEYS.staff, list); },
  addStaff(data) {
    const list = this.getStaff();
    const member = {
      id: this.uid('U-'),
      name: data.name,
      email: (data.email || '').toLowerCase(),
      phone: data.phone || '',
      role: data.role,                 // 'driver' | 'conductor'
      password: data.password,         // plain for prototype only!
      licenseNumber: data.licenseNumber || '',
      status: 'active',
      createdAt: Date.now(),
    };
    list.push(member);
    this.saveStaff(list);

    // Also register in shared qcUsers so they can log into their PWA
    const users = JSON.parse(localStorage.getItem('qcUsers') || '[]');
    if (!users.some(u => u.email === member.email)) {
      users.push({
        name: member.name,
        email: member.email,
        phone: member.phone,
        password: member.password,
        role: member.role,
      });
      localStorage.setItem('qcUsers', JSON.stringify(users));
    }

    return member;
  },
  updateStaff(id, patch) {
    this.saveStaff(this.getStaff().map(s => s.id === id ? { ...s, ...patch } : s));
  },
  deleteStaff(id) {
    this.saveStaff(this.getStaff().filter(s => s.id !== id));
  },
  getStaffByRole(role) {
    return this.getStaff().filter(s => s.role === role);
  },

  // ========== Seed demo data on first run ==========
  seedIfEmpty() {
    if (this.getRoutes().length === 0) {
      const r1 = this.addRoute({ code: 'R1', name: 'Fairview – Cubao', color: '#1e40af', fare: 15, description: 'Commonwealth Ave corridor' });
      const r2 = this.addRoute({ code: 'R2', name: 'Novaliches – Monumento', color: '#16a34a', fare: 12 });

      this.addStop({ routeId: r1.id, name: 'Fairview Terminal', lat: 14.7330, lng: 121.0575, order: 1 });
      this.addStop({ routeId: r1.id, name: 'SM Fairview',       lat: 14.7300, lng: 121.0550, order: 2 });
      this.addStop({ routeId: r1.id, name: 'Batasan Hills',     lat: 14.6850, lng: 121.0930, order: 3 });
      this.addStop({ routeId: r1.id, name: 'Cubao',             lat: 14.6228, lng: 121.0519, order: 4 });

      this.addStop({ routeId: r2.id, name: 'Novaliches Bayan',  lat: 14.7300, lng: 121.0300, order: 1 });
      this.addStop({ routeId: r2.id, name: 'Monumento',         lat: 14.6560, lng: 120.9840, order: 2 });
    }

    if (this.getStaff().length === 0) {
      this.addStaff({ name: 'Pedro Reyes',   email: 'pedro@qcbus.ph', phone: '9171234567', role: 'conductor', password: 'pedro123' });
      this.addStaff({ name: 'Mario Santos',  email: 'mario@qcbus.ph', phone: '9179876543', role: 'driver',    password: 'mario123', licenseNumber: 'N01-23-456789' });
    }

    if (this.getBuses().length === 0) {
      const routes = this.getRoutes();
      const conductors = this.getStaffByRole('conductor');
      const drivers = this.getStaffByRole('driver');
      this.addBus({
        code: 'QC-1234', plateNumber: 'NCR 4521', capacity: 45,
        routeId: routes[0]?.id, driverId: drivers[0]?.id, conductorId: conductors[0]?.id,
        status: 'active',
      });
      this.addBus({
        code: 'QC-5678', plateNumber: 'NCR 7788', capacity: 50,
        routeId: routes[1]?.id, status: 'idle',
      });
    }
  },
};

// Make available globally
window.Store = Store;