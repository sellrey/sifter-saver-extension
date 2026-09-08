/* Sifter Saver — pure functions over presets and form snapshots (no DOM). */
(function () {
  'use strict';
  const SS = (globalThis.SifterSaver = globalThis.SifterSaver || {});
  const C = SS.catalog;

  const money = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : '$' + Number(n).toFixed(2));
  const list = (a) => (Array.isArray(a) && a.length ? a.join(', ') : '—');
  const sameSet = (a, b) => {
    const A = new Set((a || []).map(C.normalize));
    const B = new Set((b || []).map(C.normalize));
    return A.size === B.size && [...A].every((x) => B.has(x));
  };
  const sameText = (a, b) => C.normalize(a || '') === C.normalize(b || '');

  const FIELD_LABELS = {
    jobType: 'Job type',
    game: 'Game',
    criteria: 'Sift criteria',
    priceThreshold: 'Price threshold',
    rarity: 'Rarity',
    color: 'Color / type',
    foil: 'Foil preference',
    matchMode: 'Match mode',
    condition: 'Condition',
    language: 'Language',
    foilFinish: 'Foil finish',
    bins: 'Bins',
    batchNameMode: 'Batch name',
  };

  function foilLabel(v) {
    return v === 'foil' ? 'Foil cards' : v === 'non-foil' ? 'Normal cards' : '—';
  }

  function criteriaLabel(id, gameCode) {
    return id === 'color' ? C.colorCardLabel(gameCode) : id.charAt(0).toUpperCase() + id.slice(1);
  }

  /** Build a preset object from a form snapshot. */
  function presetFromForm(form, name) {
    const now = new Date().toISOString();
    return {
      id: SS.storage.uuid(),
      name: name || defaultName(form),
      createdAt: now,
      updatedAt: now,
      jobType: form.jobType || null,
      gameCode: form.gameCode || null,
      gameName: form.gameName || C.gameName(form.gameCode),
      criteria: [...(form.criteria || [])],
      priceThreshold: form.priceThreshold == null ? null : Number(form.priceThreshold),
      rarity: [...(form.rarity || [])],
      color: [...(form.color || [])],
      foil: form.foil || null,
      matchMode: form.matchMode || null,
      condition: form.condition || null,
      language: form.language || null,
      foilFinish: form.foilFinish || null,
      bins: [...(form.bins || [])],
      batchNameMode: form.batchNameMode || null,
    };
  }

  function defaultName(form) {
    const bits = [];
    if (form.gameCode) bits.push(form.gameCode);
    if (form.jobType) bits.push(C.JOB_TYPES[form.jobType] || form.jobType);
    if ((form.criteria || []).includes('price') && form.priceThreshold != null) bits.push('≥ ' + money(form.priceThreshold));
    if (form.condition) bits.push(form.condition);
    return bits.join(' · ') || 'Untitled preset';
  }

  /** One-line description of the sift settings. */
  function summarize(p) {
    const parts = [];
    const crit = p.criteria || [];
    const joiner = crit.length >= 2 ? ` ${(p.matchMode || 'and').toUpperCase()} ` : '';
    const critParts = crit.map((id) => {
      if (id === 'price') return `Price ≥ ${money(p.priceThreshold)}`;
      if (id === 'rarity') return `Rarity: ${list(p.rarity)}`;
      if (id === 'color') return `${C.colorCardLabel(p.gameCode)}: ${list(p.color)}`;
      if (id === 'foil') return foilLabel(p.foil);
      return id;
    });
    if (critParts.length) parts.push(critParts.join(joiner));
    if (p.condition) parts.push(p.condition);
    if (p.foilFinish) parts.push(p.foilFinish);
    if (p.jobType && p.jobType !== 'sift-only' && p.bins && p.bins.length) parts.push('Bins ' + p.bins.join('/'));
    return parts.join(' · ') || 'No criteria';
  }

  /** Rows for the confirmation modal. */
  function describe(form) {
    const rows = [];
    const g = form.gameCode;
    rows.push([FIELD_LABELS.jobType, C.JOB_TYPES[form.jobType] || form.jobType || '—']);
    rows.push([FIELD_LABELS.game, form.gameName || C.gameName(g) || '—']);
    const crit = form.criteria || [];
    if (form.jobType !== 'scan-only') {
      rows.push([FIELD_LABELS.criteria, crit.length ? crit.map((c) => criteriaLabel(c, g)).join(', ') : 'None selected']);
      if (crit.includes('price')) rows.push([FIELD_LABELS.priceThreshold, form.priceThreshold == null ? 'Not set' : money(form.priceThreshold), 'price']);
      if (crit.includes('rarity')) rows.push([FIELD_LABELS.rarity, list(form.rarity)]);
      if (crit.includes('color')) rows.push([C.colorCardLabel(g), list(form.color)]);
      if (crit.includes('foil')) rows.push([FIELD_LABELS.foil, foilLabel(form.foil)]);
      if (crit.length >= 2) rows.push([FIELD_LABELS.matchMode, form.matchMode ? form.matchMode.toUpperCase() : 'Not set']);
    }
    const foilOnly = form.jobType === 'sift-only' && crit.length === 1 && crit[0] === 'foil';
    if (!foilOnly) {
      rows.push([FIELD_LABELS.condition, form.condition || 'Not set']);
      rows.push([FIELD_LABELS.language, form.language || 'English']);
      rows.push([FIELD_LABELS.foilFinish, form.foilFinish || 'Not set']);
    }
    if (form.jobType && form.jobType !== 'sift-only') {
      rows.push([FIELD_LABELS.bins, form.bins && form.bins.length ? form.bins.map((b) => 'Bin ' + b).join(', ') : 'None']);
      if (form.batchNameMode) rows.push([FIELD_LABELS.batchNameMode, form.batchNameMode === 'custom' ? 'Custom' : 'Default']);
    }
    return rows;
  }

  /** Field-by-field differences between a preset and the live form. */
  function diff(preset, form) {
    const out = [];
    const push = (field, expected, actual) => out.push({ field, label: FIELD_LABELS[field] || field, expected, actual });
    if (!preset || !form) return out;
    const crit = preset.criteria || [];
    if (!sameSet(crit, form.criteria)) push('criteria', crit.map((c) => criteriaLabel(c, preset.gameCode)).join(', ') || '—', (form.criteria || []).map((c) => criteriaLabel(c, form.gameCode)).join(', ') || '—');
    if (crit.includes('price') && Number(preset.priceThreshold) !== Number(form.priceThreshold)) push('priceThreshold', money(preset.priceThreshold), money(form.priceThreshold));
    if (crit.includes('rarity') && !sameSet(preset.rarity, form.rarity)) push('rarity', list(preset.rarity), list(form.rarity));
    if (crit.includes('color') && !sameSet(preset.color, form.color)) push('color', list(preset.color), list(form.color));
    if (crit.includes('foil') && (preset.foil || null) !== (form.foil || null) && !(crit.length === 1 && preset.jobType === 'sift-only')) push('foil', foilLabel(preset.foil), foilLabel(form.foil));
    if (crit.length >= 2 && preset.matchMode && (preset.matchMode || null) !== (form.matchMode || null)) push('matchMode', preset.matchMode.toUpperCase(), form.matchMode ? form.matchMode.toUpperCase() : '—');
    const foilOnly = preset.jobType === 'sift-only' && crit.length === 1 && crit[0] === 'foil';
    if (!foilOnly) {
      if (preset.condition && !sameText(preset.condition, form.condition)) push('condition', preset.condition, form.condition || '—');
      if (preset.foilFinish && !sameText(preset.foilFinish, form.foilFinish)) push('foilFinish', preset.foilFinish, form.foilFinish || '—');
    }
    if (preset.jobType && preset.jobType !== 'sift-only' && preset.bins && preset.bins.length && !sameSet(preset.bins.map(String), (form.bins || []).map(String))) push('bins', preset.bins.join(', '), (form.bins || []).join(', ') || '—');
    return out;
  }

  /** Soft warnings shown in the confirmation modal. */
  function warnings(form, settings, appliedPreset) {
    const out = [];
    const crit = form.criteria || [];
    const limit = Number(settings && settings.warnPriceAbove);
    if (crit.includes('price')) {
      const p = form.priceThreshold;
      if (p == null || p <= 0) {
        out.push({ level: 'error', field: 'price', text: 'Price criterion is selected but no threshold is entered.' });
      } else if (Number.isFinite(limit) && limit > 0 && p >= limit) {
        const guess = p / 100;
        const hint = Number.isInteger(p) && guess >= 0.01 ? ` Did you mean ${money(guess)}?` : '';
        out.push({ level: 'warn', field: 'price', text: `Price threshold ${money(p)} is at or above your warning limit of ${money(limit)}.${hint}` });
      }
      if (form.condition && form.gameCode && !C.priceSiftConditions(form.gameCode).map(C.normalize).includes(C.normalize(form.condition))) {
        out.push({ level: 'error', field: 'condition', text: `Price sift for this game only supports ${C.priceSiftConditions(form.gameCode).join(', ')} — "${form.condition}" is selected.` });
      }
    }
    if (form.jobType !== 'scan-only' && crit.length === 0) out.push({ level: 'error', field: 'criteria', text: 'No sift criteria selected.' });
    if (crit.includes('rarity') && !(form.rarity || []).length) out.push({ level: 'error', field: 'rarity', text: 'Rarity criterion is selected but no rarity is chosen.' });
    if (crit.includes('color') && !(form.color || []).length) out.push({ level: 'error', field: 'color', text: `${C.colorCardLabel(form.gameCode)} criterion is selected but nothing is chosen.` });
    if (crit.includes('foil') && !form.foil && !(crit.length === 1 && form.jobType === 'sift-only')) out.push({ level: 'error', field: 'foil', text: 'Foil criterion is selected but no foil option is chosen.' });
    if (crit.length >= 2 && !form.matchMode) out.push({ level: 'error', field: 'matchMode', text: 'Two or more criteria are selected but AND/OR is not chosen.' });
    if (form.validationMessage) out.push({ level: 'error', field: 'form', text: `Site says: ${form.validationMessage}` });
    if (appliedPreset) {
      for (const d of diff(appliedPreset, form)) {
        out.push({ level: 'warn', field: d.field, text: `${d.label} differs from preset "${appliedPreset.name}": preset has ${d.expected}, form has ${d.actual}.` });
      }
    }
    return out;
  }

  function matchesContext(preset, ctx) {
    if (!ctx) return true;
    const gameOk = !preset.gameCode || !ctx.gameCode || preset.gameCode === ctx.gameCode;
    const jobOk = !preset.jobType || !ctx.jobType || preset.jobType === ctx.jobType;
    return gameOk && jobOk;
  }

  function validateImported(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const p = presetFromForm(obj, obj.name);
    if (obj.id) p.id = String(obj.id);
    if (obj.createdAt) p.createdAt = obj.createdAt;
    if (!p.gameCode && obj.gameName) p.gameCode = C.gameCodeFromName(obj.gameName);
    return p;
  }

  SS.presets = { FIELD_LABELS, presetFromForm, defaultName, summarize, describe, diff, warnings, matchesContext, validateImported, money, foilLabel, criteriaLabel };
})();
