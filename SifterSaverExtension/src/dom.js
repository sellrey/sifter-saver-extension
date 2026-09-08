/* Sifter Saver — site adapter for the Seller Portal "Roca Sifter" job wizard.
 *
 * Everything that touches the page DOM lives here. Selectors are derived from
 * the quicklist bundle's render functions (JobConfig, SifterJobView,
 * TcgInputSelect, TcgBaseDropdown, TcgInputRadio, CurrencyInput). */
(function () {
  'use strict';
  const SS = (globalThis.SifterSaver = globalThis.SifterSaver || {});
  const C = SS.catalog;

  const SEL = {
    wizard: '.sellerportal-sifter-job',
    wizardContent: '.sellerportal-sifter-job__content',
    primaryButton: '.sellerportal-sifter-job__footer-primary',
    validationMessage: '.sellerportal-sifter-job__validation-message',
    jobConfig: '.job-config',
    jobTitle: '.job-config__title',
    criteriaCard: '.job-config__criteria-card',
    priceInput: '.job-config .currency-input__input',
    criteriaSelect: '.job-config .tcg-input.job-config__criteria-input',
    conditionSelect: '.job-config .tcg-input.job-config__condition-select',
    languageSelect: '.job-config .tcg-input.job-config__language-select',
    foilFinishSelect: '.job-config .tcg-input.job-config__foil-finish-select',
    foilRadio: '.job-config input[name="foil-options"]',
    matchModeRadio: '.job-config input[name="match-mode"]',
    batchModeRadio: '.job-config input[name="batch-name-mode"]',
    binCheckbox: '.job-config .tcg-input-checkbox',
    summary: '.job-summary',
    gameStep: '.select-game-and-job-type',
    gameStepSelectTrigger: '.select-game-and-job-type .tcg-input-select__trigger span',
    gameStepCard: '.select-game-and-job-type__card',
    dropdownItem: 'li.tcg-base-dropdown__item',
    selectLabel: '.tcg-input-field__label span',
    selectTrigger: '.tcg-input-select__trigger',
  };

  const WIZARD_PATHS = [
    /^\/scan-identify\/sifter\/newjob\/?$/,
    /^\/scan-identify\/sifter-job\/?$/,
    /^\/quicklist\/sifter\/newjob\/?$/,
    /^\/quicklist\/sifter-job\/?$/,
  ];

  function isWizardPath(pathname) {
    const p = pathname || location.pathname;
    return WIZARD_PATHS.some((re) => re.test(p));
  }

  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function getWizardRoot() {
    return $(SEL.wizard);
  }

  function getJobConfig() {
    return $(SEL.jobConfig);
  }

  function getPrimaryButton() {
    const el = $(SEL.primaryButton);
    if (!el) return null;
    return el.tagName === 'BUTTON' ? el : el.querySelector('button') || el;
  }

  function isStartJobButton(el) {
    return !!el && /^start job$/i.test(text(el));
  }

  function getStep() {
    if (!getWizardRoot()) return null;
    if (getJobConfig()) return 2;
    if ($(SEL.gameStep)) return 1;
    return 0;
  }

  /* ---------- select helpers ---------- */

  function selectLabel(root) {
    return text($(SEL.selectLabel, root));
  }

  function findCriteriaSelect(labelPredicate) {
    return $$(SEL.criteriaSelect).find((root) => labelPredicate(selectLabel(root))) || null;
  }

  function readSelect(root) {
    if (!root) return [];
    const items = $$(SEL.dropdownItem, root);
    if (items.length) {
      return items.filter((li) => li.classList.contains('is-selected')).map((li) => li.getAttribute('aria-label') || text(li));
    }
    const trig = $(SEL.selectTrigger + ' span', root);
    const t = text(trig);
    return t && t !== 'Select' ? t.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }

  function selectOptionNames(root) {
    return $$(SEL.dropdownItem, root).map((li) => li.getAttribute('aria-label') || text(li));
  }

  async function setSelect(root, labels, { multiple }) {
    const wanted = new Set((labels || []).map(C.normalize));
    const items = $$(SEL.dropdownItem, root);
    if (!items.length) throw new Error('no options rendered');
    const missing = [...wanted].filter((w) => !items.some((li) => C.normalize(li.getAttribute('aria-label') || text(li)) === w));
    if (multiple) {
      for (const li of items) {
        const isSel = li.classList.contains('is-selected');
        const want = wanted.has(C.normalize(li.getAttribute('aria-label') || text(li)));
        if (isSel !== want) {
          li.click();
          await tick();
        }
      }
    } else {
      const target = items.find((li) => wanted.has(C.normalize(li.getAttribute('aria-label') || text(li))));
      if (target && !target.classList.contains('is-selected')) {
        target.click();
        await tick();
      }
    }
    return missing;
  }

  /* ---------- generic helpers ---------- */

  function tick(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms == null ? 40 : ms));
  }

  async function waitFor(fn, timeoutMs, label) {
    const start = Date.now();
    const limit = timeoutMs == null ? 4000 : timeoutMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - start > limit) throw new Error(`timed out waiting for ${label || 'element'}`);
      await tick(60);
    }
  }

  function setTextValue(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
  }

  function clickRadio(inputs, value) {
    const el = inputs.find((i) => i.value === value);
    if (!el) return false;
    if (!el.checked) el.click();
    return true;
  }

  function parsePrice(v) {
    if (v == null) return null;
    const n = Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && String(v).trim() !== '' ? Math.round(n * 100) / 100 : null;
  }

  /* ---------- reading ---------- */

  function readGameFromSummary() {
    const summary = $(SEL.summary);
    if (!summary) return null;
    const sections = $$('.job-summary__section', summary);
    const ident = sections.find((s) => /^identification$/i.test(text(s.querySelector('h3, h2')))) || sections[sections.length - 1];
    if (!ident) return null;
    const p = ident.querySelector('.job-summary__rows p, p');
    return text(p) || null;
  }

  function readGameFromStep1() {
    const t = text($(SEL.gameStepSelectTrigger));
    return t && t !== 'Select' ? t : null;
  }

  function readJobTypeFromStep1() {
    const card = $$(SEL.gameStepCard).find((b) => b.getAttribute('aria-pressed') === 'true' || b.classList.contains('is-selected'));
    if (!card) return null;
    const label = card.getAttribute('aria-label') || text(card);
    const hit = Object.entries(C.JOB_TYPES).find(([, name]) => C.normalize(name) === C.normalize(label));
    return hit ? hit[0] : null;
  }

  /** Read the game and job type visible on whichever step is showing. */
  function readContext() {
    const step = getStep();
    let gameName = null;
    let jobType = null;
    if (step === 2) {
      gameName = readGameFromSummary();
      jobType = C.jobTypeFromTitle(text($(SEL.jobTitle)));
    } else if (step === 1) {
      gameName = readGameFromStep1();
      jobType = readJobTypeFromStep1();
    }
    const gameCode = C.gameCodeFromName(gameName);
    return { step, gameName, gameCode, jobType };
  }

  /** Snapshot of the job-config form as a preset-shaped object, or null. */
  function readForm() {
    const cfg = getJobConfig();
    if (!cfg) return null;
    const ctx = readContext();
    const gameCode = ctx.gameCode;

    const criteria = $$(SEL.criteriaCard, cfg)
      .filter((b) => b.getAttribute('aria-pressed') === 'true' || b.classList.contains('job-config__criteria-card--selected'))
      .map((b) => C.criterionIdFromLabel(text(b.querySelector('p')) || text(b)));

    const priceInput = $(SEL.priceInput);
    const priceThreshold = priceInput ? parsePrice(priceInput.value) : null;

    const raritySel = findCriteriaSelect((l) => /^rarity$/i.test(l));
    const colorSel = findCriteriaSelect((l) => !/^rarity$/i.test(l));

    let foil = null;
    const foilInputs = $$(SEL.foilRadio);
    if (foilInputs.length) {
      const checked = foilInputs.find((i) => i.checked);
      foil = checked ? checked.value : null;
    } else if (criteria.length === 1 && criteria[0] === 'foil' && ctx.jobType === 'sift-only') {
      foil = 'foil'; // site: "Bin 1 will include foil cards."
    }

    const mm = $$(SEL.matchModeRadio).find((i) => i.checked);
    const bins = $$(SEL.binCheckbox)
      .filter((box) => {
        const input = box.querySelector('input');
        return input && input.checked;
      })
      .map((box) => {
        const m = /bin\s*(\d)/i.exec(text(box));
        return m ? Number(m[1]) : null;
      })
      .filter((n) => n != null);
    const bm = $$(SEL.batchModeRadio).find((i) => i.checked);

    const validationEl = $(SEL.validationMessage);
    const validationMessage =
      validationEl && !validationEl.classList.contains('sellerportal-sifter-job__validation-message--hidden') ? text(validationEl) : '';

    return {
      jobType: ctx.jobType,
      gameCode,
      gameName: ctx.gameName,
      criteria,
      priceThreshold: criteria.includes('price') ? priceThreshold : null,
      rarity: criteria.includes('rarity') ? readSelect(raritySel) : [],
      color: criteria.includes('color') ? readSelect(colorSel) : [],
      foil: criteria.includes('foil') ? foil : null,
      matchMode: mm ? mm.value : null,
      condition: readSelect($(SEL.conditionSelect))[0] || null,
      language: readSelect($(SEL.languageSelect))[0] || null,
      foilFinish: readSelect($(SEL.foilFinishSelect))[0] || null,
      bins,
      batchNameMode: bm ? bm.value : null,
      validationMessage,
      startDisabled: !!(getPrimaryButton() && getPrimaryButton().disabled),
    };
  }

  /* ---------- applying ---------- */

  /**
   * Drive the form to match `preset`. Resolves to { applied: string[], failed: {field, reason}[] }.
   * Never throws for a field-level problem; only if the form isn't on screen.
   */
  async function applyPreset(preset, opts) {
    const report = { applied: [], failed: [] };
    const progress = (opts && opts.onProgress) || (() => {});
    const fail = (field, reason) => report.failed.push({ field, reason });
    const ok = (field) => report.applied.push(field);

    const cfg = getJobConfig();
    if (!cfg) throw new Error('The job setup step is not on screen.');

    // 1. Criteria cards — deselect unwanted first so the site clears their values.
    progress('criteria');
    const wanted = new Set(preset.criteria || []);
    const cards = $$(SEL.criteriaCard, cfg).map((b) => ({ el: b, id: C.criterionIdFromLabel(text(b.querySelector('p')) || text(b)) }));
    const pressed = (b) => b.getAttribute('aria-pressed') === 'true' || b.classList.contains('job-config__criteria-card--selected');
    for (const c of cards) if (pressed(c.el) && !wanted.has(c.id)) { c.el.click(); await tick(); }
    for (const c of cards) if (!pressed(c.el) && wanted.has(c.id)) { c.el.click(); await tick(); }
    const missingCriteria = [...wanted].filter((id) => !cards.some((c) => c.id === id));
    if (missingCriteria.length) fail('criteria', `not available for this game: ${missingCriteria.join(', ')}`);
    else ok('criteria');
    await tick(80);

    // 2. Price
    if (wanted.has('price')) {
      progress('price');
      try {
        const input = await waitFor(() => $(SEL.priceInput), 3000, 'price input');
        const v = preset.priceThreshold;
        setTextValue(input, v == null ? '' : Number(v).toFixed(2));
        await tick();
        ok('price');
      } catch (e) {
        fail('price', e.message);
      }
    }

    // 3. Rarity
    if (wanted.has('rarity')) {
      progress('rarity');
      try {
        const root = await waitFor(() => findCriteriaSelect((l) => /^rarity$/i.test(l)), 3000, 'rarity select');
        const missing = await setSelect(root, preset.rarity || [], { multiple: true });
        if (missing.length) fail('rarity', `options not found: ${missing.join(', ')}`);
        else ok('rarity');
      } catch (e) {
        fail('rarity', e.message);
      }
    }

    // 4. Color / energy / ink
    if (wanted.has('color')) {
      progress('color');
      try {
        const root = await waitFor(() => findCriteriaSelect((l) => !/^rarity$/i.test(l)), 3000, 'color select');
        const missing = await setSelect(root, preset.color || [], { multiple: true });
        if (missing.length) fail('color', `options not found: ${missing.join(', ')}`);
        else ok('color');
      } catch (e) {
        fail('color', e.message);
      }
    }

    // 5. Foil preference
    if (wanted.has('foil')) {
      progress('foil');
      await tick();
      const radios = $$(SEL.foilRadio);
      if (radios.length) {
        if (preset.foil && clickRadio(radios, preset.foil)) ok('foil');
        else if (preset.foil) fail('foil', `no option "${preset.foil}"`);
        // preset without a foil choice: leave as is
      } else {
        ok('foil'); // foil-only sift: site fixes it to "foil cards"
      }
      await tick();
    }

    // 6. Match mode
    if (wanted.size >= 2) {
      progress('matchMode');
      try {
        const radios = await waitFor(() => { const r = $$(SEL.matchModeRadio); return r.length ? r : null; }, 3000, 'match mode');
        if (preset.matchMode) {
          if (clickRadio(radios, preset.matchMode)) ok('matchMode');
          else fail('matchMode', `no option "${preset.matchMode}"`);
        }
        await tick();
      } catch (e) {
        fail('matchMode', e.message);
      }
    }

    // 7. Condition (waits for the catalog data to load)
    if (preset.condition && !(preset.jobType === 'sift-only' && wanted.size === 1 && wanted.has('foil'))) {
      progress('condition');
      try {
        const root = await waitFor(() => { const r = $(SEL.conditionSelect); return r && $(SEL.dropdownItem, r) ? r : null; }, 8000, 'condition select');
        const missing = await setSelect(root, [preset.condition], { multiple: false });
        if (missing.length) fail('condition', `option not found: ${preset.condition}`);
        else ok('condition');
      } catch (e) {
        fail('condition', e.message);
      }
    }

    // 8. Foil finish
    if (preset.foilFinish) {
      progress('foilFinish');
      try {
        const root = await waitFor(() => { const r = $(SEL.foilFinishSelect); return r && $(SEL.dropdownItem, r) ? r : null; }, 8000, 'foil finish select');
        const missing = await setSelect(root, [preset.foilFinish], { multiple: false });
        if (missing.length) fail('foilFinish', `option not found: ${preset.foilFinish}`);
        else ok('foilFinish');
      } catch (e) {
        fail('foilFinish', e.message);
      }
    }

    // 9. Bins + batch name mode (scan jobs only; the section is absent for sift-only)
    if (Array.isArray(preset.bins) && preset.bins.length) {
      const boxes = $$(SEL.binCheckbox);
      if (boxes.length) {
        progress('bins');
        for (const box of boxes) {
          const m = /bin\s*(\d)/i.exec(text(box));
          const input = box.querySelector('input');
          if (!m || !input) continue;
          const want = preset.bins.includes(Number(m[1]));
          if (input.checked !== want) { input.click(); await tick(); }
        }
        ok('bins');
      }
    }
    if (preset.batchNameMode) {
      const radios = $$(SEL.batchModeRadio);
      if (radios.length && clickRadio(radios, preset.batchNameMode)) ok('batchNameMode');
    }

    await tick(120);
    return report;
  }

  SS.dom = {
    SEL, isWizardPath, getWizardRoot, getJobConfig, getPrimaryButton, isStartJobButton, getStep,
    readContext, readForm, applyPreset, selectOptionNames, tick, waitFor, text,
  };
})();
