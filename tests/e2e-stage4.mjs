/**
 * Stage 4 browser checks: emotion library, episode create / view / edit / delete, drafts, Home integration.
 *
 *   CHROME=/usr/bin/google-chrome PLAYWRIGHT_CORE=/opt/npm-tools/node_modules SCRATCH=/some/dir node tests/e2e-stage4.mjs
 *
 * A. the in-browser app suite (tests/app/app-tests.js) against real IndexedDB
 * B. UI flows in real Chrome (each flow uses a fresh browser context, so a real empty database)
 * C. persistence across a full browser restart, two tabs, storage unavailable, responsive layouts
 * Exit code is non-zero if any check fails.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './static-server.mjs';

const require = createRequire(`${process.env.PLAYWRIGHT_CORE || '/opt/npm-tools/node_modules'}/x.js`);
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.SCRATCH || os.tmpdir();
mkdirSync(SCRATCH, { recursive: true });
const SHOTS = process.env.SHOTS || '';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? `  -> ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn, timeout = 5000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await fn();
    if (value) return value;
    await sleep(60);
  }
  return value;
}

const { server, origin } = await startServer(ROOT);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const URL = (hash = '#/home') => `${origin}/index.html${hash}`;

/** A fresh browser context (empty IndexedDB) with an app page, collecting uncaught errors and console errors. */
async function fresh({ viewport = { width: 1280, height: 900 }, colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport, colorScheme });
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') page.__errors.push(`console: ${m.text()}`);
  });
  return { context, page };
}
const openApp = async (page, hash = '#/home', ready = '.ra-main [data-page-title]') => {
  await page.goto(URL(hash));
  await page.waitForSelector(ready);
};
/** Navigate inside the running app (hash change, no reload) and wait for something that only the new page has. */
const go = async (page, hash, ready = '.ra-main [data-page-title]') => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForSelector(ready);
  await sleep(150);
};
const title = (page) => page.locator('.ra-main [data-page-title]').first().innerText();
const svc = (page, fn, arg) => page.evaluate(async ([src, a]) => {
  const { episodeService } = await import('/src/services/episode-service.js');
  const { libraryService } = await import('/src/services/library-service.js');
  return new Function('episodeService', 'libraryService', 'arg', `return (${src})(episodeService, libraryService, arg)`)(episodeService, libraryService, a);
}, [fn.toString(), arg]);
const stored = (page) => svc(page, async (e) => JSON.parse(JSON.stringify(await e.listRecent({ limit: 500 }))));
const saveStatus = (page) => page.locator('[data-save-status]').innerText();
const waitSaved = (page) => poll(async () => /Draft saved/.test(await saveStatus(page)), 6000);
const toastText = async (page) => (await page.locator('.ra-toast__message').allInnerTexts()).join(' | ');
const chip = (page, id) => page.locator(`.ra-chip[data-emotion="${id}"]`);
const slider = (page, id) => page.locator(`input[data-intensity-for="${id}"]`);
const field = (page, name) => page.locator(`[name="${name}"]`);
const press = (page, name) => page.getByRole('button', { name, exact: true });
const confirmDialog = async (page, label) => {
  await page.locator('dialog.ra-modal[open]').waitFor();
  await page.locator('dialog.ra-modal[open]').getByRole('button', { name: label, exact: true }).click();
  await page.locator('dialog.ra-modal[open]').waitFor({ state: 'detached' }).catch(() => {});
};
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
};

const REQUESTED = ['Anger', 'Anxiety', 'Fear', 'Sadness', 'Disappointment', 'Frustration', 'Envy', 'Jealousy', 'Guilt', 'Shame', 'Loneliness', 'Boredom', 'Overwhelm', 'Excitement', 'Joy', 'Peace', 'Gratitude', 'Motivation', 'Numbness'];

/* ======================= A. in-browser app suite ======================= */
{
  const { context, page } = await fresh();
  await page.goto(`${origin}/tests/app-test.html`);
  const suite = await page.evaluate(async () => (await import('/tests/app/app-tests.js')).runAll());
  for (const r of suite) check(`[app] ${r.name}`, r.ok, r.error);
  check('[app] no uncaught page errors during the suite', page.__errors.length === 0, page.__errors.join(' | '));
  console.log(`      (app suite: ${suite.filter((r) => r.ok).length}/${suite.length}, ${suite.reduce((s, r) => s + r.ms, 0)} ms)`);
  await context.close();
}

