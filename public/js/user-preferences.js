(function attachVinylDropPreferences(root) {
  const STORAGE_KEY = 'tvd:preferences:v1';
  const themes = new Set([
    'record-shop',
    'blue-note',
    'soul-45',
    'mint-press',
    'midnight-groove',
    'purple-haze',
  ]);
  const defaults = Object.freeze({
    soundEffectsEnabled: true,
    hapticFeedbackEnabled: true,
    tutorialsEnabled: true,
    theme: 'record-shop',
  });
  const listeners = new Set();
  let values = readStoredValues();

  function isValidValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) return false;
    if (key === 'theme') return typeof value === 'string' && themes.has(value);
    return typeof value === 'boolean';
  }

  function readStoredValues() {
    try {
      const serialized = root.localStorage.getItem(STORAGE_KEY);
      if (!serialized) return {};
      const parsed = JSON.parse(serialized);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const stored = {};
      Object.keys(defaults).forEach((key) => {
        if (isValidValue(key, parsed[key])) stored[key] = parsed[key];
      });
      return stored;
    } catch {
      return {};
    }
  }

  function get(key) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) return undefined;
    return isValidValue(key, values[key]) ? values[key] : defaults[key];
  }

  function getAll() {
    const current = {};
    Object.keys(defaults).forEach((key) => {
      current[key] = get(key);
    });
    return Object.freeze(current);
  }

  function applyTheme() {
    if (!root || !root.document || !root.document.documentElement) return;
    try {
      root.document.documentElement.setAttribute('data-theme', get('theme'));
    } catch {
      // Theme application is progressive enhancement; preferences remain usable.
    }
  }

  function set(key, value) {
    if (!isValidValue(key, value)) return false;

    values = { ...values, [key]: value };
    if (key === 'theme') applyTheme();

    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(getAll()));
    } catch {
      // Keep the in-memory value for this page when browser storage is unavailable.
    }
    listeners.forEach((listener) => {
      try {
        listener(getAll(), key);
      } catch {
        // A preference subscriber must never interrupt the interaction that changed it.
      }
    });
    return true;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const api = Object.freeze({ get, getAll, set, subscribe, storageKey: STORAGE_KEY });
  if (root) root.VinylDropPreferences = api;
  applyTheme();
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
