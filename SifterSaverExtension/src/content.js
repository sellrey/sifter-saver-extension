/* Sifter Saver — content-script entry point.
 *
 * Responsibilities:
 *  - watch the SPA for the Roca Sifter job wizard and mount/unmount the sidebar
 *  - gate the "Start job" button behind a confirmation dialog
 *  - wire sidebar actions to storage and to the site adapter */
(function () {
  'use strict';
  const SS = globalThis.SifterSaver;
  if (!SS || !SS.dom || !SS.sidebar || !SS.modal || !SS.storage || !SS.presets) return;
  if (globalThis.__sifterSaverBooted) return;
  globalThis.__sifterSaverBooted = true;

  const { dom, sidebar, modal, storage, presets: P, catalog: C } = SS;

  const state = {
    presets: [],
    settings: { ...storage.DEFAULT_SETTINGS },
    ctx: { step: null, gameName: null, gameCode: null, jobType: null },
    lastApplied: null, // { preset, at, report }
    busy: false,
    notice: null, // { kind: 'info'|'ok'|'warn'|'error', text }
  };

  let bypassNextClick = false;
  let confirmOpen = false;
  let refreshQueued = false;

  /* ---------- boot ---------- */

  async function boot() {
    try {
      state.presets = await storage.loadPresets();
      state.settings = await storage.loadSettings();
    } catch (e) {
      console.warn('[Sifter Saver] storage unavailable', e);
    }
    storage.onChanged(async (changes) => {
      if (changes.presets) state.presets = Array.isArray(changes.presets.newValue) ? changes.presets.newValue : [];
      if (changes.settings) state.settings = { ...storage.DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
      pushState();
    });

    document.addEventListener('click', onCaptureClick, true);
    window.addEventListener('popstate', queueRefresh);
    const observer = new MutationObserver((records) => {
      if (records.every((r) => isOurs(r.target))) return;
      queueRefresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'disabled'] });
    refresh();
  }

  function isOurs(node) {
    const elm = node && node.nodeType === 1 ? node : node && node.parentElement;
    return !!(elm && elm.closest && elm.closest('[data-ssv]'));
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function refresh() {
    const onWizard = dom.isWizardPath() && !!dom.getWizardRoot();
    if (!onWizard) {
      if (sidebar.isMounted()) {
        sidebar.unmount();
        state.lastApplied = null;
      }
      return;
    }
    if (!sidebar.isMounted()) sidebar.mount({ onAction });
    const ctx = dom.readContext();
    const changed = ['step', 'gameCode', 'jobType', 'gameName'].some((k) => ctx[k] !== state.ctx[k]);
    if (changed) {
      if (state.ctx.step === 2 && ctx.step !== 2) state.lastApplied = null;
      if (state.lastApplied && (ctx.gameCode !== state.ctx.gameCode || ctx.jobType !== state.ctx.jobType)) state.lastApplied = null;
      state.ctx = ctx;
    }
    pushState(!changed);
  }

  function pushState(quiet) {
    if (!sidebar.isMounted()) return;
    let liveDiff = null;
    if (state.ctx.step === 2 && state.lastApplied) {
      const form = dom.readForm();
      liveDiff = form ? P.diff(state.lastApplied.preset, form) : null;
    }
    sidebar.update({ ...state, liveDiff }, quiet);
  }

  /* ---------- Start-job gate ---------- */

  function onCaptureClick(e) {
    if (!state.settings.confirmEnabled) return;
    const target = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
    const btn = target && target.closest ? target.closest(dom.SEL.primaryButton) : null;
    if (!btn || btn.disabled || !dom.isStartJobButton(btn)) return;
    if (bypassNextClick) {
      bypassNextClick = false;
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    openConfirm(btn);
  }

  async function openConfirm(btn) {
    if (confirmOpen) return;
    confirmOpen = true;
    try {
      const form = dom.readForm() || { criteria: [] };
      const applied = state.lastApplied ? state.lastApplied.preset : null;
      const warns = P.warnings(form, state.settings, applied);
      const hasErrors = warns.some((w) => w.level === 'error');
      const hasWarns = warns.length > 0;
      const choice = await modal.show({
        title: 'Start this sift job?',
        wide: true,
        body: buildConfirmBody(form, warns, applied),
        dismissId: 'back',
        actions: [
          { id: 'back', label: 'Go back and edit', kind: 'secondary', autofocus: true },
          { id: 'start', label: hasErrors ? 'Start anyway' : hasWarns ? 'Start despite warnings' : 'Confirm and start job', kind: hasWarns ? 'danger' : 'primary' },
        ],
      });
      if (choice === 'start') {
        bypassNextClick = true;
        btn.click();
        // If the site's handler rejected synchronously nothing else to do; reset flag defensively.
        setTimeout(() => { bypassNextClick = false; }, 500);
      }
    } finally {
      confirmOpen = false;
    }
  }

  function buildConfirmBody(form, warns, applied) {
    const el = modal.el;
    const rows = P.describe(form);
    const warnByField = {};
    warns.forEach((w) => { (warnByField[w.field] = warnByField[w.field] || []).push(w); });

    const table = el('table', { class: 'ssv-table' }, [
      el('tbody', null, rows.map(([label, value, key]) => {
        const flagged = key && warnByField[key] && warnByField[key].length;
        return el('tr', { class: flagged ? 'ssv-table__row--flagged' : '' }, [
          el('th', { scope: 'row', text: label }),
          el('td', { text: value }),
        ]);
      })),
    ]);

    const parts = [];
    parts.push(el('p', { class: 'ssv-modal__lead' }, [
      'Review the settings the Sifter will use. ',
      applied ? el('span', null, ['Compared against preset ', el('strong', { text: applied.name }), '.']) : el('span', { text: 'No preset was applied to this form.' }),
    ]));
    parts.push(table);
    if (warns.length) {
      parts.push(el('ul', { class: 'ssv-warnings' }, warns.map((w) =>
        el('li', { class: 'ssv-warning ssv-warning--' + w.level }, [
          el('span', { class: 'ssv-warning__icon', 'aria-hidden': 'true', text: w.level === 'error' ? '✕' : '⚠' }),
          el('span', { text: w.text }),
        ])
      )));
    } else {
      parts.push(el('p', { class: 'ssv-ok', text: '✓ No problems detected.' }));
    }
    return el('div', null, parts);
  }

  /* ---------- sidebar actions ---------- */

  async function onAction(type, payload) {
    try {
      switch (type) {
        case 'apply': return await applyPreset(payload.id);
        case 'save-current': return await saveCurrent(payload.name);
        case 'overwrite': return await overwrite(payload.id);
        case 'rename': return await rename(payload.id, payload.name);
        case 'delete': return await remove(payload.id);
        case 'duplicate': return await duplicate(payload.id);
        case 'export': return exportPresets();
        case 'import': return await importPresets(payload.text);
        case 'set-setting': return await setSetting(payload.key, payload.value);
        case 'clear-applied': state.lastApplied = null; return pushState();
        case 'notify': return notify(payload.kind || 'info', payload.text);
        case 'refresh': return refresh();
        default: return;
      }
    } catch (e) {
      console.warn('[Sifter Saver]', e);
      notify('error', e.message || String(e));
    }
  }

  function notify(kind, text) {
    state.notice = text ? { kind, text, at: Date.now() } : null;
    pushState();
  }

  function findPreset(id) {
    const p = state.presets.find((x) => x.id === id);
    if (!p) throw new Error('Preset not found.');
    return p;
  }

  async function persist() {
    await storage.savePresets(state.presets);
    pushState();
  }

  async function applyPreset(id) {
    const preset = findPreset(id);
    if (state.busy) return;
    if (state.ctx.step !== 2 || !dom.getJobConfig()) {
      notify('warn', 'Go to the job setup step (after choosing game and job type) to apply a preset.');
      return;
    }
    if (!P.matchesContext(preset, state.ctx)) {
      const choice = await modal.show({
        title: 'Preset does not match this job',
        body: `"${preset.name}" was saved for ${preset.gameName || preset.gameCode || 'another game'} · ${C.JOB_TYPES[preset.jobType] || preset.jobType || 'another job type'}. The form is ${state.ctx.gameName || 'unknown game'} · ${C.JOB_TYPES[state.ctx.jobType] || state.ctx.jobType || 'unknown job type'}. Options that don't exist here will be skipped.`,
        dismissId: 'cancel',
        actions: [
          { id: 'cancel', label: 'Cancel', kind: 'secondary', autofocus: true },
          { id: 'apply', label: 'Apply anyway', kind: 'danger' },
        ],
      });
      if (choice !== 'apply') return;
    }
    state.busy = true;
    state.notice = { kind: 'info', text: `Applying "${preset.name}"…` };
    pushState();
    let report;
    try {
      report = await dom.applyPreset(preset, { onProgress: (f) => { state.notice = { kind: 'info', text: `Applying "${preset.name}"… (${f})` }; pushState(true); } });
    } finally {
      state.busy = false;
    }
    const form = dom.readForm();
    const differences = form ? P.diff(preset, form) : [];
    state.lastApplied = { preset, at: Date.now(), report, differences };
    if (report.failed.length || differences.length) {
      const bits = [];
      if (report.failed.length) bits.push(report.failed.map((f) => `${f.field}: ${f.reason}`).join('; '));
      if (differences.length) bits.push(differences.map((d) => `${d.label} is ${d.actual} (preset: ${d.expected})`).join('; '));
      notify('warn', `Applied with issues — ${bits.join(' — ')}`);
    } else {
      notify('ok', `Applied "${preset.name}". Review the form, then Start job.`);
    }
  }

  async function saveCurrent(name) {
    const form = dom.readForm();
    if (!form) throw new Error('Go to the job setup step to save the current form as a preset.');
    const preset = P.presetFromForm(form, (name || '').trim());
    state.presets.push(preset);
    await persist();
    state.lastApplied = { preset, at: Date.now(), report: { applied: [], failed: [] }, differences: [] };
    notify('ok', `Saved "${preset.name}".`);
  }

  async function overwrite(id) {
    const existing = findPreset(id);
    const form = dom.readForm();
    if (!form) throw new Error('Go to the job setup step to overwrite a preset with the current form.');
    const choice = await modal.show({
      title: `Overwrite "${existing.name}"?`,
      body: `The preset will be replaced with the current form values: ${P.summarize(P.presetFromForm(form, existing.name))}`,
      dismissId: 'cancel',
      actions: [
        { id: 'cancel', label: 'Cancel', kind: 'secondary', autofocus: true },
        { id: 'ok', label: 'Overwrite', kind: 'danger' },
      ],
    });
    if (choice !== 'ok') return;
    const fresh = P.presetFromForm(form, existing.name);
    Object.assign(existing, fresh, { id: existing.id, createdAt: existing.createdAt, name: existing.name });
    await persist();
    state.lastApplied = { preset: existing, at: Date.now(), report: { applied: [], failed: [] }, differences: [] };
    notify('ok', `Updated "${existing.name}".`);
  }

  async function rename(id, name) {
    const p = findPreset(id);
    const n = (name || '').trim();
    if (!n) throw new Error('Name cannot be empty.');
    p.name = n;
    p.updatedAt = new Date().toISOString();
    await persist();
  }

  async function remove(id) {
    const p = findPreset(id);
    const choice = await modal.show({
      title: `Delete "${p.name}"?`,
      body: 'This removes the saved preset. The form on the page is not changed.',
      dismissId: 'cancel',
      actions: [
        { id: 'cancel', label: 'Cancel', kind: 'secondary', autofocus: true },
        { id: 'ok', label: 'Delete', kind: 'danger' },
      ],
    });
    if (choice !== 'ok') return;
    state.presets = state.presets.filter((x) => x.id !== id);
    if (state.lastApplied && state.lastApplied.preset.id === id) state.lastApplied = null;
    await persist();
    notify('ok', `Deleted "${p.name}".`);
  }

  async function duplicate(id) {
    const p = findPreset(id);
    const copy = { ...p, id: storage.uuid(), name: p.name + ' (copy)', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.presets.splice(state.presets.indexOf(p) + 1, 0, copy);
    await persist();
  }

  function exportPresets() {
    const data = JSON.stringify({ sifterSaver: 1, exportedAt: new Date().toISOString(), presets: state.presets }, null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
    a.download = 'sifter-saver-presets.json';
    a.setAttribute('data-ssv', 'export');
    document.body.appendChild(a);
    a.click();
    a.remove();
    notify('ok', `Exported ${state.presets.length} preset${state.presets.length === 1 ? '' : 's'}.`);
  }

  async function importPresets(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      throw new Error('That file is not valid JSON.');
    }
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.presets) ? parsed.presets : null;
    if (!arr) throw new Error('No presets found in that file.');
    let added = 0;
    let updated = 0;
    for (const raw of arr) {
      const p = P.validateImported(raw);
      if (!p) continue;
      const idx = state.presets.findIndex((x) => x.id === p.id);
      if (idx >= 0) { state.presets[idx] = p; updated++; }
      else { state.presets.push(p); added++; }
    }
    await persist();
    notify('ok', `Imported ${added} new and updated ${updated} existing preset${added + updated === 1 ? '' : 's'}.`);
  }

  async function setSetting(key, value) {
    state.settings = { ...state.settings, [key]: value };
    await storage.saveSettings(state.settings);
    pushState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
