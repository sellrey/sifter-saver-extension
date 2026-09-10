// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Gaming Co.
/* Sifter Saver — thin promise wrapper over browser.storage.local that works in
 * Chrome (chrome.*) and Firefox (browser.*). */
(function () {
  'use strict';
  const SS = (globalThis.SifterSaver = globalThis.SifterSaver || {});
  const api = globalThis.browser && globalThis.browser.storage ? globalThis.browser : globalThis.chrome;
  const area = api && api.storage ? api.storage.local : null;

  const DEFAULT_SETTINGS = {
    confirmEnabled: true,
    warnPriceAbove: 1,
    sidebarCollapsed: false,
    showAllPresets: false,
  };

  // In-memory fallback so the UI still works if storage is unavailable
  // (e.g. when the scripts are injected outside an extension for testing).
  const memory = { presets: [], settings: { ...DEFAULT_SETTINGS } };

  function call(method, arg) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        const err = api.runtime && api.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(result);
      };
      try {
        // Chrome MV3 and Firefox both return a promise when no callback is given.
        const maybe = area[method](arg);
        if (maybe && typeof maybe.then === 'function') maybe.then(done, (e) => { if (!settled) { settled = true; reject(e); } });
        else area[method](arg, done);
      } catch (e) {
        if (!settled) { settled = true; reject(e); }
      }
    });
  }

  function get(keys) {
    if (!area) return Promise.resolve(pick(memory, keys));
    return call('get', keys).then((r) => r || {});
  }

  function set(obj) {
    if (!area) {
      Object.assign(memory, obj);
      return Promise.resolve();
    }
    return call('set', obj).then(() => undefined);
  }

  function pick(src, keys) {
    const out = {};
    (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
      if (k in src) out[k] = src[k];
    });
    return out;
  }

  async function loadPresets() {
    const r = await get(['presets']);
    return Array.isArray(r.presets) ? r.presets : [];
  }

  async function savePresets(presets) {
    await set({ presets });
  }

  async function loadSettings() {
    const r = await get(['settings']);
    return { ...DEFAULT_SETTINGS, ...(r.settings || {}) };
  }

  async function saveSettings(settings) {
    await set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  }

  function onChanged(handler) {
    if (!api || !api.storage || !api.storage.onChanged) return () => {};
    const fn = (changes, areaName) => {
      if (areaName === 'local') handler(changes);
    };
    api.storage.onChanged.addListener(fn);
    return () => api.storage.onChanged.removeListener(fn);
  }

  function uuid() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  SS.storage = { DEFAULT_SETTINGS, loadPresets, savePresets, loadSettings, saveSettings, onChanged, uuid };
})();
