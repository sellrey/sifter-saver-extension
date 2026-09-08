/* End-to-end test: loads the unpacked extension into Chromium and drives the
 * mock wizard (test/mock/wizard.html) served at the real Seller Portal URL so
 * the content script matches. Run with `npm test` inside test/. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, '../SifterSaverExtension');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock/wizard.html'), 'utf8');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const WIZARD_URL = 'https://sellerportal.tcgplayer.com/scan-identify/sifter/newjob';

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (_) { /* fall through */ }
  // Fall back to any cached Playwright Chromium build (extensions need the full build, not the headless shell).
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])) : [];
  for (const d of dirs) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
      const p = path.join(cache, d, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined; // let Playwright report the missing browser
}

const executablePath = findChromium();
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssv-profile-'));
const headed = !!process.env.HEADED;
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath,
  args: [headed ? null : '--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-gpu'].filter(Boolean),
  viewport: { width: 1440, height: 900 },
});
await context.route('https://sellerportal.tcgplayer.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: MOCK }));
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('console', (m) => { if (m.type() === 'error' || /Sifter Saver/.test(m.text())) console.log('  [page]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

/* ---------- tiny harness ---------- */
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, ok: false, error: e });
    console.log('FAIL', name, '\n   ', e.stack || e.message);
    try { await page.screenshot({ path: path.join(OUT, `fail-${results.length}.png`), fullPage: true }); } catch (_) { /* ignore */ }
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const eq = (a, b, msg) => { const A = JSON.stringify(a); const B = JSON.stringify(b); if (A !== B) throw new Error(`${msg || 'not equal'}: expected ${B}, got ${A}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sidebar = () => page.locator('.ssv-sidebar');
const modal = () => page.locator('.ssv-modal');
const cfg = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mockState.jobConfig)));
const started = () => page.evaluate(() => window.__started || null);
async function mockSelect(cls, label) {
  await page.click(`.${cls} .tcg-input-select__trigger`);
  await page.click(`.${cls} li[aria-label="${label}"]`);
  await page.mouse.click(5, 5); // close any dropdown still open
}
async function mockPrice(v) {
  const input = page.locator('.currency-input__input');
  await input.click();
  await input.fill(String(v));
  await page.keyboard.press('Tab');
}
async function openSettings() {
  if (!(await page.$('details.ssv-settings[open]'))) await page.click('.ssv-settings summary');
}
async function clickStart() {
  await page.click('.sellerportal-sifter-job__footer-primary');
}
async function chooseGameAndJob(game, job) {
  await page.waitForSelector('.select-game-and-job-type');
  await mockSelect('select-game-and-job-type__game-select', game);
  await page.click(`.select-game-and-job-type__card[aria-label="${job}"]`);
  await page.click('.sellerportal-sifter-job__footer-primary');
  await page.waitForSelector('.job-config');
  await page.waitForSelector('.job-config__condition-select li', { state: 'attached' });
}
async function fillPokemonForm() {
  await page.click('.job-config__criteria-card:has-text("Price")');
  await mockPrice('0.35');
  await page.click('.job-config__criteria-card:has-text("Rarity")');
  await mockSelect('job-config__criteria-input:has(.tcg-input-field__label:has-text("Rarity"))', 'Rare');
  await mockSelect('job-config__criteria-input:has(.tcg-input-field__label:has-text("Rarity"))', 'Ultra Rare');
  await page.check('input[name="match-mode"][value="and"]');
  await mockSelect('job-config__condition-select', 'Near Mint');
  await mockSelect('job-config__foil-finish-select', 'Holofoil');
}
const EXPECTED_PKM = {
  selectedCriteria: ['price', 'rarity'], matchMode: 'and', selectedCondition: 'Near Mint', selectedLanguage: 'English', priceThreshold: 0.35,
  selectedRarity: ['Rare', 'Ultra Rare'], selectedColor: [], foilPreference: null, foilFinish: 'Holofoil', selectedBins: [1, 2, 3], batchNameMode: 'default',
};

/* ---------- tests ---------- */
await page.goto(WIZARD_URL);

await test('sidebar mounts on the wizard route (step 1)', async () => {
  await sidebar().waitFor({ timeout: 8000 });
  const ctx = await page.textContent('.ssv-context');
  assert(/Choose game and job type/.test(ctx), `context text was "${ctx}"`);
  assert(await page.isDisabled('[data-action="new"]'), 'save button should be disabled before job setup');
});

await test('context updates on the job setup step', async () => {
  await chooseGameAndJob('Pokémon', 'Sift only');
  await page.waitForFunction(() => /Pokémon · Sift only — Job setup/.test(document.querySelector('.ssv-context')?.textContent || ''));
  assert(!(await page.isDisabled('[data-action="new"]')), 'save button should be enabled on job setup');
});

await test('save current form as a preset', async () => {
  await fillPokemonForm();
  eq(await cfg(), EXPECTED_PKM, 'mock form state after filling');
  await page.click('[data-action="new"]');
  const input = page.locator('#ssv-new-name');
  await input.waitFor();
  const suggested = await input.inputValue();
  assert(/PKM/.test(suggested) && /0\.35/.test(suggested), `suggested name was "${suggested}"`);
  await input.fill('PKM 35c NM');
  await page.click('form[data-form="new"] button[type="submit"]');
  await page.waitForSelector('.ssv-preset:has-text("PKM 35c NM")');
  const summary = await page.textContent('.ssv-preset .ssv-preset__summary');
  eq(summary.trim(), 'Price ≥ $0.35 AND Rarity: Rare, Ultra Rare · Near Mint · Holofoil', 'preset summary');
  assert(await page.locator('.ssv-status--ok').count() === 1, 'freshly saved preset should show as applied/matching');
  await page.screenshot({ path: path.join(OUT, '01-sidebar-saved.png') });
});

await test('apply preset fills an empty form', async () => {
  await page.click('#mock-reset');
  eq((await cfg()).selectedCriteria, [], 'form should be empty after reset');
  await page.click('.ssv-preset [data-action="apply"]');
  await page.waitForSelector('.ssv-notice--ok', { timeout: 15000 });
  eq(await cfg(), EXPECTED_PKM, 'mock form state after apply');
  const note = await page.textContent('.ssv-notice');
  assert(/Applied "PKM 35c NM"/.test(note), `notice was "${note}"`);
  assert(await page.locator('.ssv-status--ok').count() === 1, 'applied preset should report matching form');
});

await test('Start job is gated by the confirmation dialog', async () => {
  await clickStart();
  await modal().waitFor();
  assert((await started()) === null, 'job must not start before confirmation');
  const body = await modal().textContent();
  assert(/Sift only/.test(body) && /Pokémon/.test(body) && /\$0\.35/.test(body) && /Rare, Ultra Rare/.test(body), 'modal should summarise the form');
  assert(/No problems detected/.test(body), 'no warnings expected for a good form');
  await page.screenshot({ path: path.join(OUT, '02-confirm-clean.png') });
  await page.click('.ssv-modal [data-action="back"]');
  await modal().waitFor({ state: 'detached' });
  assert((await started()) === null, 'job must not start after Go back');
});

await test('Escape closes the dialog without starting', async () => {
  await clickStart();
  await modal().waitFor();
  await page.keyboard.press('Escape');
  await modal().waitFor({ state: 'detached' });
  assert((await started()) === null, 'job must not start on Escape');
});

await test('typo like 35 instead of 0.35 is flagged', async () => {
  await mockPrice('35');
  await page.waitForFunction(() => /differs/.test(document.querySelector('.ssv-status')?.textContent || ''));
  await clickStart();
  await modal().waitFor();
  const body = await modal().textContent();
  assert(/Did you mean \$0\.35\?/.test(body), 'expected the "did you mean" hint');
  assert(/differs from preset "PKM 35c NM"/.test(body), 'expected the preset difference warning');
  assert(await page.locator('.ssv-table__row--flagged').count() >= 1, 'price row should be highlighted');
  const label = await page.textContent('.ssv-modal [data-action="start"]');
  assert(/Start despite warnings/.test(label), `start button label was "${label}"`);
  await page.screenshot({ path: path.join(OUT, '03-confirm-warning.png') });
  await page.click('.ssv-modal [data-action="back"]');
  await modal().waitFor({ state: 'detached' });
  assert((await started()) === null, 'job must not start');
});

await test('confirming starts the job and the sidebar unmounts', async () => {
  await mockPrice('0.35');
  await clickStart();
  await modal().waitFor();
  await page.click('.ssv-modal [data-action="start"]');
  await page.waitForSelector('[data-testid="sift-only-job"]');
  const s = await started();
  assert(s && s.jobType === 'sift-only' && s.game === 'PKM', 'job should have started with the right context');
  eq(s.jobConfig, EXPECTED_PKM, 'started job config');
  await sidebar().waitFor({ state: 'detached' });
});

await test('presets persist across page loads', async () => {
  await page.goto(WIZARD_URL);
  await sidebar().waitFor();
  await page.waitForSelector('.ssv-preset:has-text("PKM 35c NM")');
});

await test('preset for another game/job asks before applying', async () => {
  await chooseGameAndJob('Magic: The Gathering', 'Scan & sift');
  await page.waitForFunction(() => /Magic: The Gathering · Scan & sift/.test(document.querySelector('.ssv-context')?.textContent || ''));
  assert(await page.locator('.ssv-preset').count() === 0, 'PKM preset should be hidden for an MTG job');
  await page.check('input[data-setting="showAllPresets"]');
  await page.waitForSelector('.ssv-preset--mismatch');
  await page.click('.ssv-preset [data-action="apply"]');
  await modal().waitFor();
  assert(/does not match this job/.test(await modal().textContent()), 'mismatch dialog expected');
  await page.click('.ssv-modal [data-action="cancel"]');
  await modal().waitFor({ state: 'detached' });
  eq((await cfg()).selectedCriteria, [], 'cancelled apply must not touch the form');
});

await test('scan & sift preset round-trips bins and colour', async () => {
  await page.click('.job-config__criteria-card:has-text("Color")');
  await mockSelect('job-config__criteria-input:has(.tcg-input-field__label:has-text("Color"))', 'Blue');
  await mockSelect('job-config__criteria-input:has(.tcg-input-field__label:has-text("Color"))', 'Red');
  await page.click('.job-config__criteria-card:has-text("Foil")');
  await page.check('input[name="foil-options"][value="non-foil"]');
  await page.check('input[name="match-mode"][value="or"]');
  await mockSelect('job-config__condition-select', 'Lightly Played');
  await mockSelect('job-config__foil-finish-select', 'Special Foil');
  await page.uncheck('.job-config__bins input[type="checkbox"] >> nth=2');
  const before = await cfg();
  await page.click('[data-action="new"]');
  await page.fill('#ssv-new-name', 'MTG blue/red normal');
  await page.click('form[data-form="new"] button[type="submit"]');
  await page.waitForSelector('.ssv-preset:has-text("MTG blue/red normal")');
  await page.click('#mock-reset');
  await page.click('.ssv-preset:has-text("MTG blue/red normal") [data-action="apply"]');
  await page.waitForSelector('.ssv-notice--ok', { timeout: 15000 });
  eq(await cfg(), before, 'scan & sift form after apply');
});

await test('rename, duplicate and delete', async () => {
  const card = page.locator('.ssv-preset:has-text("MTG blue/red normal")');
  await card.locator('[data-action="rename"]').click();
  await page.fill('form[data-form="rename"] input[name="name"]', 'MTG renamed');
  await page.click('form[data-form="rename"] button[type="submit"]');
  await page.waitForSelector('.ssv-preset:has-text("MTG renamed")');
  await page.locator('.ssv-preset:has-text("MTG renamed") [data-action="duplicate"]').click();
  await page.waitForSelector('.ssv-preset:has-text("MTG renamed (copy)")');
  await page.locator('.ssv-preset:has-text("MTG renamed (copy)") [data-action="delete"]').click();
  await modal().waitFor();
  await page.click('.ssv-modal [data-action="ok"]');
  await page.waitForSelector('.ssv-preset:has-text("MTG renamed (copy)")', { state: 'detached' });
  assert(await page.locator('.ssv-preset').count() === 2, 'two presets should remain');
});

await test('disabling the confirmation lets Start job through', async () => {
  await openSettings();
  await page.uncheck('input[data-setting="confirmEnabled"]');
  await sleep(200);
  await clickStart();
  await page.waitForSelector('[data-testid="sift-only-job"]');
  assert((await started()) !== null, 'job should start immediately');
  await page.goto(WIZARD_URL);
  await sidebar().waitFor();
  await openSettings();
  await page.check('input[data-setting="confirmEnabled"]');
});

await test('sidebar collapses to a tab and expands again', async () => {
  await page.click('.ssv-header [data-action="set-setting"][data-key="sidebarCollapsed"]');
  await page.waitForSelector('.ssv-tab');
  assert(!(await page.evaluate(() => document.documentElement.classList.contains('ssv-open'))), 'page padding should be removed when collapsed');
  await page.click('.ssv-tab');
  await page.waitForSelector('.ssv-header');
});

await test('import merges presets from JSON', async () => {
  const json = JSON.stringify({ sifterSaver: 1, presets: [{ id: 'imported-1', name: 'Imported LOR', jobType: 'sift-only', gameCode: 'LOR', criteria: ['color'], color: ['Ruby'], condition: 'Near Mint' }] });
  await openSettings();
  await page.setInputFiles('input[data-file="import"]', { name: 'presets.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.waitForSelector('.ssv-notice--ok');
  await page.check('input[data-setting="showAllPresets"]');
  await page.waitForSelector('.ssv-preset:has-text("Imported LOR")');
  const meta = await page.textContent('.ssv-preset:has-text("Imported LOR") .ssv-preset__meta');
  assert(/Lorcana · Sift only/.test(meta), `imported preset meta was "${meta}"`);
  await chooseGameAndJob('Pokémon', 'Sift only');
  await page.waitForSelector('.ssv-preset:has-text("Imported LOR") .ssv-chip--warn');
  await page.screenshot({ path: path.join(OUT, '04-sidebar-mixed.png') });
});

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} FAILED` : ''}`);
process.exit(failed.length ? 1 : 0);
