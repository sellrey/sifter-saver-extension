/* Sifter Saver — minimal accessible dialog used for the Start-job gate and
 * for destructive confirmations in the sidebar. */
(function () {
  'use strict';
  const SS = (globalThis.SifterSaver = globalThis.SifterSaver || {});

  let current = null;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v != null) node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /**
   * show({ title, body, actions:[{id,label,kind,autofocus}], dismissId, wide })
   * Resolves with the id of the chosen action ("dismissId" on Escape/backdrop).
   */
  function show(opts) {
    if (current) current.close(opts.dismissId || 'dismiss');
    return new Promise((resolve) => {
      const previouslyFocused = document.activeElement;
      const actions = opts.actions || [{ id: 'ok', label: 'OK', kind: 'primary' }];
      const dismissId = opts.dismissId || actions[0].id;

      const titleId = 'ssv-modal-title-' + Date.now();
      const buttons = actions.map((a) =>
        el('button', {
          type: 'button',
          class: 'ssv-btn ' + (a.kind === 'primary' ? 'ssv-btn--primary' : a.kind === 'danger' ? 'ssv-btn--danger' : 'ssv-btn--secondary'),
          'data-action': a.id,
          onclick: () => close(a.id),
        }, [a.label])
      );

      const bodyNode = typeof opts.body === 'string' ? el('div', { class: 'ssv-modal__body' }) : el('div', { class: 'ssv-modal__body' }, [opts.body]);
      if (typeof opts.body === 'string') bodyNode.textContent = opts.body;

      const dialog = el('div', { class: 'ssv-modal' + (opts.wide ? ' ssv-modal--wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
        el('div', { class: 'ssv-modal__header' }, [
          el('h2', { class: 'ssv-modal__title', id: titleId, text: opts.title || '' }),
        ]),
        bodyNode,
        el('div', { class: 'ssv-modal__actions' }, buttons),
      ]);
      const overlay = el('div', { class: 'ssv-overlay', 'data-ssv': 'modal' }, [dialog]);
      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) close(dismissId);
      });

      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close(dismissId);
        } else if (e.key === 'Tab') {
          const focusables = Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((f) => !f.disabled);
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);

      function close(id) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        current = null;
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          try { previouslyFocused.focus(); } catch (_) { /* ignore */ }
        }
        resolve(id);
      }

      current = { close };
      document.body.appendChild(overlay);
      const auto = actions.findIndex((a) => a.autofocus);
      (buttons[auto >= 0 ? auto : 0] || dialog).focus();
    });
  }

  function isOpen() {
    return !!current;
  }

  SS.modal = { show, isOpen, el };
})();
