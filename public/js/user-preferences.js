(function attachVinylDropPreferences(root) {
  const STORAGE_KEY = 'tvd:preferences:v1';
  const defaults = Object.freeze({
    soundEffectsEnabled: true,
  });
  const listeners = new Set();
  let values = readStoredValues();

  function readStoredValues() {
    try {
      const serialized = root.localStorage.getItem(STORAGE_KEY);
      if (!serialized) return {};
      const parsed = JSON.parse(serialized);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const stored = {};
      Object.keys(defaults).forEach((key) => {
        if (typeof parsed[key] === typeof defaults[key]) stored[key] = parsed[key];
      });
      return stored;
    } catch {
      return {};
    }
  }

  function get(key) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) return undefined;
    return typeof values[key] === typeof defaults[key] ? values[key] : defaults[key];
  }

  function getAll() {
    const current = {};
    Object.keys(defaults).forEach((key) => {
      current[key] = get(key);
    });
    return Object.freeze(current);
  }

  function set(key, value) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key) || typeof value !== typeof defaults[key]) {
      return false;
    }

    values = { ...values, [key]: value };
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
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