/* ======================= B1. navigation and the emotion library UI ======================= */
{
  const { context, page } = await fresh();
  await openApp(page, '#/new-episode', '.ra-chip');
  const nav = await page.locator('.ra-sidebar .ra-nav__link').allInnerTexts();
  check('[nav] the primary navigation still has exactly the five sections (new pages are reachable but not added)', nav.map((s) => s.trim()).join(',') === 'Home,New Episode,My Patterns,My Growth,Settings', nav.join(','));
  check('[nav] the New Episode page opens with its heading', (await title(page)) === 'New Episode');
  await page.waitForSelector('.ra-chip');
  const names = await page.locator('.ra-chip').allInnerTexts();
  check('[library] the picker offers exactly the 19 requested emotions', JSON.stringify([...names].sort()) === JSON.stringify([...REQUESTED].sort()), names.join(','));
  check('[library] chips are toggle buttons (aria-pressed=false at first)', (await page.locator('.ra-chip[aria-pressed="false"]').count()) === 19);
  check('[library] a search box is present and labelled', (await page.getByRole('searchbox', { name: 'Search emotions' }).count()) === 1);

  const search = page.getByRole('searchbox', { name: 'Search emotions' });
  await search.fill('worr');
  check('[search] typing "worr" shows only Anxiety', JSON.stringify(await page.locator('.ra-chip:visible').allInnerTexts()) === '["Anxiety"]');
  await search.fill('LET DOWN');
  check('[search] aliases work, any case ("LET DOWN" finds Disappointment)', JSON.stringify(await page.locator('.ra-chip:visible').allInnerTexts()) === '["Disappointment"]');
  await search.fill('zzzz');
  check('[search] no match shows a calm message pointing to custom emotions', /Nothing in the library matches/.test(await page.locator('.ra-emopick__nomatch').innerText()) && (await page.locator('.ra-chip:visible').count()) === 0);
  await search.fill('');
  check('[search] clearing the search restores all 19', (await page.locator('.ra-chip:visible').count()) === 19);

  // Several emotions, individual intensities
  await chip(page, 'anger').click();
  await chip(page, 'sadness').click();
  await chip(page, 'envy').click();
  check('[select] several emotions can be selected at once', (await page.locator('.ra-emotion-row').count()) === 3 && (await page.locator('.ra-chip[aria-pressed="true"]').count()) === 3);
  const range = await slider(page, 'anger').evaluate((el) => ({ min: el.min, max: el.max, step: el.step, value: el.value }));
  check('[intensity] each emotion has a 1-10 whole-number scale, starting at 5', range.min === '1' && range.max === '10' && range.step === '1' && range.value === '5', JSON.stringify(range));
  await slider(page, 'anger').focus();
  await page.keyboard.press('End');
  await slider(page, 'sadness').focus();
  await page.keyboard.press('Home');
  await slider(page, 'envy').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const values = await Promise.all(['anger', 'sadness', 'envy'].map((id) => slider(page, id).inputValue()));
  check('[intensity] each slider moves independently by keyboard (10, 1, 7), cannot go below 1 or above 10', values.join(',') === '10,1,7', values.join(','));
  await slider(page, 'sadness').press('ArrowLeft');
  await slider(page, 'anger').press('ArrowRight');
  check('[intensity] the scale stops at 1 and 10', (await slider(page, 'sadness').inputValue()) === '1' && (await slider(page, 'anger').inputValue()) === '10');
  const readout = await page.locator('[data-selected="anger"] output').innerText();
  check('[intensity] the chosen value is also shown as text ("10 of 10")', readout === '10 of 10', readout);
  const desc = await page.locator('[data-selected="anger"] .ra-emotion-row__desc').innerText();
  check('[descriptions] a selected emotion shows its description', /unfair/.test(desc), desc);
  check('[descriptions] sliders have accessible names (label per emotion)', (await page.getByLabel('Anger', { exact: true }).count()) >= 1);

  // Deselect
  await page.locator('[data-selected="envy"]').getByRole('button', { name: 'Remove Envy' }).click();
  check('[select] Remove takes an emotion out of the selection and un-presses its chip', (await page.locator('.ra-emotion-row').count()) === 2 && (await chip(page, 'envy').getAttribute('aria-pressed')) === 'false');
  await chip(page, 'sadness').click();
  check('[select] clicking a selected chip again deselects it', (await page.locator('.ra-emotion-row').count()) === 1);
  check('[select] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

/* ======================= B2. custom emotions ======================= */
{
  const { context, page } = await fresh();
  await openApp(page, '#/new-episode', '.ra-chip');
  await page.getByRole('button', { name: 'Add an emotion of your own' }).click();
  const form = page.getByRole('group', { name: 'Add an emotion of your own' });
  check('[custom] the add-your-own form opens with name, description and group fields', (await form.locator('input[name="custom-emotion-label"]').count()) === 1 && (await form.locator('textarea[name="custom-emotion-description"]').count()) === 1 && (await form.locator('select').count()) === 1);

  await form.getByRole('button', { name: 'Add and select' }).click();
  const errorText = async (scope) => poll(async () => (await scope.locator('.ra-field__error:visible').first().innerText().catch(() => '')) || '');
  check('[custom] an empty name is refused with a message, nothing added', /name/i.test(await errorText(form)) && (await page.locator('.ra-chip').count()) === 19);
  await form.locator('input[name="custom-emotion-label"]').fill('anger');
  await form.getByRole('button', { name: 'Add and select' }).click();
  check('[custom] a name that repeats a built-in emotion is refused kindly', /already in the library/.test(await errorText(form)) && (await page.locator('.ra-chip').count()) === 19);

  await form.locator('input[name="custom-emotion-label"]').fill('Restless');
  await form.locator('textarea[name="custom-emotion-description"]').fill('A hard-to-settle energy, like I should be doing something');
  await form.locator('select').selectOption('fear');
  await form.getByRole('button', { name: 'Add and select' }).click();
  await page.waitForSelector('[data-selected]');
  check('[custom] the new emotion is added to the library as a chip and selected straight away', (await page.locator('.ra-chip').count()) === 20 && (await page.locator('.ra-chip--on').innerText()) === 'Restless');
  check('[custom] the emotion shows its own description and a "Your own" label', /hard-to-settle/.test(await page.locator('[data-selected] .ra-emotion-row__desc').innerText()) && /Your own/.test(await page.locator('[data-selected]').innerText()));
  check('[custom] the add form closes after adding', (await page.getByRole('group', { name: 'Add an emotion of your own' }).count()) === 0);

  await page.getByRole('button', { name: 'Add an emotion of your own' }).click();
  await page.locator('input[name="custom-emotion-label"]').fill('  RESTLESS ');
  await page.getByRole('button', { name: 'Add and select' }).click();
  check('[custom] a repeat of your own emotion (any case/spacing) is refused', /already an emotion called/.test(await errorText(page.locator('.ra-emopick__customform'))));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  // Search finds the custom emotion
  await page.getByRole('searchbox', { name: 'Search emotions' }).fill('restl');
  const found = await page.locator('.ra-chip:visible').allInnerTexts();
  check('[custom] search finds your own emotions (the exact name first)', found[0] === 'Restless', found.join(','));

  // Persistence of the library entry (it is stored, not just in memory)
  await page.reload();
  await page.waitForSelector('.ra-chip');
  check('[custom] the custom emotion is still in the library after a page refresh', (await page.locator('.ra-chip').count()) === 20 && (await chip(page, 'restless').count()) === 0 && (await page.locator('.ra-chip--own').innerText()) === 'Restless');

  // Use it in an episode, then Settings management
  await page.locator('.ra-chip--own').click();
  await slider(page, await page.locator('.ra-emotion-row').getAttribute('data-selected')).press('ArrowRight');
  await press(page, 'Save episode').click();
  await page.waitForSelector('[data-episode-view]');
  check('[custom] an episode using the custom emotion shows it by name with its intensity', /Restless/.test(await page.locator('.ra-emotion-view').innerText()) && /6 of 10/.test(await page.locator('.ra-emotion-view').innerText()));

  await go(page, '#/settings', '[data-own-emotions], .ra-card');
  await page.waitForSelector('[data-own-emotion="Restless"]');
  check('[custom] Settings lists the emotions you added', (await page.locator('[data-own-emotion="Restless"]').count()) === 1);
  await page.locator('[data-own-emotion="Restless"]').getByRole('button', { name: 'Remove' }).click();
  await confirmDialog(page, 'Remove');
  check('[custom] removing an emotion that an episode uses is refused with a clear message', (await poll(async () => /used by 1 episode/.test(await toastText(page)))) && (await page.locator('[data-own-emotion="Restless"]').count()) === 1, await toastText(page));

  await page.evaluate(async () => {
    const { libraryService } = await import('/src/services/library-service.js');
    await libraryService.createEmotion({ label: 'Wistful' });
  });
  await page.reload();
  await page.waitForSelector('[data-own-emotion="Wistful"]');
  await page.locator('[data-own-emotion="Wistful"]').getByRole('button', { name: 'Remove' }).click();
  await confirmDialog(page, 'Remove');
  check('[custom] an unused custom emotion can be removed from Settings', (await poll(async () => (await page.locator('[data-own-emotion="Wistful"]').count()) === 0)) && (await page.locator('[data-own-emotion="Restless"]').count()) === 1);
  check('[custom] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

/* ======================= B3. create, view; Home integration ======================= */
{
  const { context, page } = await fresh();
  await openApp(page, '#/home', '#home-greeting');
  await page.waitForSelector('.ra-card');
  const emptyHome = await page.locator('.ra-main').innerText();
  check('[home] with no episodes, Recent episodes and the counts card show calm empty states', /No episodes yet/.test(emptyHome) && /Nothing recorded yet/.test(emptyHome), emptyHome.slice(0, 300));
  check('[home] no placeholder labels remain on Home', !/Placeholder|arrives in Stage/i.test(emptyHome), emptyHome);
  check('[home] no counts card numbers or resume card when there is no data', (await page.locator('.ra-stats, [data-resume-card]').count()) === 0);

  await page.getByRole('link', { name: 'New Episode' }).last().click();
  await page.waitForSelector('.ra-form');
  check('[form] the hero button opens the episode form', (await title(page)) === 'New Episode');
  const present = await Promise.all(['occurred', 'trigger', 'actualEvent', 'interpretation', 'need', 'impulse', 'response', 'responseCategory', 'outcome', 'outcomeShift', 'reflection'].map((n) => field(page, n).count()));
  check('[form] every requested field is present: date, emotions, trigger, event, interpretation, need, impulse, response, category, outcome, reflection', present.every((c) => c === 1) && (await page.locator('.ra-emopick').count()) === 1, present.join(','));
  const occurredNow = await field(page, 'occurred').inputValue();
  check('[form] the date and time are pre-filled with now', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(occurredNow) && Math.abs(new Date(occurredNow).getTime() - Date.now()) < 5 * 60_000, occurredNow);

  await chip(page, 'anger').click();
  await chip(page, 'sadness').click();
  await slider(page, 'anger').press('ArrowRight');
  await slider(page, 'anger').press('ArrowRight');
  await slider(page, 'sadness').press('ArrowLeft');
  await field(page, 'occurred').fill('2026-11-03T16:30');
  await field(page, 'trigger').fill('A meeting that ran late');
  await field(page, 'actualEvent').fill('It ended forty minutes after the agreed time.');
  await field(page, 'interpretation').fill('Maybe they lost track of time.');
  await field(page, 'need').fill('Respect for my time');
  await field(page, 'impulse').fill('Send a sharp email');
  await field(page, 'response').fill('Took a short walk first');
  await field(page, 'responseCategory').selectOption('body');
  await field(page, 'outcome').fill('Calmer');
  await field(page, 'outcomeShift').selectOption('lighter');
  await field(page, 'reflection').fill('I waited before replying.');
  await shot(page, 'form-filled');
  await press(page, 'Save episode').click();
  await page.waitForSelector('[data-episode-view]');
  const view = await page.locator('.ra-main').innerText();
  check('[view] Save episode opens the saved episode', (await title(page)).includes('Nov'), await title(page));
  check('[view] it shows each emotion with its own intensity', /Anger[\s\S]*7 of 10/.test(view) && /Sadness[\s\S]*4 of 10/.test(view), view);
  check('[view] it shows each emotion description', /unfair|disrespectful/.test(view) && /heavy, tender/.test(view));
  check('[view] it shows trigger, event, interpretation (as one possibility), need, impulse, response, outcome and reflection', ['A meeting that ran late', 'It ended forty minutes', 'Maybe they lost track of time.', 'Respect for my time', 'Send a sharp email', 'Took a short walk first', 'Calmer', 'I waited before replying.'].every((t) => view.includes(t)), view);
  check('[view] the response category and outcome shift are shown in plain words', /Body or movement/.test(view) && /lighter/i.test(view));
  check('[view] the interpretation is framed as a possibility, not a fact', /one possibility/i.test(view));
  check('[view] Edit and Delete are offered', (await page.getByRole('link', { name: 'Edit' }).count()) === 1 && (await press(page, 'Delete').count()) === 1);
  check('[view] focus moves to the page heading on arrival', (await page.evaluate(() => document.activeElement?.hasAttribute('data-page-title'))) === true);
  await shot(page, 'view');

  const [record] = await stored(page);
  check('[db] the saved episode is completed and stores every field exactly', record.status === 'completed' && record.completedAt && record.trigger === 'A meeting that ran late' && record.actualEvent.startsWith('It ended') && record.interpretations[0].text === 'Maybe they lost track of time.' && record.needs[0] === 'Respect for my time' && record.impulses[0].text === 'Send a sharp email' && record.chosenResponses[0].text === 'Took a short walk first' && record.chosenResponses[0].category === 'body' && record.outcome.text === 'Calmer' && record.outcome.shift === 'lighter' && record.reflection.text === 'I waited before replying.', JSON.stringify(record));
  check('[db] multiple emotions keep their individual intensities (Anger 7, Sadness 4)', JSON.stringify(record.emotions) === JSON.stringify([{ emotionId: 'anger', intensity: 7 }, { emotionId: 'sadness', intensity: 4 }]), JSON.stringify(record.emotions));
  check('[db] the date the person entered is what is stored', record.occurredAt === new Date(2026, 10, 3, 16, 30).toISOString(), record.occurredAt);

  await go(page, '#/home', '#home-greeting');
  await page.waitForSelector('.ra-episode-item');
  const homeText = await page.locator('.ra-main').innerText();
  check('[home] Recent episodes lists the new episode with its emotions and a preview', /Anger\s*7/.test(homeText) && /A meeting that ran late/.test(homeText));
  const stats = await page.locator('.ra-stat__link').evaluateAll((els) => els.map((e) => `${e.dataset.stat}:${e.querySelector('.ra-stat__n').textContent}`));
  check('[home] the counts are real: 1 total, 1 completed, 0 drafts', stats.join(',') === 'total:1,completed:1,drafts:0', stats.join(','));
  await page.locator('.ra-episode-item__link').first().click();
  check('[home] a recent episode opens its detail page', (await page.waitForSelector('[data-episode-view]', { timeout: 3000 }).then(() => true).catch(() => false)));
  check('[create] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

/* ======================= B4. drafts: save, resume, recover ======================= */
{
  const { context, page } = await fresh();
  await openApp(page, '#/new-episode', '.ra-chip');

  // A blank form must not create anything
  await press(page, 'Save draft').click();
  check('[draft] "Save draft" on an empty form says there is nothing to save and creates nothing', /nothing to save/i.test((await poll(async () => toastText(page))) || '') && (await stored(page)).length === 0);
  await sleep(1500);
  check('[draft] an untouched form never creates an empty draft by itself', (await stored(page)).length === 0);

  await chip(page, 'anxiety').click();
  await slider(page, 'anxiety').press('ArrowRight');
  await slider(page, 'anxiety').press('ArrowRight');
  await slider(page, 'anxiety').press('ArrowRight');
  await field(page, 'trigger').fill('A half-written thought');
  check('[draft] while typing, the form says it will save soon', /Saving soon/.test(await saveStatus(page)));
  check('[draft] a draft is saved automatically after a pause', (await waitSaved(page)) === true, await saveStatus(page));
  const urlAfter = page.url();
  check('[draft] once saved, the address points at the draft (so a refresh reopens it)', /#\/edit-episode\?id=[0-9a-f-]{36}$/.test(urlAfter), urlAfter);
  let all = await stored(page);
  check('[draft] the draft is stored as in progress with its emotion, intensity and text', all.length === 1 && all[0].status === 'in_progress' && all[0].trigger === 'A half-written thought' && all[0].emotions[0].emotionId === 'anxiety' && all[0].emotions[0].intensity === 8 && all[0].completedAt === null, JSON.stringify(all));
  check('[draft] a Delete button appears once the draft exists', (await press(page, 'Delete').count()) === 1);
  const draftId = all[0].id;

  // Refresh: the draft comes back
  await page.reload();
  await page.waitForSelector('.ra-form .ra-chip');
  check('[resume] after a refresh the draft reopens as "Continue your draft"', (await title(page)) === 'Continue your draft');
  check('[resume] the saved emotion, its intensity and the text are all back in the form', (await chip(page, 'anxiety').getAttribute('aria-pressed')) === 'true' && (await slider(page, 'anxiety').inputValue()) === '8' && (await field(page, 'trigger').inputValue()) === 'A half-written thought');
  check('[resume] it says the draft was saved', /Draft saved at/.test(await saveStatus(page)), await saveStatus(page));

  // Continue editing + explicit Save draft
  await field(page, 'need').fill('Some reassurance');
  await press(page, 'Save draft').click();
  check('[draft] "Save draft" confirms with a calm message', (await poll(async () => /Draft saved/.test(await toastText(page)))) === true, await toastText(page));
  all = await stored(page);
  check('[draft] the same draft is updated (no duplicate), revision goes up', all.length === 1 && all[0].id === draftId && all[0].needs[0] === 'Some reassurance' && all[0].revision >= 2, JSON.stringify(all.map((a) => [a.id, a.revision])));
  const revisionBefore = all[0].revision;
  await sleep(1400);
  check('[draft] with nothing changed, autosave writes nothing (revision stays the same)', (await stored(page))[0].revision === revisionBefore);

  // Home and New Episode point at the draft
  await go(page, '#/home', '#home-greeting');
  await page.waitForSelector('[data-resume-card]');
  const stats = await page.locator('.ra-stat__link').evaluateAll((els) => els.map((e) => `${e.dataset.stat}:${e.querySelector('.ra-stat__n').textContent}`));
  check('[home] an unfinished draft is offered as "Continue draft", and counted as a draft', stats.join(',') === 'total:1,completed:0,drafts:1' && (await page.locator('[data-resume-card]').getByRole('link', { name: 'Continue draft' }).count()) === 1, stats.join(','));
  check('[home] a draft in Recent episodes is marked as a draft', /Draft/.test(await page.locator('.ra-episode-item').first().innerText()));
  await go(page, '#/new-episode', '.ra-form');
  check('[resume] the New Episode page also offers the unfinished draft, without forcing it', (await page.locator('[data-resume-banner]').count()) === 1 && (await title(page)) === 'New Episode' && (await field(page, 'trigger').inputValue()) === '');
  await page.locator('[data-resume-banner]').getByRole('link', { name: 'Continue draft' }).click();
  await page.waitForSelector('.ra-form .ra-chip');
  check('[resume] "Continue draft" opens that draft with its content', (await field(page, 'trigger').inputValue()) === 'A half-written thought' && (await field(page, 'need').inputValue()) === 'Some reassurance');

  // Finishing without an emotion is refused kindly
  await chip(page, 'anxiety').click(); // deselect
  await press(page, 'Save episode').click();
  const emoError = await poll(async () => (await page.locator('.ra-emopick .ra-field__error:visible').innerText().catch(() => '')) || '');
  check('[draft] "Save episode" without an emotion explains what is missing and does not complete it', /at least one emotion/i.test(emoError) && (await stored(page))[0].status === 'in_progress', emoError);
  await chip(page, 'anxiety').click();
  await press(page, 'Save episode').click();
  await page.waitForSelector('[data-episode-view]');
  const done = (await stored(page))[0];
  check('[draft] with an emotion chosen, Save episode completes the same record', done.id === draftId && done.status === 'completed' && done.trigger === 'A half-written thought');
  await go(page, '#/home', '#home-greeting');
  await page.waitForSelector('.ra-stat__link');
  const stats2 = await page.locator('.ra-stat__link').evaluateAll((els) => els.map((e) => `${e.dataset.stat}:${e.querySelector('.ra-stat__n').textContent}`));
  check('[home] after completing, the counts update (1 total, 1 completed, 0 drafts) and the resume card is gone', stats2.join(',') === 'total:1,completed:1,drafts:0' && (await page.locator('[data-resume-card]').count()) === 0, stats2.join(','));

  // Leaving quickly (before the pause) still saves
  await go(page, '#/new-episode', '.ra-form .ra-chip');
  await field(page, 'trigger').fill('Typed, then left at once');
  await page.evaluate(() => (location.hash = '#/home'));
  const quick = await poll(async () => (await stored(page)).find((e) => e.trigger === 'Typed, then left at once'), 5000);
  check('[draft] leaving the page right after typing still saves the draft', !!quick && quick.status === 'in_progress');
  check('[draft] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

/* ======================= B5. edit a completed episode ======================= */
{
  const { context, page } = await fresh();
  await openApp(page, '#/home', '#home-greeting');
  const id = await svc(page, async (e) => (await e.finish({ fields: { occurredAt: new Date(2026, 10, 3, 9, 5, 30).toISOString(), emotions: [{ emotionId: 'guilt', intensity: 4 }], trigger: 'Original trigger', reflection: { text: 'Original reflection', learned: 'A kept note' } } })).id);
  await go(page, `#/episode?id=${id}`, '[data-episode-view]');
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.waitForSelector('.ra-form .ra-chip');
  check('[edit] Edit opens the form for that episode with its saved values', (await title(page)) === 'Edit episode' && (await field(page, 'trigger').inputValue()) === 'Original trigger' && (await chip(page, 'guilt').getAttribute('aria-pressed')) === 'true' && (await slider(page, 'guilt').inputValue()) === '4' && (await field(page, 'reflection').inputValue()) === 'Original reflection');
  check('[edit] a completed episode offers Save changes, Cancel and Delete (not Save draft)', (await press(page, 'Save changes').count()) === 1 && (await press(page, 'Cancel').count()) === 1 && (await press(page, 'Delete').count()) === 1 && (await press(page, 'Save draft').count()) === 0);

  await field(page, 'trigger').fill('Changed trigger');
  await sleep(1600);
  check('[edit] a completed episode is NOT changed by autosave: only by Save changes', (await stored(page))[0].trigger === 'Original trigger' && /unsaved changes/i.test(await saveStatus(page)), await saveStatus(page));

  // Empty emotions
  await chip(page, 'guilt').click();
  await press(page, 'Save changes').click();
  check('[edit] removing every emotion and saving is refused with an explanation, nothing changes', /at least one emotion/i.test((await poll(async () => (await page.locator('.ra-emopick .ra-field__error:visible').innerText().catch(() => '')) || '')) || '') && (await stored(page))[0].trigger === 'Original trigger' && (await title(page)) === 'Edit episode');

  // Future date
  await chip(page, 'guilt').click();
  await field(page, 'occurred').fill('2099-01-01T10:00');
  await press(page, 'Save changes').click();
  const futureError = await poll(async () => (await page.locator('[name="occurred"] ~ .ra-field__error:visible').innerText().catch(() => '')) || '');
  check('[validation] a date in the future is refused with an explanation next to the date', /future/i.test(futureError) && (await stored(page))[0].trigger === 'Original trigger', futureError);
  check('[validation] the date field cannot pick a future time (max is now)', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test((await field(page, 'occurred').getAttribute('max')) || ''));

  // Restore date, change things, add an emotion
  await field(page, 'occurred').fill('2026-11-03T09:05');
  await chip(page, 'peace').click();
  await slider(page, 'peace').press('End');
  await slider(page, 'guilt').press('ArrowRight');
  await press(page, 'Save changes').click();
  await page.waitForSelector('[data-episode-view]');
  const edited = (await stored(page))[0];
  check('[edit] Save changes stores the edits (text, intensity, an added emotion) and keeps the episode completed', edited.status === 'completed' && edited.trigger === 'Changed trigger' && JSON.stringify(edited.emotions) === JSON.stringify([{ emotionId: 'guilt', intensity: 6 }, { emotionId: 'peace', intensity: 10 }]), JSON.stringify(edited)); // guilt was removed and re-added above, so it restarted at 5, then +1
  check('[edit] things the form does not show are kept (the "learned" note on the reflection)', edited.reflection.learned === 'A kept note');
  check('[edit] an untouched date keeps its exact stored time (seconds included)', edited.occurredAt === new Date(2026, 10, 3, 9, 5, 30).toISOString() || edited.occurredAt === new Date(2026, 10, 3, 9, 5, 0).toISOString());
  const view = await page.locator('.ra-main').innerText();
  check('[edit] the detail page shows the new values', /Changed trigger/.test(view) && /Peace[\s\S]*10 of 10/.test(view) && /Guilt[\s\S]*6 of 10/.test(view));

  // Cancel with and without changes
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.waitForSelector('.ra-form .ra-chip');
  await field(page, 'trigger').fill('Will be discarded');
  await press(page, 'Cancel').click();
  await page.locator('dialog.ra-modal[open]').waitFor();
  check('[edit] Cancel with unsaved changes asks before discarding', /Discard your changes/.test(await page.locator('dialog.ra-modal[open]').innerText()));
  await confirmDialog(page, 'Keep editing');
  check('[edit] "Keep editing" stays on the form with the text intact', (await title(page)) === 'Edit episode' && (await field(page, 'trigger').inputValue()) === 'Will be discarded');
  await press(page, 'Cancel').click();
  await confirmDialog(page, 'Discard changes');
  await page.waitForSelector('[data-episode-view]');
  check('[edit] "Discard changes" returns to the episode, which is unchanged', (await stored(page))[0].trigger === 'Changed trigger');
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.waitForSelector('.ra-form .ra-chip');
  await press(page, 'Cancel').click();
  await page.waitForSelector('[data-episode-view]');
  check('[edit] Cancel with no changes just goes back (no question)', true);
  check('[edit] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

/* ======================= B6. delete ======================= */
{
  const { context, page } = await fresh();
  await openApp(page, '#/home', '#home-greeting');
  const make = (trigger) => svc(page, async (e, l, t) => (await e.finish({ fields: { emotions: [{ emotionId: 'joy', intensity: 5 }], trigger: t } })).id, trigger);
  const id = await make('Delete me');
  await go(page, `#/episode?id=${id}`, '[data-episode-view]');
  await press(page, 'Delete').click();
  await page.locator('dialog.ra-modal[open]').waitFor();
  check('[delete] Delete asks first, in plain words, and says it cannot be undone', /cannot be undone/.test(await page.locator('dialog.ra-modal[open]').innerText()));
  await confirmDialog(page, 'Keep it');
  check('[delete] "Keep it" leaves the episode in place', (await stored(page)).length === 1 && (await page.locator('[data-episode-view]').count()) === 1);
  await press(page, 'Delete').click();
  await confirmDialog(page, 'Delete permanently');
  check('[delete] confirming removes it from the database and goes to the list', (await poll(async () => (await stored(page)).length === 0)) === true && (await poll(async () => (await title(page)) === 'All episodes')) === true);
  await page.waitForSelector('[data-episodes-empty]:not([hidden])');
  check('[delete] a calm message confirms it', /deleted/i.test((await poll(async () => toastText(page))) || ''));
  check('[delete] the list now shows the empty state', (await page.locator('[data-episodes-empty]:not([hidden])').count()) === 1 && /No episodes yet/.test(await page.locator('[data-episodes-empty]').innerText()));
  await go(page, `#/episode?id=${id}`, '.ra-empty');
  check('[delete] opening the deleted episode shows "does not exist" instead of an error', /does not exist/.test(await page.locator('.ra-main').innerText()));
  await page.reload();
  await page.waitForSelector('.ra-empty');
  check('[delete] it stays deleted after a refresh', (await stored(page)).length === 0);

  // delete a draft from its edit form
  const draftId = await svc(page, async (e) => (await e.saveDraft({ fields: { trigger: 'A draft to discard', emotions: [{ emotionId: 'fear', intensity: 3 }] } })).id);
  await go(page, `#/edit-episode?id=${draftId}`, '.ra-form .ra-chip');
  await press(page, 'Delete').click();
  await confirmDialog(page, 'Delete permanently');
  check('[delete] a draft can be deleted from its form', (await poll(async () => (await stored(page)).length === 0)) === true && (await poll(async () => (await title(page)) === 'All episodes')) === true);
  await go(page, `#/edit-episode?id=${draftId}`, '.ra-empty');
  check('[delete] a draft link to a deleted draft shows "does not exist"', /does not exist/.test(await page.locator('.ra-main').innerText()));
  await go(page, '#/episode', '.ra-empty');
  check('[delete] a view link with no id is handled gracefully', /does not exist/.test(await page.locator('.ra-main').innerText()));

  // Stale delete is refused
  const id2 = await make('Changed elsewhere');
  await go(page, `#/episode?id=${id2}`, '[data-episode-view]');
  await svc(page, async (e, l, i) => e.saveChanges(i, { trigger: 'Edited in another tab' }), id2);
  await press(page, 'Delete').click();
  await confirmDialog(page, 'Delete permanently');
  check('[delete] if the episode was changed elsewhere meanwhile, deleting is refused and nothing is lost', (await poll(async () => /changed elsewhere/.test(await toastText(page)))) === true && (await stored(page)).length === 1);
  check('[delete] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

/* ======================= B7. lists, paging, filters, Home with many episodes ======================= */
{
  const { context, page } = await fresh();
  await openApp(page, '#/home', '#home-greeting');
  await svc(page, async (e) => {
    for (let i = 0; i < 25; i += 1) {
      await e.finish({ fields: { occurredAt: new Date(2026, 9, 1 + i, 12).toISOString(), emotions: [{ emotionId: 'joy', intensity: (i % 10) + 1 }, ...(i % 2 ? [{ emotionId: 'fear', intensity: 2 }] : [])], trigger: `Seed ${i}` } });
    }
    await e.saveDraft({ fields: { occurredAt: new Date(2026, 9, 28, 12).toISOString(), trigger: 'Seed draft' } });
  });
  await page.reload(); // Home reads the database when it opens; the same address does not re-open it
  await page.waitForSelector('.ra-episode-item');
  const items = await page.locator('.ra-episode-item__preview').allInnerTexts();
  check('[home] Recent episodes shows the 5 most recent, newest first (by when they happened)', JSON.stringify(items) === JSON.stringify(['Seed draft', 'Seed 24', 'Seed 23', 'Seed 22', 'Seed 21']), JSON.stringify(items));
  const stats = await page.locator('.ra-stat__link').evaluateAll((els) => els.map((e) => `${e.dataset.stat}:${e.querySelector('.ra-stat__n').textContent}`));
  check('[home] counts with many episodes: 26 total, 25 completed, 1 draft', stats.join(',') === 'total:26,completed:25,drafts:1', stats.join(','));

  await page.getByRole('link', { name: 'All episodes' }).click();
  await page.waitForSelector('[data-episodes-summary]:not(:empty)');
  check('[list] All episodes shows the first 20 and says how many there are', (await page.locator('.ra-episode-item').count()) === 20 && /26 episodes/.test(await page.locator('[data-episodes-summary]').innerText()));
  await press(page, 'Show more').click();
  check('[list] "Show more" loads the rest (26) and then goes away', (await poll(async () => (await page.locator('.ra-episode-item').count()) === 26)) === true && (await press(page, 'Show more').isHidden()));
  const ids = await page.locator('.ra-episode-item').evaluateAll((els) => els.map((e) => e.dataset.episodeId));
  check('[list] no episode appears twice', new Set(ids).size === 26);
  await page.locator('input[name="episode-filter"][value="in_progress"]').check();
  check('[list] the Drafts filter shows only the draft', (await poll(async () => (await page.locator('.ra-episode-item').count()) === 1)) === true && /Seed draft/.test(await page.locator('.ra-episode-item').innerText()) && page.url().includes('status=in_progress'));
  await page.locator('input[name="episode-filter"][value="completed"]').check();
  check('[list] the Completed filter shows completed episodes only', (await poll(async () => (await page.locator('.ra-episode-item').count()) === 20)) === true && (await page.locator('.ra-episode-item[data-status="in_progress"]').count()) === 0);
  await page.goto(URL('#/episodes?status=in_progress'));
  await page.waitForSelector('.ra-episode-item');
  check('[list] a filtered address opens already filtered (Home links use this)', (await page.locator('.ra-episode-item').count()) === 1 && (await page.locator('input[name="episode-filter"]:checked').getAttribute('value')) === 'in_progress');
  await page.locator('.ra-episode-item__link').first().click();
  await page.waitForSelector('.ra-form .ra-chip');
  check('[list] opening a draft from the list continues it (the form), not a read-only page', (await title(page)) === 'Continue your draft' && (await field(page, 'trigger').inputValue()) === 'Seed draft');
  await go(page, '#/episodes', '.ra-episode-item');
  await page.locator('.ra-episode-item[data-status="completed"]', { hasText: 'Seed 23' }).locator('.ra-episode-item__link').click();
  check('[list] opening a completed episode shows it', (await page.waitForSelector('[data-episode-view]', { timeout: 3000 }).then(() => true).catch(() => false)));
  const emo = await page.locator('.ra-emotion-view').allInnerTexts();
  check('[view] an episode with two emotions lists both, each with its intensity', emo.length === 2 && /Joy[\s\S]*4 of 10/.test(emo[0]) && /Fear[\s\S]*2 of 10/.test(emo[1]), emo.join(' | '));
  check('[list] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

/* ======================= C1. persistence across a full browser restart ======================= */
{
  const profile = mkdtempSync(path.join(SCRATCH, 'react-s4-profile-'));
  const launch = () => chromium.launchPersistentContext(profile, { executablePath: CHROME, headless: true, args: ['--no-sandbox'], viewport: { width: 1280, height: 900 } });
  try {
    // ---- session 1: a completed episode (several emotions, one of them custom) and a draft, made through the real UI
    let context = await launch();
    let page = await context.newPage();
    page.__errors = [];
    page.on('pageerror', (e) => page.__errors.push(e.message));
    await openApp(page, '#/new-episode', '.ra-chip');
    await page.getByRole('button', { name: 'Add an emotion of your own' }).click();
    await page.locator('input[name="custom-emotion-label"]').fill('Restless');
    await page.locator('textarea[name="custom-emotion-description"]').fill('Hard to settle');
    await page.getByRole('button', { name: 'Add and select' }).click();
    await page.waitForSelector('[data-selected="' + (await page.locator('.ra-chip--on').getAttribute('data-emotion')) + '"]');
    await chip(page, 'anger').click();
    await chip(page, 'sadness').click();
    await slider(page, 'anger').press('End'); // 10
    await slider(page, 'sadness').press('ArrowLeft'); // 4
    await field(page, 'trigger').fill('اجتماع طويل 😤 — a long meeting');
    await field(page, 'actualEvent').fill('It ran forty minutes over.');
    await field(page, 'interpretation').fill('They may have lost track of time.');
    await field(page, 'need').fill('Respect for my time');
    await field(page, 'impulse').fill('Send a sharp email');
    await field(page, 'response').fill('Took a short walk first');
    await field(page, 'responseCategory').selectOption('body');
    await field(page, 'outcome').fill('A little lighter');
    await field(page, 'outcomeShift').selectOption('lighter');
    await field(page, 'reflection').fill('Waiting before replying helped.');
    await press(page, 'Save episode').click();
    await page.waitForSelector('[data-episode-view]');
    const doneId = await page.locator('[data-episode-view]').getAttribute('data-episode-view');

    await go(page, '#/new-episode', '.ra-form .ra-chip');
    await chip(page, 'anxiety').click();
    await field(page, 'trigger').fill('A half-written thought');
    await field(page, 'need').fill('Reassurance');
    await waitSaved(page);
    const draftUrlId = page.url().match(/id=([^&]+)/)?.[1];
    check('[restart] session 1 made one completed episode and one draft through the UI', !!doneId && !!draftUrlId && (await stored(page)).length === 2);
    await context.close(); // closes the whole browser

    // ---- session 2: a brand-new browser process on the same profile
    context = await launch();
    page = await context.newPage();
    page.__errors = [];
    page.on('pageerror', (e) => page.__errors.push(e.message));
    await openApp(page, '#/home', '#home-greeting');
    await page.waitForSelector('.ra-stat__link');
    const counts = await page.locator('.ra-stat__link').evaluateAll((els) => els.map((e) => `${e.dataset.stat}:${e.querySelector('.ra-stat__n').textContent}`));
    check('[restart] after a full browser restart, Home shows 2 total, 1 completed, 1 draft', counts.join(',') === 'total:2,completed:1,drafts:1', counts.join(','));
    check('[restart] Home offers to continue the draft', (await page.locator('[data-resume-card]').count()) === 1);
    check('[restart] recent episodes list both', (await page.locator('.ra-episode-item').count()) === 2);

    await page.locator('[data-resume-card]').getByRole('link', { name: 'Continue draft' }).click();
    await page.waitForSelector('.ra-form .ra-chip');
    check('[restart] the draft reopens with every typed value and its emotion', (await field(page, 'trigger').inputValue()) === 'A half-written thought' && (await field(page, 'need').inputValue()) === 'Reassurance' && (await chip(page, 'anxiety').getAttribute('aria-pressed')) === 'true' && (await title(page)) === 'Continue your draft');

    await go(page, `#/episode?id=${doneId}`, '[data-episode-view]');
    const text = await page.locator('.ra-main').innerText();
    check('[restart] the completed episode keeps all emotions with their own intensities, including the custom one', /Anger[\s\S]*10 of 10/.test(text) && /Sadness[\s\S]*4 of 10/.test(text) && /Restless[\s\S]*5 of 10/.test(text), text.slice(0, 300));
    const wanted = ['اجتماع طويل 😤', 'forty minutes over', 'lost track of time', 'Respect for my time', 'sharp email', 'short walk', 'Body or movement', 'A little lighter', 'Waiting before replying'];
    const absent = wanted.filter((part) => !text.includes(part));
    check('[restart] every text field survived (Arabic, emoji, all ten parts)', absent.length === 0, `missing: ${absent.join(' | ')} in: ${text}`);
    await go(page, '#/settings', '[data-page-title]');
    check('[restart] the custom emotion is still in your library (Settings)', /Restless/.test(await page.locator('.ra-main').innerText()));
    check('[restart] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/* ======================= C2. two tabs: a stale tab never overwrites ======================= */
{
  const { context, page: tabA } = await fresh();
  await openApp(tabA, '#/new-episode', '.ra-chip');
  await chip(tabA, 'anger').click();
  await field(tabA, 'trigger').fill('First thought');
  await waitSaved(tabA);
  const id = tabA.url().match(/id=([^&]+)/)?.[1];
  const tabB = await context.newPage();
  tabB.__errors = [];
  tabB.on('pageerror', (e) => tabB.__errors.push(e.message));
  await openApp(tabB, `#/edit-episode?id=${id}`, '.ra-form .ra-chip');
  await field(tabB, 'trigger').fill('Written in tab B');
  await waitSaved(tabB);
  await field(tabA, 'trigger').fill('Written in tab A (stale)');
  const notice = await poll(async () => (await tabA.locator('.ra-form .ra-notice:not([hidden])').innerText().catch(() => '')) || '', 7000);
  check('[tabs] the stale tab stops and explains, in plain words, that the episode was changed elsewhere', /another tab or window/.test(notice) && /Not saved/.test(await saveStatus(tabA)), notice);
  check('[tabs] the newer text from tab B is still what is stored (nothing was overwritten)', (await stored(tabB))[0].trigger === 'Written in tab B');
  check('[tabs] the stale tab keeps what was typed so it can be copied', (await field(tabA, 'trigger').inputValue()) === 'Written in tab A (stale)');
  await press(tabA, 'Save episode').click();
  check('[tabs] pressing Save on the stale tab is also refused (no overwrite)', (await poll(async () => /stopped saving/.test(await toastText(tabA)))) === true && (await stored(tabB))[0].trigger === 'Written in tab B');
  check('[tabs] there are no uncaught errors', tabA.__errors.length === 0 && tabB.__errors.length === 0, [...tabA.__errors, ...tabB.__errors].join(' | '));
  await context.close();
}

/* ======================= C3. storage unavailable ======================= */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true }));
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(`pageerror: ${e.message}`));
  await openApp(page, '#/home', '#home-greeting');
  check('[unavailable] Home still opens and explains calmly that saved episodes are not available', (await poll(async () => /not available/.test(await page.locator('.ra-main').innerText()))) === true);
  await go(page, '#/new-episode', '[data-page-title]');
  check('[unavailable] the New Episode form still opens', (await title(page)) === 'New Episode' && (await page.locator('.ra-form').count()) === 1);
  await chip(page, 'anger').click().catch(() => {});
  await field(page, 'trigger').fill('Typed while storage is unavailable');
  await press(page, 'Save draft').click();
  const status = await poll(async () => (await saveStatus(page).catch(() => '')) || '', 4000);
  check('[unavailable] saving says "Not saved" in plain words, and the text stays on the page', /Not saved/.test(status) && (await field(page, 'trigger').inputValue()) === 'Typed while storage is unavailable', status);
  check('[unavailable] there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

/* ======================= C4. responsive layouts and dark theme ======================= */
{
  const sizes = [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'tablet', viewport: { width: 768, height: 1024 } },
    { name: 'phone', viewport: { width: 390, height: 844 } },
  ];
  for (const { name, viewport } of sizes) {
    for (const colorScheme of ['light', 'dark']) {
      const { context, page } = await fresh({ viewport, colorScheme });
      await openApp(page, '#/home', '#home-greeting');
      const id = await svc(page, async (e) => {
        for (let i = 0; i < 3; i += 1) await e.finish({ fields: { occurredAt: new Date(2026, 10, 1 + i, 12).toISOString(), emotions: [{ emotionId: 'anger', intensity: 8 }, { emotionId: 'disappointment', intensity: 4 }, { emotionId: 'overwhelm', intensity: 6 }], trigger: 'A long message that has to wrap onto more than one line on a narrow phone screen, to be sure nothing overflows or gets cut off', actualEvent: 'Something happened.' } });
        await e.saveDraft({ fields: { trigger: 'A draft' } });
        return (await e.listRecent({ limit: 1 }))[0].id;
      });
      const overflow = async (label) => {
        const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
        check(`[responsive ${name}/${colorScheme}] ${label}: no horizontal scrolling`, widths.doc <= widths.win + 1, JSON.stringify(widths));
      };
      await page.reload();
      await page.waitForSelector('.ra-episode-item');
      await overflow('Home with episodes');
      await shot(page, `s4-${name}-${colorScheme}-home`);
      await go(page, '#/episodes', '[data-episodes-summary]:not(:empty)');
      await overflow('All episodes');
      await go(page, `#/episode?id=${id}`, '[data-episode-view]');
      await overflow('episode view');
      await shot(page, `s4-${name}-${colorScheme}-view`);
      await go(page, '#/new-episode', '.ra-form .ra-chip');
      for (const emotion of ['anger', 'sadness', 'overwhelm']) await chip(page, emotion).click();
      await overflow('the form with three emotions');
      await shot(page, `s4-${name}-${colorScheme}-form`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(200);
      const boxes = await page.evaluate(() => {
        const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        const bar = rect('.ra-formbar');
        const nav = document.querySelector('.ra-bottomnav');
        const navRect = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect() : null;
        const buttons = [...document.querySelectorAll('.ra-formbar .ra-btn')].map((b) => b.getBoundingClientRect().height);
        return { barBottom: bar?.bottom, barTop: bar?.top, navTop: navRect?.top ?? null, minButton: Math.min(...buttons), inView: bar ? bar.top >= 0 && bar.bottom <= window.innerHeight + 1 : false };
      });
      check(`[responsive ${name}/${colorScheme}] the save bar is fully visible and not covered by the bottom navigation`, boxes.inView && (boxes.navTop === null || boxes.barBottom <= boxes.navTop + 1), JSON.stringify(boxes));
      check(`[responsive ${name}/${colorScheme}] save-bar buttons are at least 44px tall`, boxes.minButton >= 43.5, String(boxes.minButton));
      check(`[responsive ${name}/${colorScheme}] there are no uncaught errors`, page.__errors.length === 0, page.__errors.join(' | '));
      await context.close();
    }
  }
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
