const SettingsManager = {
  get(key) {
    return AppState.settings[key];
  },
  set(key, value) {
    AppState.settings[key] = value;
    localStorage.setItem('qcSettings', JSON.stringify(AppState.settings));
  },
  reset() {
    AppState.settings = {
      notifications: false,
      darkMode: false,
      language: 'en',
      autoRefresh: true,
      refreshInterval: 30
    };
    localStorage.setItem('qcSettings', JSON.stringify(AppState.settings));
  }
};

window.SettingsManager = SettingsManager;