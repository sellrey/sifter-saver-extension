# AGENTS.md — working notes for coding agents

This repo is a browser extension (Manifest V3, Chrome + Firefox, no build step) that augments the TCGplayer Seller Portal's Roca Sifter job wizard. Read this before changing anything.

## Git rules (non-negotiable)

- **Do not commit, amend, rebase, merge, reset, or push without explicit permission for that specific action.** By default leave changes in the working tree and tell the owner what changed. Permission for one commit does not carry over to later ones, and "small" follow-ups or fixes from a code review still need their own go-ahead.
- **Never add attribution for an AI agent.** No `Co-Authored-By: Claude ...`, no `Claude-Session:` or similar trailers, no "Generated with ..." footers in commit messages, pull request descriptions, or anywhere else. If the owner ever asks for a commit message draft, write it with no attribution lines.
- Do only what was asked. Do not launch code reviews, refactors, or extra commits on your own initiative; offer them in one line and wait.

## What the product does

- Adds a right-hand sidebar on `https://sellerportal.tcgplayer.com/scan-identify/sifter/newjob` (and the `/scan-identify/sifter-job` and `/quicklist/...` aliases) listing saved job-preference presets. Save current form, Apply, Overwrite, Rename, Duplicate, Delete, Export/Import JSON.
- Gates the wizard's **Start job** button behind a confirmation dialog that lists every setting and flags problems (price typo like `35` vs `0.35`, empty required values, differences from the applied preset).
- Never calls TCGplayer APIs. DOM only. Storage is `browser.storage.local`.

## Layout

- `SifterSaverExtension/` — the loadable extension. Plain scripts, loaded in the order listed in `manifest.json`; each attaches to `globalThis.SifterSaver` (`SS.catalog`, `SS.storage`, `SS.presets`, `SS.dom`, `SS.modal`, `SS.sidebar`). `src/content.js` is the entry and must stay last.
- `test/` — Playwright e2e (`cd test && npm install && npm test`). `test/mock/wizard.html` reproduces the real wizard's markup and behaviour; keep it faithful when you learn something new about the site.
- `tools/make_icons.py` regenerates icons; `tools/extract_from_har.py` decodes the site's JS bundle from a HAR file and prints selectors/option tables.
- `sellerportal.tcgplayer.com-scan-identify.har` — a capture of the real page used to derive everything below. It is git-ignored (9 MB, and it contains seller account details, device serials and staff names); keep it locally. Don't load it into context wholesale, use the tool script.

## Facts about the site (verified from the bundle, Sept 2026)

- Vue 3 + single-spa. The quicklist micro-frontend is `sellerportal-quicklist-app.tcgplayer.com/quicklist.js` (base64 in the HAR).
- Wizard component `SifterJobView`: steps 0 device → 1 game/job type → 2 `JobConfig`. Footer primary button has class `sellerportal-sifter-job__footer-primary`, text "Continue" or "Start job". Its click handler is a native listener on the `<button>`; a capture-phase listener on `document` that calls `stopImmediatePropagation()` blocks it.
- Job types: `sift-only`, `scan-and-sift`, `scan-only`. Title `h2.job-config__title` is "Sift job setup" / "Scan & sift job setup" / "Scan job setup".
- Form model: `selectedCriteria[]` (price, rarity, color, foil), `matchMode` (and/or, only with ≥2 criteria), `priceThreshold` (rounded to 2 dp, only validated `> 0`), `selectedRarity[]`, `selectedColor[]`, `foilPreference` (foil/non-foil), `selectedCondition`, `selectedLanguage` (disabled, English), `foilFinish`, `selectedBins[]` + batch name/notes (scan jobs only; hidden for sift-only).
- Per-game rules: YGO hides color/foil/rarity; ONE hides color. PKM calls color "Energy" (card) / "Energy type" (select); LOR "Ink type". Price sift allows NM/LP/MP for MTG and PKM, NM only otherwise; with price on, the other conditions are still rendered but carry `is-disabled` and the dropdown ignores clicks on them (the site only paints an invalid state, it does not block Start job). Option tables live in `src/catalog.js`.
- Foil-only sift job (sift-only with just the foil criterion): the site removes the whole Identification block (condition, language) and the foil finish block, and fixes foil to "foil cards".
- The step-1 game select is teleported to `<body>`; the JobConfig selects are not.
- Design-system widgets: `tcg-input-select` renders `div.tcg-input > .tcg-input-field > label span (label) … div.tcg-input-select > .tcg-input-select__trigger span (selected text) + ul.tcg-base-dropdown > li.tcg-base-dropdown__item[aria-label][role=option].is-selected`. The `ul` is `display:none` when closed but present, so `li.click()` selects without opening. Radios: `input.tcg-input-radio__input[name=foil-options|match-mode|batch-name-mode]`. Checkboxes: `input.tcg-input-checkbox__input`. Price: `input.currency-input__input` (handlers on `input` and `blur`).
- Design-system stacking: `tcg-base-dialog` / `tcg-drawer` backdrops are z-index 100, full-screen loader 101, popovers 30, dropdowns 1–2. The sidebar sits at z-index 50 so site dialogs cover it; our own confirmation overlay is above everything.
- The site keeps an in-memory "last form snapshot" per device (`?restore=1`) but nothing persistent or user-selectable, so this extension is not duplicating a feature.

## Conventions

- No bundler, no TypeScript, no framework. Keep files loadable as-is in both browsers. Use `globalThis.browser || globalThis.chrome`.
- Prefix every injected class with `ssv-` and mark injected roots with `data-ssv` so the MutationObserver in `content.js` ignores our own DOM.
- Selectors go in `SEL` in `src/dom.js` only. Pure logic (no DOM) goes in `src/presets.js` so it can be reasoned about and tested without a browser.
- Anything that drives the form must `await` between steps (`dom.tick()` / `dom.waitFor()`); Vue re-renders asynchronously and the condition select loads after a fetch.
- Do not add `host_permissions`, a background service worker, or network calls unless the feature genuinely needs them; the current manifest works identically in Chrome and Firefox because it has none. `strict_min_version` is 128 because earlier Firefox MV3 builds do not grant content-script site access at install.
- Every preset that enters `state.presets` (storage, import, form) goes through `presets.normalizeList`/`presetFromForm`; never trust raw storage or JSON shapes downstream. Writes go to storage first, then to state (`commitPresets`).
- Don't store batch names/notes in presets; they are job-specific.

## When the site changes

1. Capture a fresh HAR of the wizard, run `python3 tools/extract_from_har.py <file.har>`, and compare the printed class names and option tables with `src/dom.js` / `src/catalog.js`.
2. Update `test/mock/wizard.html` to match, then run `npm test` in `test/`.
3. Bump `version` in `manifest.json`.

## Testing notes

- `npm test` needs a full Chromium (not the headless shell) because extensions only load there; `run.mjs` finds one in Playwright's cache and runs it with `--headless=new`. Set `CHROME_PATH` to override, `HEADED=1` to watch.
- Firefox is not covered by the automated test; verify manually via `about:debugging`.
