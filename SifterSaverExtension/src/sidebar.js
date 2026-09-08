/* Sifter Saver — right-hand sidebar listing saved presets. */
(function () {
  'use strict';
  const SS = (globalThis.SifterSaver = globalThis.SifterSaver || {});
  const C = SS.catalog;
  const P = SS.presets;

  let root = null;
  let panel = null;
  let onAction = () => {};
  let last = null; // last state passed to update()
  const ui = { editing: null, settingsOpen: false }; // editing: { mode: 'new'|'rename', id, name }
  let lastHtml = '';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mount(opts) {
    if (root) return;
    onAction = (opts && opts.onAction) || onAction;
    root = document.createElement('div');
    root.className = 'ssv-root';
    root.setAttribute('data-ssv', 'sidebar');
    panel = document.createElement('aside');
    panel.className = 'ssv-sidebar';
    panel.setAttribute('aria-label', 'Sifter Saver presets');
    root.appendChild(panel);
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('toggle', onToggle, true);
    if (last) render();
  }

  function unmount() {
    if (!root) return;
    root.remove();
    root = null;
    panel = null;
    ui.editing = null;
    lastHtml = '';
    document.documentElement.classList.remove('ssv-open');
  }

  function isMounted() {
    return !!root;
  }

  function update(state, quiet) {
    last = state;
    if (!root) return;
    const typing = ui.editing && panel.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (quiet && typing) return;
    render();
  }

  /* ---------- rendering ---------- */

  function ctxLabel(ctx) {
    if (!ctx || ctx.step == null) return 'Sifter job wizard';
    const bits = [];
    if (ctx.gameName) bits.push(ctx.gameName);
    if (ctx.jobType) bits.push(C.JOB_TYPES[ctx.jobType] || ctx.jobType);
    const stepName = ctx.step === 0 ? 'Choose a Sifter' : ctx.step === 1 ? 'Choose game and job type' : 'Job setup';
    return (bits.length ? bits.join(' · ') + ' — ' : '') + stepName;
  }

  function render() {
    const s = last;
    const settings = s.settings || {};
    const collapsed = !!settings.sidebarCollapsed;
    document.documentElement.classList.toggle('ssv-open', !collapsed);
    root.classList.toggle('ssv-root--collapsed', collapsed);

    if (collapsed) {
      setHtml(`
        <button type="button" class="ssv-tab" data-action="set-setting" data-key="sidebarCollapsed" data-value="false" title="Show Sifter Saver">
          <span class="ssv-tab__label">Sifter Saver</span>
          <span class="ssv-tab__count">${s.presets.length}</span>
        </button>`);
      return;
    }

    const ctx = s.ctx || {};
    const onSetup = ctx.step === 2;
    const visible = settings.showAllPresets ? s.presets : s.presets.filter((p) => P.matchesContext(p, ctx));
    const hiddenCount = s.presets.length - visible.length;

    const notice = s.notice
      ? `<div class="ssv-notice ssv-notice--${esc(s.notice.kind)}" role="status">
           <span>${esc(s.notice.text)}</span>
           <button type="button" class="ssv-iconbtn" data-action="dismiss-notice" aria-label="Dismiss">×</button>
         </div>`
      : '';

    const editNew = ui.editing && ui.editing.mode === 'new'
      ? `<form class="ssv-inline" data-form="new">
           <label class="ssv-label" for="ssv-new-name">Preset name</label>
           <input id="ssv-new-name" class="ssv-input" name="name" value="${esc(ui.editing.name)}" maxlength="80" autocomplete="off" />
           <div class="ssv-inline__actions">
             <button type="submit" class="ssv-btn ssv-btn--primary ssv-btn--sm">Save</button>
             <button type="button" class="ssv-btn ssv-btn--secondary ssv-btn--sm" data-action="cancel-edit">Cancel</button>
           </div>
         </form>`
      : '';

    const applied = s.lastApplied;
    const items = visible.map((p) => {
      const isApplied = applied && applied.preset.id === p.id;
      const mismatch = ctx.gameCode && p.gameCode && p.gameCode !== ctx.gameCode || ctx.jobType && p.jobType && p.jobType !== ctx.jobType;
      let status = '';
      if (isApplied) {
        const diffs = Array.isArray(s.liveDiff) ? s.liveDiff : applied.differences || [];
        const failed = (applied.report && applied.report.failed) || [];
        status = diffs.length || failed.length
          ? `<div class="ssv-status ssv-status--warn">⚠ Applied — form differs (${diffs.map((d) => esc(d.label)).concat(failed.map((f) => esc(f.field))).join(', ')})</div>`
          : `<div class="ssv-status ssv-status--ok">✓ Applied — form matches this preset</div>`;
      }
      const renaming = ui.editing && ui.editing.mode === 'rename' && ui.editing.id === p.id;
      const nameBlock = renaming
        ? `<form class="ssv-inline" data-form="rename" data-id="${esc(p.id)}">
             <input class="ssv-input" name="name" value="${esc(ui.editing.name)}" maxlength="80" autocomplete="off" aria-label="New name" />
             <div class="ssv-inline__actions">
               <button type="submit" class="ssv-btn ssv-btn--primary ssv-btn--sm">Rename</button>
               <button type="button" class="ssv-btn ssv-btn--secondary ssv-btn--sm" data-action="cancel-edit">Cancel</button>
             </div>
           </form>`
        : `<div class="ssv-preset__name">${esc(p.name)}</div>`;
      return `
        <li class="ssv-preset${isApplied ? ' ssv-preset--applied' : ''}${mismatch ? ' ssv-preset--mismatch' : ''}" data-id="${esc(p.id)}">
          ${nameBlock}
          <div class="ssv-preset__meta">${esc(p.gameName || C.gameName(p.gameCode) || 'Any game')} · ${esc(C.JOB_TYPES[p.jobType] || p.jobType || 'Any job type')}${mismatch ? ' · <span class="ssv-chip ssv-chip--warn">different game/job</span>' : ''}</div>
          <div class="ssv-preset__summary">${esc(P.summarize(p))}</div>
          ${status}
          <div class="ssv-preset__actions">
            <button type="button" class="ssv-btn ssv-btn--primary ssv-btn--sm" data-action="apply" data-id="${esc(p.id)}" ${onSetup && !s.busy ? '' : 'disabled'} title="${onSetup ? 'Fill the form with this preset' : 'Available on the job setup step'}">Apply</button>
            <button type="button" class="ssv-btn ssv-btn--ghost ssv-btn--sm" data-action="overwrite" data-id="${esc(p.id)}" ${onSetup && !s.busy ? '' : 'disabled'} title="Replace this preset with the current form">Overwrite</button>
            <button type="button" class="ssv-btn ssv-btn--ghost ssv-btn--sm" data-action="rename" data-id="${esc(p.id)}">Rename</button>
            <button type="button" class="ssv-btn ssv-btn--ghost ssv-btn--sm" data-action="duplicate" data-id="${esc(p.id)}">Duplicate</button>
            <button type="button" class="ssv-btn ssv-btn--ghost ssv-btn--sm ssv-btn--danger-text" data-action="delete" data-id="${esc(p.id)}">Delete</button>
          </div>
        </li>`;
    }).join('');

    setHtml(`
      <header class="ssv-header">
        <div class="ssv-header__title">
          <span class="ssv-logo" aria-hidden="true"></span>
          <h2>Sifter Saver</h2>
        </div>
        <button type="button" class="ssv-iconbtn" data-action="set-setting" data-key="sidebarCollapsed" data-value="true" aria-label="Collapse sidebar" title="Collapse">›</button>
      </header>
      <div class="ssv-context" title="Detected from the page">${esc(ctxLabel(ctx))}</div>
      ${notice}
      <section class="ssv-section">
        <button type="button" class="ssv-btn ssv-btn--primary ssv-btn--block" data-action="new" ${onSetup && !ui.editing ? '' : 'disabled'} title="${onSetup ? 'Save the values currently entered in the form' : 'Fill in the job setup step first'}">Save current form as preset</button>
        ${!onSetup ? '<p class="ssv-hint">Choose a Sifter, game and job type. Presets can be saved and applied on the job setup step.</p>' : ''}
        ${editNew}
      </section>
      <section class="ssv-section">
        <div class="ssv-section__head">
          <h3>Presets <span class="ssv-count">${visible.length}</span></h3>
          <label class="ssv-check"><input type="checkbox" data-setting="showAllPresets" ${settings.showAllPresets ? 'checked' : ''}/> Show all${hiddenCount > 0 && !settings.showAllPresets ? ` (${hiddenCount} hidden)` : ''}</label>
        </div>
        ${visible.length ? `<ul class="ssv-presets">${items}</ul>` : `<p class="ssv-empty">${s.presets.length ? 'No presets for this game and job type. Tick "Show all" to see the rest.' : 'No presets yet. Fill in the sift preferences, then save them here.'}</p>`}
      </section>
      <details class="ssv-section ssv-settings"${ui.settingsOpen ? ' open' : ''}>
        <summary>Settings &amp; backup</summary>
        <label class="ssv-check"><input type="checkbox" data-setting="confirmEnabled" ${settings.confirmEnabled ? 'checked' : ''}/> Confirm settings before <strong>Start job</strong></label>
        <label class="ssv-field">
          <span>Warn when price threshold is at or above ($)</span>
          <input type="number" class="ssv-input ssv-input--sm" min="0" step="0.01" data-setting="warnPriceAbove" value="${esc(settings.warnPriceAbove)}" />
        </label>
        <div class="ssv-row">
          <button type="button" class="ssv-btn ssv-btn--secondary ssv-btn--sm" data-action="export" ${s.presets.length ? '' : 'disabled'}>Export JSON</button>
          <label class="ssv-btn ssv-btn--secondary ssv-btn--sm ssv-filebtn">Import JSON<input type="file" accept="application/json,.json" data-file="import" hidden /></label>
        </div>
        <p class="ssv-hint">Presets are stored in this browser profile only. Export to share them with another machine or browser.</p>
      </details>
      <footer class="ssv-footer">Sifter Saver v${esc(version())}</footer>`);

    if (ui.editing) {
      const input = panel.querySelector('form[data-form] input[name="name"]');
      if (input && document.activeElement !== input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  /** Only touch the DOM when the markup actually changed, so focus/hover/scroll survive page mutations. */
  function setHtml(html) {
    if (html === lastHtml) return;
    lastHtml = html;
    panel.innerHTML = html;
  }

  function version() {
    try {
      const api = globalThis.browser || globalThis.chrome;
      return api.runtime.getManifest().version;
    } catch (_) {
      return 'dev';
    }
  }

  /* ---------- events ---------- */

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || !root.contains(btn)) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    switch (action) {
      case 'set-setting': {
        const key = btn.getAttribute('data-key');
        const raw = btn.getAttribute('data-value');
        onAction('set-setting', { key, value: raw === 'true' ? true : raw === 'false' ? false : raw });
        return;
      }
      case 'dismiss-notice':
        if (last) last.notice = null;
        render();
        return;
      case 'new': {
        let suggested = '';
        try {
          const form = SS.dom.readForm();
          suggested = form ? P.defaultName(form) : '';
        } catch (_) { /* ignore */ }
        ui.editing = { mode: 'new', name: suggested };
        render();
        return;
      }
      case 'rename': {
        const p = (last.presets || []).find((x) => x.id === id);
        ui.editing = { mode: 'rename', id, name: p ? p.name : '' };
        render();
        return;
      }
      case 'cancel-edit':
        ui.editing = null;
        render();
        return;
      case 'apply':
      case 'overwrite':
      case 'delete':
      case 'duplicate':
        onAction(action, { id });
        return;
      case 'export':
        onAction('export', {});
        return;
      default:
        return;
    }
  }

  function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const name = form.querySelector('input[name="name"]').value;
    const kind = form.getAttribute('data-form');
    ui.editing = null;
    if (kind === 'new') onAction('save-current', { name });
    else onAction('rename', { id: form.getAttribute('data-id'), name });
  }

  function onToggle(e) {
    if (e.target && e.target.matches && e.target.matches('details.ssv-settings')) {
      ui.settingsOpen = e.target.open;
      lastHtml = lastHtml.replace('<details class="ssv-section ssv-settings" open>', '<details class="ssv-section ssv-settings">');
      if (ui.settingsOpen) lastHtml = lastHtml.replace('<details class="ssv-section ssv-settings">', '<details class="ssv-section ssv-settings" open>');
    }
  }

  function onInput(e) {
    const input = e.target;
    if (ui.editing && input.name === 'name') ui.editing.name = input.value;
  }

  function onChange(e) {
    const el = e.target;
    if (el.dataset && el.dataset.setting) {
      const key = el.dataset.setting;
      let value = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') {
        value = Number(value);
        if (!Number.isFinite(value) || value < 0) value = 0;
      }
      onAction('set-setting', { key, value });
      return;
    }
    if (el.dataset && el.dataset.file === 'import' && el.files && el.files[0]) {
      const file = el.files[0];
      file.text().then((text) => onAction('import', { text })).catch((err) => onAction('notify', { kind: 'error', text: err.message }));
      el.value = '';
    }
  }

  SS.sidebar = { mount, unmount, isMounted, update };
})();
