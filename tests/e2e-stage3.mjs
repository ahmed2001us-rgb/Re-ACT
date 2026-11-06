/**
 * Stage 3 database checks in a real browser (not an app dependency).
 *
 *   CHROME=/usr/bin/google-chrome PLAYWRIGHT_CORE=/opt/npm-tools/node_modules SCRATCH=/some/dir node tests/e2e-stage3.mjs
 *
 * A. the in-browser database suite (tests/db/db-tests.js) against real IndexedDB
 * B. persistence: page refresh, a full browser restart, incomplete episodes, two tabs
 * C. UI integration: theme stored in the settings store, boot reconciliation, storage unavailable, another tab upgrading
 * Exit code is non-zero if any check fails.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './static-server.mjs';

const require = createRequire(`${process.env.PLAYWRIGHT_CORE || '/opt/npm-tools/node_modules'}/x.js`);
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.SCRATCH || os.tmpdir();

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn, timeout = 4000) {
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
const launchPersistent = (dir) => chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, args: ['--no-sandbox'], viewport: { width: 1280, height: 900 } });

/* ======================= A. database suite ======================= */
{
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/tests/db-test.html`);
  const suite = await page.evaluate(async () => (await import('/tests/db/db-tests.js')).runAll());
  for (const r of suite) check(`[db] ${r.name}`, r.ok, r.error);
  check('[db] no uncaught page errors during the suite', errors.length === 0, errors.join(' | '));
  console.log(`      (database suite: ${suite.filter((r) => r.ok).length}/${suite.length}, ${suite.reduce((s, r) => s + r.ms, 0)} ms)`);
  await context.close();
}

/* ======================= B. persistence ======================= */
const SNAPSHOT = async () => {
  const { database } = await import('/src/db/index.js');
  return JSON.parse(
    JSON.stringify({
      episodes: await database.episodes.getAll(),
      emotions: await database.emotions.list(),
      actions: await database.actionLibrary.list(),
      settings: await database.settings.list(),
    }),
  );
};

{
  const profile = mkdtempSync(path.join(SCRATCH, 'react-profile-'));
  try {
    let context = await launchPersistent(profile);
    let page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${origin}/index.html#/home`);

    // Session 1: write a completed episode, an unfinished draft, a custom emotion/action and a setting.
    const written = await page.evaluate(async () => {
      const { database } = await import('/src/db/index.js');
      const { episodeService } = await import('/src/services/episode-service.js');
      const { EPISODE_STEPS } = await import('/src/models/enums.js');

      const emotion = await database.emotions.create({ label: 'Restless', family: 'fear', description: 'A hard-to-settle energy' });
      await database.actionLibrary.create({ label: 'Slow walk', category: 'body', effort: 'minimal' });

      const finished = await episodeService.start({
        occurredAt: '2026-11-03T16:30:00.000Z',
        emotions: [
          { emotionId: emotion.id, intensity: 7 },
          { emotionId: 'sadness', intensity: 4 },
        ],
        trigger: 'اجتماع طويل جداً 😤',
        actualEvent: 'The meeting ended forty minutes late.',
        interpretations: [{ text: 'They lost track of time', plausibility: 7 }],
        needs: ['respect'],
        impulses: [{ text: 'Send a sharp email' }],
        chosenResponses: [{ actionId: null, text: 'Took a short walk first', category: 'body' }],
        outcome: { text: 'Calmer', shift: 'lighter' },
        reflection: { text: 'I waited before replying', learned: 'A pause helps' },
        currentStep: 'reflection',
        completedSteps: [...EPISODE_STEPS],
      });
      await episodeService.complete(finished.id);

      const draft = await episodeService.start({ emotions: [{ emotionId: 'anxiety', intensity: 6 }] });
      await episodeService.saveProgress(draft.id, { trigger: 'A half-written thought' }, { currentStep: 'event', markStepsDone: ['emotions', 'trigger'] });
      await episodeService.saveProgress(draft.id, { actualEvent: 'Still typing this' }, { currentStep: 'interpretation', markStepsDone: ['event'] });

      await database.settings.set('theme', 'dark');
      return { finishedId: finished.id, draftId: draft.id };
    });
    const before = await page.evaluate(SNAPSHOT);
    check('[persist] session 1 wrote 2 episodes, 1 emotion, 1 action, 1 setting', before.episodes.length === 2 && before.emotions.length === 1 && before.actions.length === 1 && before.settings.length === 1);

    // Refresh
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.ra-main h1'));
    const afterReload = await page.evaluate(SNAPSHOT);
    check('[persist] everything is identical after a page refresh', isDeepStrictEqual(before, afterReload), 'snapshots differ');

    const draftAfterReload = afterReload.episodes.find((e) => e.id === written.draftId);
    check(
      '[persist] the unfinished episode keeps its status, step, completed steps and typed text after refresh',
      draftAfterReload?.status === 'in_progress' &&
        draftAfterReload.currentStep === 'interpretation' &&
        isDeepStrictEqual(draftAfterReload.completedSteps, ['emotions', 'trigger', 'event']) &&
        draftAfterReload.trigger === 'A half-written thought' &&
        draftAfterReload.actualEvent === 'Still typing this' &&
        draftAfterReload.completedAt === null,
      JSON.stringify(draftAfterReload),
    );
    const resumed = await page.evaluate(async () => (await (await import('/src/services/episode-service.js')).episodeService.getResumable())?.id);
    check('[persist] "resume where you left off" finds the draft after refresh', resumed === written.draftId);
    const finishedAfter = afterReload.episodes.find((e) => e.id === written.finishedId);
    check('[persist] the completed episode keeps Arabic text, emoji, multiple emotions and intensities', finishedAfter?.status === 'completed' && finishedAfter.trigger === 'اجتماع طويل جداً 😤' && finishedAfter.emotions.length === 2 && finishedAfter.emotions[0].intensity === 7 && finishedAfter.emotions[1].intensity === 4);

    // Full browser restart (all pages and the browser process closed, same profile reopened)
    await context.close();
    context = await launchPersistent(profile);
    page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${origin}/index.html#/home`);
    const afterRestart = await page.evaluate(SNAPSHOT);
    check('[persist] everything is identical after closing and relaunching the browser', isDeepStrictEqual(before, afterRestart), 'snapshots differ after restart');
    const resumedAfterRestart = await page.evaluate(async () => (await (await import('/src/services/episode-service.js')).episodeService.getResumable())?.id);
    check('[persist] the unfinished episode can be resumed after a browser restart', resumedAfterRestart === written.draftId);

    // Session 3: continue the draft, complete it, delete the other episode; then restart again
    const continued = await page.evaluate(async (ids) => {
      const { database } = await import('/src/db/index.js');
      const { episodeService } = await import('/src/services/episode-service.js');
      const draft = await episodeService.get(ids.draftId);
      const saved = await episodeService.saveProgress(ids.draftId, { interpretations: [{ text: 'Maybe I am just tired' }] }, { currentStep: 'need', markStepsDone: ['interpretation'], expectedRevision: draft.revision });
      const done = await episodeService.complete(ids.draftId);
      await database.episodes.delete(ids.finishedId);
      return { savedRevision: saved.revision, doneRevision: done.revision, draftRevision: draft.revision };
    }, written);
    check('[persist] a later session continues from the saved revision and bumps it correctly', continued.savedRevision === continued.draftRevision + 1 && continued.doneRevision === continued.savedRevision + 1, JSON.stringify(continued));
    const mid = await page.evaluate(SNAPSHOT);
    await context.close();
    context = await launchPersistent(profile);
    page = await context.newPage();
    await page.goto(`${origin}/index.html#/home`);
    const last = await page.evaluate(SNAPSHOT);
    check('[persist] edits, completion and deletion all persist across another restart', isDeepStrictEqual(mid, last) && last.episodes.length === 1 && last.episodes[0].status === 'completed' && last.episodes[0].interpretations[0].text === 'Maybe I am just tired');

    // Two tabs in the same browser
    const tab2 = await context.newPage();
    await tab2.goto(`${origin}/index.html#/home`);
    const draft2 = await page.evaluate(async () => (await (await import('/src/services/episode-service.js')).episodeService.start({ emotions: [{ emotionId: 'joy', intensity: 3 }] })).id);
    const seenInTab2 = await tab2.evaluate(async (id) => (await (await import('/src/services/episode-service.js')).episodeService.get(id))?.id, draft2);
    check('[tabs] a record written in one tab is visible in the other', seenInTab2 === draft2);
    const revisionSeen = 1;
    const tab2Save = await tab2.evaluate(async ([id, rev]) => (await (await import('/src/services/episode-service.js')).episodeService.saveProgress(id, { trigger: 'from tab 2' }, { expectedRevision: rev })).revision, [draft2, revisionSeen]);
    const tab1Stale = await page.evaluate(async ([id, rev]) => {
      try {
        await (await import('/src/services/episode-service.js')).episodeService.saveProgress(id, { trigger: 'from tab 1 (stale)' }, { expectedRevision: rev });
        return 'saved';
      } catch (e) {
        return `${e.code}/${e.details?.reason}`;
      }
    }, [draft2, revisionSeen]);
    const finalTrigger = await page.evaluate(async (id) => (await (await import('/src/services/episode-service.js')).episodeService.get(id)).trigger, draft2);
    check('[tabs] a stale save from the other tab is refused and does not overwrite newer data', tab2Save === 2 && tab1Stale === 'conflict/stale' && finalTrigger === 'from tab 2', `${tab2Save} ${tab1Stale} ${finalTrigger}`);

    check('[persist] no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await context.close();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/* ======================= C. UI integration ======================= */
const rawGet = (page, store, key) =>
  page.evaluate(
    ([s, k]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('react-db');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction(s).objectStore(s).get(k);
          get.onsuccess = () => {
            db.close();
            resolve(get.result ?? null);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    [store, key],
  );
const rawWrite = (page, store, op, value) =>
  page.evaluate(
    ([s, o, v]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('react-db');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(s, 'readwrite');
          if (o === 'put') tx.objectStore(s).put(v);
          else tx.objectStore(s).delete(v);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [store, op, value],
  );
const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const storageText = (page) => page.evaluate(() => document.querySelector('[data-storage-status]')?.textContent ?? null);

async function openApp(context, hash = '#/settings') {
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.__errors.push(`console: ${m.text()}`));
  await page.goto(`${origin}/index.html${hash}`);
  await page.waitForSelector('.ra-main h1');
  return page;
}

{
  const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 900 } });
  const page = await openApp(context);
  const ready = await poll(async () => (await storageText(page)) === 'Ready (database version 1)');
  check('[ui] Settings > About shows "Ready (database version 1)"', ready, await storageText(page));

  const layout = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('react-db');
        open.onsuccess = () => {
          const db = open.result;
          const out = { version: db.version, stores: [...db.objectStoreNames].sort() };
          db.close();
          resolve(out);
        };
      }),
  );
  check('[ui] the real database "react-db" exists at version 1 with the four stores', layout.version === 1 && layout.stores.join() === 'actionLibrary,emotions,episodes,settings', JSON.stringify(layout));

  await page.locator('input[name="theme"][value="dark"]').check({ force: true });
  const savedDark = await poll(async () => (await rawGet(page, 'settings', 'theme'))?.value === 'dark');
  check('[ui] choosing Dark in Settings is written to the database settings store', savedDark, JSON.stringify(await rawGet(page, 'settings', 'theme')));
  check('[ui] the "pending" flag is cleared once the database confirms', await poll(() => page.evaluate(() => localStorage.getItem('react.theme.pending') === null)));

  await page.reload();
  await page.waitForSelector('.ra-main h1');
  check('[ui] Dark theme is still applied after a refresh', (await theme(page)) === 'dark');

  await page.locator('.ra-header button[aria-label^="Switch to"]').click();
  const lightRecord = await poll(async () => {
    const r = await rawGet(page, 'settings', 'theme');
    return r?.value === 'light' ? r : null;
  });
  check('[ui] the header toggle saves too, and the revision increments', lightRecord?.revision === 2, JSON.stringify(lightRecord));

  // The database wins over the boot mirror
  await rawWrite(page, 'settings', 'put', { key: 'theme', value: 'dark', schemaVersion: 1, revision: 5, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  await page.evaluate(() => {
    localStorage.setItem('react.theme', 'light');
    localStorage.removeItem('react.theme.pending');
  });
  await page.reload();
  await page.waitForSelector('.ra-main h1');
  const dbWon = await poll(async () => (await theme(page)) === 'dark');
  check('[ui] when the database and the mirror disagree, the database wins', dbWon && (await page.evaluate(() => localStorage.getItem('react.theme'))) === 'dark');

  // A choice that never reached the database (page closed too fast) is not lost
  await page.evaluate(() => {
    localStorage.setItem('react.theme', 'light');
    localStorage.setItem('react.theme.pending', '1');
  });
  await page.reload();
  await page.waitForSelector('.ra-main h1');
  const recovered = await poll(async () => (await rawGet(page, 'settings', 'theme'))?.value === 'light');
  check('[ui] an unsaved ("pending") theme choice wins on the next start and is then saved', recovered && (await theme(page)) === 'light' && (await page.evaluate(() => localStorage.getItem('react.theme.pending'))) === null);

  // A theme chosen before the database existed (Stage 2 users) is migrated into it
  await rawWrite(page, 'settings', 'delete', 'theme');
  await page.evaluate(() => {
    localStorage.setItem('react.theme', 'dark');
    localStorage.removeItem('react.theme.pending');
  });
  await page.reload();
  await page.waitForSelector('.ra-main h1');
  check('[ui] an existing browser-only theme choice is migrated into the database', await poll(async () => (await rawGet(page, 'settings', 'theme'))?.value === 'dark'));

  check('[ui] no uncaught errors in normal use', page.__errors.length === 0, page.__errors.join(' | '));

  // Another tab (newer app) upgrades the database while this one is open
  const upgrader = await context.newPage();
  await upgrader.goto(`${origin}/tests/db-test.html`);
  await upgrader.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('react-db', 2);
        request.onupgradeneeded = () => request.result.createObjectStore('future');
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('blocked: the app tab did not release its connection'));
      }),
  );
  const toast = await poll(() => page.locator('.ra-toast').filter({ hasText: 'updated in another tab' }).count());
  check('[ui] when another tab upgrades the database, this tab releases it and tells the person calmly', toast > 0);
  check('[ui] About reflects the disconnected state', (await poll(async () => /^Disconnected/.test((await storageText(page)) ?? ''))) === true);
  await context.close();
}

{
  // IndexedDB unavailable: the app must still work and say so
  const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true }));
  const page = await openApp(context);
  const unavailable = await poll(async () => /^Unavailable/.test((await storageText(page)) ?? ''));
  check('[ui] with storage unavailable, About says "Unavailable"', unavailable, await storageText(page));
  const toastText = await poll(async () => (await page.locator('.ra-toast').first().innerText().catch(() => '')) || '');
  check('[ui] with storage unavailable, a calm notification explains that changes will not be remembered', /won't be remembered/.test(toastText), toastText);
  await page.locator('.ra-header button[aria-label^="Switch to"]').click();
  const toggled = await theme(page);
  check('[ui] with storage unavailable, the app still works (theme toggle applies and is mirrored)', toggled === 'dark' && (await page.evaluate(() => localStorage.getItem('react.theme'))) === 'dark');
  await page.getByRole('link', { name: 'My Patterns' }).first().click();
  check('[ui] with storage unavailable, navigation still works', (await poll(async () => (await page.locator('[data-page-title]').innerText()) === 'My Patterns')) === true);
  check('[ui] with storage unavailable, there are no uncaught errors', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
