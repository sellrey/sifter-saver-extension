// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Gaming Co.
/* Render the extension icons and the sidebar footer mark from the logo.
 * Uses the Chromium that Playwright keeps in its cache (run `npm install` in test/ first):
 *     node tools/make_icons.mjs
 * Writes SifterSaverExtension/icons/icon{16,48,128}.png and injects a data URI for the
 * footer mark into styles/sifter-saver.css between the @tgc-mark markers. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../test/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(root, 'docs', 'thegamingco-logo.jpg');
const EXT = path.join(root, 'SifterSaverExtension');
const CSS = path.join(EXT, 'styles', 'sifter-saver.css');
// Square crop around the emblem (arcade cabinet + wordmark) in the 2026x1143 source.
const CROP = { x: 475, y: 45, size: 1040 };
const ICON_SIZES = [16, 48, 128];
const MARK_SIZE = 44; // rendered at 22px in the footer (2x for high-DPI screens)

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch (_) { /* fall through */ }
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])) : [];
  for (const d of dirs) for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
    const p = path.join(cache, d, sub);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(LOGO).toString('base64');
const out = await page.evaluate(async ({ dataUrl, CROP, sizes }) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const render = (size) => {
    let c = document.createElement('canvas');
    c.width = c.height = CROP.size;
    c.getContext('2d').drawImage(img, CROP.x, CROP.y, CROP.size, CROP.size, 0, 0, CROP.size, CROP.size);
    let cur = CROP.size;
    while (cur / 2 >= size) { // halve repeatedly for a clean downscale
      const n = document.createElement('canvas');
      n.width = n.height = Math.floor(cur / 2);
      const ctx = n.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c, 0, 0, n.width, n.height);
      c = n;
      cur = n.width;
    }
    const f = document.createElement('canvas');
    f.width = f.height = size;
    const ctx = f.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, size, size);
    return f.toDataURL('image/png');
  };
  return Object.fromEntries(sizes.map((s) => [s, render(s)]));
}, { dataUrl, CROP, sizes: [...ICON_SIZES, MARK_SIZE] });
await browser.close();

for (const s of ICON_SIZES) {
  const file = path.join(EXT, 'icons', `icon${s}.png`);
  fs.writeFileSync(file, Buffer.from(out[s].split(',')[1], 'base64'));
  console.log('wrote', path.relative(root, file));
}
const css = fs.readFileSync(CSS, 'utf8');
const start = css.indexOf('/* @tgc-mark-start');
const end = css.indexOf('/* @tgc-mark-end */');
if (start < 0 || end < 0) throw new Error('marker comments not found in ' + CSS);
const lineEnd = css.indexOf('\n', start) + 1;
const next = css.slice(0, lineEnd) + `.ssv-footer__mark { background-image: url("${out[MARK_SIZE]}"); }\n` + css.slice(end);
fs.writeFileSync(CSS, next);
console.log('injected footer mark into', path.relative(root, CSS), `(${out[MARK_SIZE].length} chars)`);
