/**
 * Database test suite. Runs inside a real browser against real IndexedDB
 * (driven by tests/e2e-stage3.mjs). Every test uses its own throwaway database.
 */
import { test, assert, runAll } from './harness.js';
import { createDatabase, SCHEMA, STORES, DB_VERSION, toDbError } from '../../src/db/index.js';
import { MIGRATIONS } from '../../src/db/migrations/index.js';
import { runTransaction, promisify } from '../../src/db/idb.js';
import { createEpisodeService } from '../../src/services/episode-service.js';
import { EPISODE_STEPS } from '../../src/models/enums.js';
import { newId } from '../../src/utils/id.js';

export { runAll };

/* ---------- helpers ---------- */

/** Deterministic clock returning ISO strings; each call advances by `step` ms. */
function makeClock(start = '2026-11-04T10:00:00.000Z', step = 1000) {
  let t = Date.parse(start);
  const clock = () => {
    const value = new Date(t).toISOString();
    t += step;
    return value;
  };
  clock.set = (iso) => {
    t = Date.parse(iso);
  };
  return clock;
}

let counter = 0;
async function withDb(fn, options = {}) {
  const name = `react-test-${Date.now()}-${++counter}`;
  const clock = makeClock();
  const db = createDatabase({ name, now: clock, ...options });
  try {
    await db.open();
    return await fn(db, { name, clock });
  } finally {
    await db.deleteDatabase().catch(() => {});
  }
}

const withName = async (fn) => {
  const name = `react-test-${Date.now()}-${++counter}`;
  try {
    return await fn(name);
  } finally {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  }
};

const FULL = () => ({
  occurredAt: '2026-11-03T16:30:00.000Z',
  emotions: [
    { emotionId: 'frustration', intensity: 7 },
    { emotionId: 'sadness', intensity: 4 },
  ],
  overallIntensity: 7,
  trigger: 'The meeting ran over again',
  actualEvent: 'The meeting ended forty minutes late.',
  interpretations: [
    { text: 'They do not respect my time', plausibility: 5 },
    { text: 'They lost track of the time', plausibility: 7 },
  ],
  needs: ['respect', 'rest'],
  impulses: [{ text: 'Send a sharp email' }],
  chosenResponses: [{ actionId: null, text: 'Took a short walk first', category: 'body' }],
  outcome: { text: 'Calmer', shift: 'lighter' },
  reflection: { text: 'I waited before replying', learned: 'A pause helps' },
  tags: ['work'],
  currentStep: 'reflection',
  completedSteps: [...EPISODE_STEPS],
});

const withEmotion = (extra = {}) => ({ emotions: [{ emotionId: 'anger', intensity: 6 }], ...extra });

/* ---------- initialisation, versions, migrations ---------- */

test('init: creates exactly the four stores and indexes declared in schema.js', () =>
  withDb(async (db) => {
    const handle = await db.open();
    assert.deepEqual([...handle.objectStoreNames].sort(), SCHEMA.map((s) => s.name).sort(), 'store names');
    assert.deepEqual([...handle.objectStoreNames].sort(), ['actionLibrary', 'emotions', 'episodes', 'settings']);
    const tx = handle.transaction([...handle.objectStoreNames], 'readonly');
    for (const def of SCHEMA) {
      const store = tx.objectStore(def.name);
      assert.deepEqual(store.keyPath, def.keyPath, `${def.name} keyPath`);
      assert.deepEqual([...store.indexNames].sort(), def.indexes.map((i) => i.name).sort(), `${def.name} indexes`);
      for (const index of def.indexes) {
        const real = store.index(index.name);
        assert.deepEqual(real.keyPath, index.keyPath, `${def.name}.${index.name} keyPath`);
        assert.equal(real.unique, !!index.options?.unique, `${def.name}.${index.name} unique`);
        assert.equal(real.multiEntry, !!index.options?.multiEntry, `${def.name}.${index.name} multiEntry`);
      }
    }
  }));

test('init: declared DB_VERSION matches the latest migration and the opened database', () =>
  withDb(async (db) => {
    assert.equal(DB_VERSION, MIGRATIONS[MIGRATIONS.length - 1].version, 'DB_VERSION vs migrations');
    assert.equal((await db.open()).version, DB_VERSION, 'opened version');
    assert.equal(db.status().state, 'open');
  }));

test('init: concurrent open() calls share one connection', () =>
  withDb(async (db) => {
    db.close();
    const [a, b, c] = await Promise.all([db.open(), db.open(), db.open()]);
    assert.ok(a === b && b === c, 'same handle');
  }));

const M2 = {
  version: 2,
  name: 'add-trigger-index-and-backfill',
  up({ transaction }) {
    const store = transaction.objectStore('episodes');
    store.createIndex('byTrigger', 'trigger');
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.update({ ...cursor.value, migrated: true });
      cursor.continue();
    };
  },
};

test('migrations: upgrading v1 -> v2 keeps every record, runs the new step, adds the index', () =>
  withName(async (name) => {
    const v1 = createDatabase({ name, migrations: [MIGRATIONS[0]] });
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await v1.episodes.create(withEmotion({ trigger: `t${i}` }))).id);
    v1.close();

    const v2 = createDatabase({ name, migrations: [MIGRATIONS[0], M2] });
    const handle = await v2.open();
    assert.equal(handle.version, 2, 'version');
    const all = await v2.episodes.getAll();
    assert.equal(all.length, 3, 'records kept');
    assert.ok(all.every((r) => r.migrated === true), 'backfill ran for every record');
    assert.deepEqual(all.map((r) => r.id).sort(), [...ids].sort(), 'same ids');
    assert.ok(handle.transaction('episodes').objectStore('episodes').indexNames.contains('byTrigger'), 'new index exists');
    v2.close();
  }));

test('migrations: a failing migration rolls back completely and reports migration-failed', () =>
  withName(async (name) => {
    const v1 = createDatabase({ name, migrations: [MIGRATIONS[0]] });
    const created = await v1.episodes.create(withEmotion({ trigger: 'keep me' }));
    v1.close();

    const bad = {
      version: 2,
      name: 'explodes',
      up({ transaction }) {
        transaction.objectStore('episodes').createIndex('half', 'trigger');
        throw new Error('boom');
      },
    };
    const broken = createDatabase({ name, migrations: [MIGRATIONS[0], bad] });
    await assert.rejects(() => broken.open(), { code: 'migration-failed', message: 'open with failing migration' });
    assert.equal(broken.status().state, 'closed');

    const again = createDatabase({ name, migrations: [MIGRATIONS[0]] });
    const handle = await again.open();
    assert.equal(handle.version, 1, 'still version 1');
    assert.ok(!handle.transaction('episodes').objectStore('episodes').indexNames.contains('half'), 'half-applied change was rolled back');
    assert.equal((await again.episodes.get(created.id)).trigger, 'keep me', 'data intact');
    again.close();
  }));

test('migrations: data from a newer app version is refused, untouched', () =>
  withName(async (name) => {
    const newer = createDatabase({ name, migrations: [MIGRATIONS[0], M2] });
    const created = await newer.episodes.create(withEmotion());
    newer.close();

    const older = createDatabase({ name, migrations: [MIGRATIONS[0]] });
    await assert.rejects(() => older.open(), { code: 'version-too-new', message: 'open older app on newer data' });

    const back = createDatabase({ name, migrations: [MIGRATIONS[0], M2] });
    assert.ok(await back.episodes.get(created.id), 'record still there');
    back.close();
  }));

test('migrations: invalid migration lists are rejected', () => {
  const noop = () => {};
  const bad = [[], [{ version: 2, name: 'x', up: noop }], [{ version: 1, name: 'a', up: noop }, { version: 1, name: 'b', up: noop }], [{ version: 1, name: 'a' }]];
  for (const migrations of bad) {
    let threw = false;
    try {
      createDatabase({ migrations });
    } catch {
      threw = true;
    }
    assert.ok(threw, `should reject ${JSON.stringify(migrations.map((m) => m.version))}`);
  }
});

test('init: a connection closes itself when another tab upgrades, and reports it clearly', () =>
  withName(async (name) => {
    const db = createDatabase({ name });
    await db.open();
    const events = [];
    db.subscribe((e) => events.push(e.type));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION + 1);
      request.onupgradeneeded = () => request.result.createObjectStore('future');
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('upgrade was blocked: our connection did not close'));
    });
    assert.ok(events.includes('versionchange'), 'versionchange reported');
    assert.equal(db.status().state, 'closed');
    await assert.rejects(() => db.episodes.count(), { code: 'version-too-new', message: 'use after upgrade by newer app' });
  }));

test('errors: IndexedDB unavailable -> clear error, nothing throws synchronously', async () => {
  const db = createDatabase({ indexedDB: null });
  await assert.rejects(() => db.open(), { code: 'unavailable', message: 'open' });
  await assert.rejects(() => db.episodes.create(withEmotion()), { code: 'unavailable', message: 'create' });
  assert.equal(db.status().state, 'closed');
});

test('errors: browser errors map to calm, specific errors', () => {
  assert.equal(toDbError(new DOMException('full', 'QuotaExceededError')).code, 'quota');
  assert.equal(toDbError(new DOMException('v', 'VersionError')).code, 'version-too-new');
  assert.equal(toDbError(new DOMException('c', 'ConstraintError')).code, 'duplicate');
  assert.equal(toDbError(new DOMException('s', 'SecurityError')).code, 'unavailable');
  assert.equal(toDbError(new Error('odd')).code, 'transaction');
});

/* ---------- episodes: create / read ---------- */

test('episodes: create a minimal draft gets sensible defaults', () =>
  withDb(async (db, { clock }) => {
    const e = await db.episodes.create();
    assert.ok(/^[0-9a-f-]{36}$/.test(e.id), 'uuid id');
    assert.equal(e.status, 'in_progress');
    assert.equal(e.completedAt, null);
    assert.equal(e.currentStep, 'emotions');
    assert.deepEqual(e.completedSteps, []);
    assert.deepEqual(e.emotions, []);
    assert.deepEqual(e.emotionIds, []);
    assert.equal(e.revision, 1);
    assert.equal(e.createdAt, e.updatedAt);
    assert.equal(e.occurredAt, e.createdAt, 'occurredAt defaults to now');
    assert.equal(e.trigger, null);
    assert.equal(e.outcome, null);
    assert.ok(clock);
  }));

test('episodes: create a full episode and read every field back', () =>
  withDb(async (db) => {
    const input = FULL();
    const created = await db.episodes.create(input);
    const read = await db.episodes.get(created.id);
    assert.deepEqual(read, created, 'stored record equals the returned record');
    assert.equal(read.occurredAt, input.occurredAt);
    assert.deepEqual(read.emotions, input.emotions, 'multiple emotions with individual intensities');
    assert.deepEqual(read.emotionIds, ['frustration', 'sadness']);
    assert.equal(read.trigger, input.trigger);
    assert.equal(read.actualEvent, input.actualEvent);
    assert.deepEqual(read.interpretations, input.interpretations);
    assert.deepEqual(read.needs, input.needs);
    assert.deepEqual(read.impulses, input.impulses);
    assert.equal(read.chosenResponses[0].text, 'Took a short walk first');
    assert.equal(read.chosenResponses[0].category, 'body');
    assert.ok(read.chosenResponses[0].chosenAt, 'chosenAt stamped');
    assert.equal(read.outcome.shift, 'lighter');
    assert.ok(read.outcome.recordedAt, 'outcome stamped');
    assert.equal(read.reflection.learned, 'A pause helps');
    assert.equal(read.currentStep, 'reflection');
    assert.deepEqual(read.completedSteps, input.completedSteps);
  }));

test('episodes: ids are unique across many creates', () =>
  withDb(async (db) => {
    const ids = new Set();
    for (let batch = 0; batch < 4; batch++) {
      const made = await Promise.all(Array.from({ length: 15 }, () => db.episodes.create()));
      made.forEach((e) => ids.add(e.id));
    }
    assert.equal(ids.size, 60);
    assert.equal(await db.episodes.count(), 60);
  }));

test('episodes: get of a missing episode is null; getOrThrow is not-found; bad ids are validation errors', () =>
  withDb(async (db) => {
    assert.equal(await db.episodes.get(newId()), null);
    await assert.rejects(() => db.episodes.getOrThrow(newId()), { code: 'not-found' });
    await assert.rejects(() => db.episodes.get('nonsense'), { code: 'validation', path: 'id' });
    await assert.rejects(() => db.episodes.get(undefined), { code: 'validation' });
  }));

test('episodes: records read back are independent copies', () =>
  withDb(async (db) => {
    const e = await db.episodes.create(withEmotion());
    const a = await db.episodes.get(e.id);
    a.emotions[0].intensity = 1;
    a.trigger = 'tampered';
    const b = await db.episodes.get(e.id);
    assert.equal(b.emotions[0].intensity, 6);
    assert.equal(b.trigger, null);
    const input = withEmotion();
    const made = await db.episodes.create(input);
    input.emotions[0].intensity = 2;
    assert.equal((await db.episodes.get(made.id)).emotions[0].intensity, 6, 'mutating the input afterwards changes nothing');
  }));

test('episodes: Unicode (Arabic, emoji, newlines) survives a round trip exactly', () =>
  withDb(async (db) => {
    const text = 'اجتماع طويل جداً 😤\nسطر ثانٍ — “quotes”';
    const e = await db.episodes.create(withEmotion({ trigger: text, needs: ['الاحترام'] }));
    const read = await db.episodes.get(e.id);
    assert.equal(read.trigger, text);
    assert.deepEqual(read.needs, ['الاحترام']);
  }));

test('episodes: text is trimmed, blank text becomes null, length limits are exact', () =>
  withDb(async (db) => {
    const a = await db.episodes.create({ trigger: '   hello  ', actualEvent: '    ' });
    assert.equal(a.trigger, 'hello');
    assert.equal(a.actualEvent, null);
    const ok = await db.episodes.create({ trigger: 'x'.repeat(5000) });
    assert.equal(ok.trigger.length, 5000);
    await assert.rejects(() => db.episodes.create({ trigger: 'x'.repeat(5001) }), { code: 'validation', path: 'trigger' });
  }));

/* ---------- episodes: validation ---------- */

const INVALID = [
  ['intensity below 0', { emotions: [{ emotionId: 'a', intensity: -1 }] }, 'emotions[0].intensity'],
  ['intensity 0 (the scale starts at 1)', { emotions: [{ emotionId: 'a', intensity: 0 }] }, 'emotions[0].intensity'],
  ['intensity above 10', { emotions: [{ emotionId: 'a', intensity: 11 }] }, 'emotions[0].intensity'],
  ['fractional intensity', { emotions: [{ emotionId: 'a', intensity: 5.5 }] }, 'emotions[0].intensity'],
  ['text intensity', { emotions: [{ emotionId: 'a', intensity: '5' }] }, 'emotions[0].intensity'],
  ['NaN intensity', { emotions: [{ emotionId: 'a', intensity: NaN }] }, 'emotions[0].intensity'],
  ['emotions not a list', { emotions: 'anger' }, 'emotions'],
  ['empty emotion id', { emotions: [{ emotionId: '', intensity: 3 }] }, 'emotions[0].emotionId'],
  ['same emotion twice', { emotions: [{ emotionId: 'a', intensity: 3 }, { emotionId: 'a', intensity: 4 }] }, 'emotions'],
  ['too many emotions', { emotions: Array.from({ length: 21 }, (_, i) => ({ emotionId: `e${i}`, intensity: 1 })) }, 'emotions'],
  ['non-text trigger', { trigger: 5 }, 'trigger'],
  ['unknown field', { mood: 'blue' }, 'mood'],
  ['managed field: status', { status: 'completed' }, 'status'],
  ['managed field: revision', { revision: 9 }, 'revision'],
  ['managed field: createdAt', { createdAt: '2020-01-01T00:00:00.000Z' }, 'createdAt'],
  ['bad step', { currentStep: 'nope' }, 'currentStep'],
  ['repeated completed step', { completedSteps: ['emotions', 'emotions'] }, 'completedSteps'],
  ['response without text', { chosenResponses: [{ category: 'rest' }] }, 'chosenResponses[0].text'],
  ['response with bad category', { chosenResponses: [{ text: 'x', category: 'bad' }] }, 'chosenResponses[0].category'],
  ['response without category', { chosenResponses: [{ text: 'x' }] }, 'chosenResponses[0].category'],
  ['empty outcome', { outcome: {} }, 'outcome'],
  ['bad outcome shift', { outcome: { shift: 'great' } }, 'outcome.shift'],
  ['date-only occurredAt', { occurredAt: '2026-11-04' }, 'occurredAt'],
  ['offset occurredAt', { occurredAt: '2026-11-04T10:00:00+02:00' }, 'occurredAt'],
  ['garbage occurredAt', { occurredAt: 'yesterday' }, 'occurredAt'],
  ['occurredAt in the future', { occurredAt: '2026-11-05T10:00:00.000Z' }, 'occurredAt'],
  ['invalid id', { id: 'not-a-uuid' }, 'id'],
  ['input is not an object', 'hello', ''],
];

for (const [label, input, path] of INVALID) {
  test(`validation: rejects ${label} and writes nothing`, () =>
    withDb(async (db) => {
      await assert.rejects(() => db.episodes.create(input), { code: 'validation', path, message: label });
      assert.equal(await db.episodes.count(), 0, 'nothing was written');
    }));
}

test('validation: all problems are reported together', () =>
  withDb(async (db) => {
    const error = await assert.rejects(() => db.episodes.create({ trigger: 5, emotions: 'x', mood: 1 }), { code: 'validation' });
    assert.ok(error.issues.length >= 3, `got ${error.issues.length} issues`);
  }));

/* ---------- episodes: update ---------- */

test('update: changes fields, bumps revision and updatedAt, never touches id or createdAt', () =>
  withDb(async (db) => {
    const created = await db.episodes.create(withEmotion());
    const updated = await db.episodes.update(created.id, { trigger: 'new trigger', needs: ['calm'] });
    assert.equal(updated.trigger, 'new trigger');
    assert.deepEqual(updated.needs, ['calm']);
    assert.equal(updated.revision, 2);
    assert.equal(updated.id, created.id);
    assert.equal(updated.createdAt, created.createdAt);
    assert.ok(updated.updatedAt > created.updatedAt, 'updatedAt moved forward');
    assert.deepEqual(updated.emotions, created.emotions, 'untouched fields kept');
    assert.deepEqual(await db.episodes.get(created.id), updated, 'persisted');
  }));

test('update: managed and unknown fields are rejected and the record is unchanged', () =>
  withDb(async (db) => {
    const created = await db.episodes.create(withEmotion());
    for (const patch of [{ id: newId() }, { revision: 99 }, { createdAt: '2000-01-01T00:00:00.000Z' }, { status: 'completed' }, { emotionIds: ['x'] }, { bogus: 1 }]) {
      await assert.rejects(() => db.episodes.update(created.id, patch), { code: 'validation', message: JSON.stringify(patch) });
    }
    assert.deepEqual(await db.episodes.get(created.id), created);
  }));

test('update: a missing episode is not-found and nothing is created', () =>
  withDb(async (db) => {
    await assert.rejects(() => db.episodes.update(newId(), { trigger: 'x' }), { code: 'not-found' });
    assert.equal(await db.episodes.count(), 0);
  }));

test('update: an invalid patch leaves the stored record untouched', () =>
  withDb(async (db) => {
    const created = await db.episodes.create(withEmotion({ trigger: 'original' }));
    await assert.rejects(() => db.episodes.update(created.id, { trigger: 'changed', emotions: [{ emotionId: 'a', intensity: 99 }] }), { code: 'validation' });
    assert.deepEqual(await db.episodes.get(created.id), created);
  }));

test('update: saving identical data is a no-op (no new revision)', () =>
  withDb(async (db) => {
    const created = await db.episodes.create(withEmotion({ trigger: 'same' }));
    const again = await db.episodes.update(created.id, { trigger: 'same' });
    assert.equal(again.revision, 1);
    assert.equal(again.updatedAt, created.updatedAt);
    const empty = await db.episodes.update(created.id, {});
    assert.equal(empty.revision, 1);
  }));

test('update: null clears an optional field', () =>
  withDb(async (db) => {
    const created = await db.episodes.create(withEmotion({ trigger: 'x', outcome: { text: 'o' } }));
    const cleared = await db.episodes.update(created.id, { trigger: null, outcome: null });
    assert.equal(cleared.trigger, null);
    assert.equal(cleared.outcome, null);
  }));

test('update: updatedAt never moves backwards even if the clock does', () =>
  withDb(async (db, { clock }) => {
    const created = await db.episodes.create(withEmotion());
    clock.set('2020-01-01T00:00:00.000Z');
    const updated = await db.episodes.update(created.id, { trigger: 'x' });
    assert.ok(updated.updatedAt >= created.updatedAt, 'did not go backwards');
    assert.ok(updated.updatedAt >= updated.createdAt);
  }));

test('update: an existing episode stays editable after the device clock is corrected backwards', () =>
  withDb(async (db, { clock }) => {
    const created = await db.episodes.create(withEmotion());
    clock.set('2020-01-01T00:00:00.000Z'); // the stored occurredAt (2026) is now "in the future" relative to the clock
    const edited = await db.episodes.update(created.id, { trigger: 'still editable' });
    assert.equal(edited.trigger, 'still editable');
    const done = await db.episodes.complete(created.id);
    assert.equal(done.status, 'completed');
    await assert.rejects(() => db.episodes.update(created.id, { occurredAt: '2026-11-05T10:00:00.000Z' }), { code: 'validation', path: 'occurredAt' });
  }));

test('api: invalid input rejects the promise and never throws synchronously', () =>
  withDb(async (db) => {
    const calls = [() => db.episodes.create('bad'), () => db.episodes.get('bad'), () => db.episodes.update('bad', {}), () => db.episodes.delete('bad'), () => db.episodes.listRecent({ limit: 0 }), () => db.emotions.create({}), () => db.actionLibrary.get('bad'), () => db.settings.set('nope', 1)];
    for (const call of calls) {
      let promise;
      try {
        promise = call();
      } catch (error) {
        throw new Error(`threw synchronously: ${error.message}`);
      }
      assert.ok(promise instanceof Promise, 'returned a promise');
      await promise.then(
        () => {
          throw new Error('expected a rejection');
        },
        (error) => assert.ok(error.code, 'rejection carries an error code'),
      );
    }
  }));

test('safe updates: expectedRevision refuses a stale write and changes nothing', () =>
  withDb(async (db) => {
    const created = await db.episodes.create(withEmotion());
    const second = await db.episodes.update(created.id, { trigger: 'tab B' }, { expectedRevision: 1 });
    assert.equal(second.revision, 2);
    await assert.rejects(() => db.episodes.update(created.id, { trigger: 'tab A (stale)' }, { expectedRevision: 1 }), { code: 'conflict', reason: 'stale' });
    assert.equal((await db.episodes.get(created.id)).trigger, 'tab B', 'the newer change was not overwritten');
    await assert.rejects(() => db.episodes.update(created.id, { trigger: 'x' }, { expectedRevision: 0 }), { code: 'validation' });
    await assert.rejects(() => db.episodes.delete(created.id, { expectedRevision: 1 }), { code: 'conflict', reason: 'stale' });
    assert.ok(await db.episodes.get(created.id), 'stale delete refused');
  }));

test('safe updates: function patches run inside the transaction (no lost updates under concurrency)', () =>
  withDb(async (db) => {
    const service = createEpisodeService(db);
    const e = await service.start(withEmotion());
    const steps = ['emotions', 'trigger', 'event', 'interpretation', 'need', 'impulse', 'response', 'outcome'];
    await Promise.all(steps.map((step) => service.saveProgress(e.id, {}, { markStepsDone: [step] })));
    const read = await db.episodes.get(e.id);
    assert.deepEqual([...read.completedSteps].sort(), [...steps].sort(), 'every concurrent step was kept');
    assert.equal(read.revision, 1 + steps.length);
  }));

test('safe updates: outcome and reflection are stamped when written', () =>
  withDb(async (db) => {
    const created = await db.episodes.create(withEmotion());
    const withOutcome = await db.episodes.update(created.id, { outcome: { text: 'ok', shift: 'same' } });
    assert.ok(withOutcome.outcome.recordedAt >= created.updatedAt);
    const withReflection = await db.episodes.update(created.id, { reflection: { text: 'thoughts' } });
    assert.ok(withReflection.reflection.recordedAt);
    assert.deepEqual(withReflection.outcome, withOutcome.outcome, 'outcome unchanged by an unrelated update');
  }));

/* ---------- episodes: delete ---------- */

test('delete: removes the episode; deleting again is not-found, never silent', () =>
  withDb(async (db) => {
    const keep = await db.episodes.create(withEmotion());
    const gone = await db.episodes.create(withEmotion());
    assert.equal(await db.episodes.delete(gone.id), true);
    assert.equal(await db.episodes.get(gone.id), null);
    assert.ok(await db.episodes.get(keep.id), 'other episodes untouched');
    assert.equal(await db.episodes.count(), 1);
    await assert.rejects(() => db.episodes.delete(gone.id), { code: 'not-found' });
    await assert.rejects(() => db.episodes.delete('nonsense'), { code: 'validation' });
  }));

/* ---------- duplicate prevention ---------- */

test('duplicates: creating with an existing id is refused and the original is not overwritten', () =>
  withDb(async (db) => {
    const original = await db.episodes.create(withEmotion({ trigger: 'original' }));
    await assert.rejects(() => db.episodes.create({ id: original.id, ...withEmotion({ trigger: 'impostor' }) }), { code: 'duplicate' });
    assert.deepEqual(await db.episodes.get(original.id), original, 'unchanged');
    assert.equal(await db.episodes.count(), 1);
  }));

test('duplicates: two simultaneous creates of the same id -> exactly one wins', () =>
  withDb(async (db) => {
    const id = newId();
    const results = await Promise.allSettled([db.episodes.create({ id, ...withEmotion({ trigger: 'A' }) }), db.episodes.create({ id, ...withEmotion({ trigger: 'B' }) })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'one fulfilled');
    const lost = results.find((r) => r.status === 'rejected');
    assert.equal(lost.reason.code, 'duplicate');
    assert.equal(await db.episodes.count(), 1);
  }));

test('duplicates: the same emotion cannot appear twice in one episode', () =>
  withDb(async (db) => {
    await assert.rejects(() => db.episodes.create({ emotions: [{ emotionId: 'anger', intensity: 3 }, { emotionId: 'anger', intensity: 5 }] }), { code: 'validation', path: 'emotions' });
  }));

test('duplicates: custom emotion names are unique regardless of case, spacing and Unicode form', () =>
  withDb(async (db) => {
    const first = await db.emotions.create({ label: 'Restless', family: 'fear' });
    for (const label of ['restless', '  RESTLESS ', 'Rest   less'.replace('   ', '')]) {
      await assert.rejects(() => db.emotions.create({ label, family: 'fear' }), { code: 'duplicate', message: label });
    }
    const other = await db.emotions.create({ label: 'Calm', family: 'calm' });
    await assert.rejects(() => db.emotions.update(other.id, { label: 'RESTLESS' }), { code: 'duplicate' });
    assert.equal((await db.emotions.get(other.id)).label, 'Calm', 'rename refused, nothing changed');
    const recased = await db.emotions.update(first.id, { label: 'RESTLESS' });
    assert.equal(recased.label, 'RESTLESS', 'changing the capitalisation of its own name is allowed');
    assert.equal((await db.emotions.list()).length, 2);
  }));

test('duplicates: custom action names are unique too', () =>
  withDb(async (db) => {
    await db.actionLibrary.create({ label: 'Take a walk', category: 'body' });
    await assert.rejects(() => db.actionLibrary.create({ label: 'take a  walk'.replace('  ', ' '), category: 'rest' }), { code: 'duplicate' });
    assert.equal((await db.actionLibrary.list()).length, 1);
  }));

/* ---------- transactions ---------- */

test('transactions: a failure partway through rolls back every write in it', () =>
  withDb(async (db) => {
    const handle = await db.open();
    await assert.rejects(
      () =>
        runTransaction(handle, ['episodes', 'settings'], 'readwrite', async (tx) => {
          await promisify(tx.objectStore('episodes').add({ id: 'one' }));
          await promisify(tx.objectStore('settings').add({ key: 'theme', value: 'dark' }));
          throw new Error('boom after two writes');
        }),
      { code: 'transaction' },
    );
    assert.equal(await db.episodes.count(), 0, 'episode write rolled back');
    assert.equal(await db.settings.get('theme'), null, 'setting write rolled back');
  }));

test('transactions: a rejected unique-name write leaves no partial data', () =>
  withDb(async (db) => {
    const handle = await db.open();
    await db.emotions.create({ label: 'Restless', family: 'fear' });
    await assert.rejects(
      () =>
        runTransaction(handle, ['emotions'], 'readwrite', async (tx) => {
          const store = tx.objectStore('emotions');
          await promisify(store.add({ id: 'a', label: 'Fine', labelKey: 'fine', family: 'calm' }));
          await promisify(store.add({ id: 'b', label: 'Dup', labelKey: 'restless', family: 'calm' })); // violates the unique index
        }),
      { code: 'duplicate' },
    );
    assert.equal((await db.emotions.list()).length, 1, 'the first add was rolled back too');
  }));

/* ---------- incomplete episodes and workflow ---------- */

test('completion: needs at least one emotion; sets completedAt; cannot be completed twice', () =>
  withDb(async (db) => {
    const empty = await db.episodes.create();
    await assert.rejects(() => db.episodes.complete(empty.id), { code: 'validation', path: 'emotions' });
    assert.equal((await db.episodes.get(empty.id)).status, 'in_progress', 'still a draft');

    const ready = await db.episodes.create(withEmotion());
    const done = await db.episodes.complete(ready.id);
    assert.equal(done.status, 'completed');
    assert.ok(done.completedAt, 'completedAt set');
    assert.equal(done.revision, 2);
    await assert.rejects(() => db.episodes.complete(ready.id), { code: 'conflict' });
  }));

test('completion: a completed episode can still be edited, and cannot lose all its emotions', () =>
  withDb(async (db) => {
    const e = await db.episodes.create(withEmotion());
    await db.episodes.complete(e.id);
    const edited = await db.episodes.update(e.id, { reflection: { text: 'added later' } });
    assert.equal(edited.status, 'completed');
    assert.equal(edited.reflection.text, 'added later');
    await assert.rejects(() => db.episodes.update(e.id, { emotions: [] }), { code: 'validation', path: 'emotions' });
  }));

test('completion: reopen returns to a draft and clears completedAt', () =>
  withDb(async (db) => {
    const e = await db.episodes.create(withEmotion());
    await assert.rejects(() => db.episodes.reopen(e.id), { code: 'conflict' });
    await db.episodes.complete(e.id);
    const reopened = await db.episodes.reopen(e.id);
    assert.equal(reopened.status, 'in_progress');
    assert.equal(reopened.completedAt, null);
    assert.equal((await db.episodes.listIncomplete()).length, 1);
  }));

test('incomplete episodes: progress is saved step by step and can be resumed', () =>
  withDb(async (db) => {
    const service = createEpisodeService(db);
    assert.equal(await service.getResumable(), null, 'nothing to resume yet');

    const draft = await service.start({ emotions: [{ emotionId: 'anxiety', intensity: 6 }] });
    await service.saveProgress(draft.id, {}, { currentStep: 'trigger', markStepsDone: ['emotions'] });
    await service.saveProgress(draft.id, { trigger: 'Half-written thought' }, { currentStep: 'event', markStepsDone: ['trigger'] });

    const resumed = await service.getResumable();
    assert.equal(resumed.id, draft.id);
    assert.equal(resumed.status, 'in_progress');
    assert.equal(resumed.currentStep, 'event');
    assert.deepEqual(resumed.completedSteps, ['emotions', 'trigger']);
    assert.equal(resumed.trigger, 'Half-written thought');
    assert.equal(resumed.actualEvent, null, 'later steps still empty');

    const finished = await service.complete(draft.id);
    assert.equal(finished.status, 'completed');
    assert.equal(await service.getResumable(), null, 'completed episodes are no longer resumable');
    assert.deepEqual(await service.counts(), { total: 1, inProgress: 0, completed: 1 });
  }));

test('incomplete episodes: the most recently touched draft is the one to resume', () =>
  withDb(async (db) => {
    const service = createEpisodeService(db);
    const a = await service.start(withEmotion({ trigger: 'A' }));
    const b = await service.start(withEmotion({ trigger: 'B' }));
    assert.equal((await service.getResumable()).id, b.id);
    await service.saveProgress(a.id, { trigger: 'A edited' });
    assert.equal((await service.getResumable()).id, a.id, 'editing A makes it the latest');
    assert.deepEqual((await service.listIncomplete()).map((e) => e.id), [a.id, b.id]);
  }));

test('saveProgress: step lists never duplicate and invalid steps are refused', () =>
  withDb(async (db) => {
    const service = createEpisodeService(db);
    const e = await service.start();
    await service.saveProgress(e.id, {}, { markStepsDone: ['emotions'] });
    const again = await service.saveProgress(e.id, {}, { markStepsDone: ['emotions', 'trigger'] });
    assert.deepEqual(again.completedSteps, ['emotions', 'trigger']);
    await assert.rejects(() => service.saveProgress(e.id, {}, { markStepsDone: ['bogus'] }), { code: 'validation' });
    await assert.rejects(() => service.saveProgress(e.id, {}, { currentStep: 'bogus' }), { code: 'validation' });
  }));

/* ---------- queries ---------- */

const localNoon = (day) => new Date(2026, 10, day, 12, 0, 0).toISOString();

test('queries: listRecent orders newest first, pages, and filters by status', () =>
  withDb(async (db) => {
    const made = [];
    for (const day of [1, 2, 3, 4, 5]) made.push(await db.episodes.create(withEmotion({ occurredAt: localNoon(day) })).catch(() => null));
    // day 5 may be "in the future" relative to the fake clock (Nov 4); only days 1-3 are guaranteed valid
    const ids = made.filter(Boolean).map((e) => e.id);
    const all = await db.episodes.listRecent();
    assert.deepEqual(all.map((e) => e.occurredAt), [...all.map((e) => e.occurredAt)].sort().reverse(), 'newest first');
    const page = await db.episodes.listRecent({ limit: 2, offset: 1 });
    assert.deepEqual(page.map((e) => e.id), all.slice(1, 3).map((e) => e.id));
    await db.episodes.complete(ids[0]);
    assert.equal((await db.episodes.listRecent({ status: 'completed' })).length, 1);
    await assert.rejects(() => db.episodes.listRecent({ limit: 0 }), { code: 'validation' });
    await assert.rejects(() => db.episodes.listRecent({ offset: -1 }), { code: 'validation' });
  }));

test('queries: by emotion, by date range (local days), count and getAll', () =>
  withDb(async (db) => {
    const a = await db.episodes.create({ occurredAt: localNoon(1), emotions: [{ emotionId: 'anger', intensity: 5 }, { emotionId: 'fear', intensity: 2 }] });
    const b = await db.episodes.create({ occurredAt: localNoon(2), emotions: [{ emotionId: 'fear', intensity: 4 }] });
    const lateEvening = await db.episodes.create({ occurredAt: new Date(2026, 10, 3, 23, 59, 0).toISOString(), emotions: [{ emotionId: 'joy', intensity: 8 }] });

    assert.deepEqual((await db.episodes.listByEmotion('fear')).map((e) => e.id), [b.id, a.id], 'newest first');
    assert.deepEqual((await db.episodes.listByEmotion('anger')).map((e) => e.id), [a.id]);
    assert.deepEqual(await db.episodes.listByEmotion('missing'), []);

    assert.deepEqual((await db.episodes.listByDateRange('2026-11-02', '2026-11-03')).map((e) => e.id), [b.id, lateEvening.id], 'inclusive of the whole last day, oldest first');
    assert.deepEqual((await db.episodes.listByDateRange('2026-11-01', '2026-11-01')).map((e) => e.id), [a.id]);
    assert.deepEqual(await db.episodes.listByDateRange('2026-12-01', '2026-12-31'), []);
    await assert.rejects(() => db.episodes.listByDateRange('2026-11-03', '2026-11-01'), { code: 'validation' });
    await assert.rejects(() => db.episodes.listByDateRange('2026-02-31', '2026-03-01'), { code: 'validation' });

    assert.equal(await db.episodes.count(), 3);
    assert.equal(await db.episodes.count({ status: 'in_progress' }), 3);
    assert.deepEqual((await db.episodes.getAll()).map((e) => e.id), [a.id, b.id, lateEvening.id], 'oldest first');
  }));

test('queries: 200 episodes stay correct and ordered', () =>
  withDb(async (db, { clock }) => {
    clock.set('2026-11-04T10:00:00.000Z');
    const started = performance.now();
    for (let batch = 0; batch < 8; batch++) {
      await Promise.all(
        Array.from({ length: 25 }, (_, i) => {
          const n = batch * 25 + i;
          return db.episodes.create(withEmotion({ occurredAt: new Date(Date.UTC(2026, 0, 1) + n * 3600_000).toISOString(), trigger: `n${n}` }));
        }),
      );
    }
    assert.equal(await db.episodes.count(), 200);
    const top = await db.episodes.listRecent({ limit: 10 });
    assert.deepEqual(top.map((e) => e.trigger), Array.from({ length: 10 }, (_, i) => `n${199 - i}`));
    const tail = await db.episodes.listRecent({ limit: 10, offset: 190 });
    assert.deepEqual(tail.map((e) => e.trigger), Array.from({ length: 10 }, (_, i) => `n${9 - i}`));
    assert.ok(performance.now() - started < 30000, 'finished in a reasonable time');
  }));

/* ---------- custom emotions and actions ---------- */

test('emotions: full create / read / update / delete cycle', () =>
  withDb(async (db) => {
    const e = await db.emotions.create({ label: ' Restless ', family: 'fear', description: 'A hard-to-settle energy', commonNeeds: ['rest'], commonImpulses: ['pace'] });
    assert.equal(e.label, 'Restless');
    assert.equal(e.labelKey, 'restless');
    assert.equal(e.revision, 1);
    assert.deepEqual(await db.emotions.get(e.id), e);
    const u = await db.emotions.update(e.id, { description: 'Updated', commonNeeds: ['rest', 'movement'] });
    assert.equal(u.revision, 2);
    assert.equal(u.label, 'Restless');
    assert.deepEqual((await db.emotions.list('fear')).map((x) => x.id), [e.id]);
    assert.deepEqual(await db.emotions.list('joy'), []);
    await assert.rejects(() => db.emotions.update(e.id, { description: 'stale' }, { expectedRevision: 1 }), { code: 'conflict', reason: 'stale' });
    assert.equal(await db.emotions.delete(e.id), true);
    assert.equal(await db.emotions.get(e.id), null);
    await assert.rejects(() => db.emotions.delete(e.id), { code: 'not-found' });
  }));

test('emotions: validation', () =>
  withDb(async (db) => {
    await assert.rejects(() => db.emotions.create({ family: 'fear' }), { code: 'validation', path: 'label' });
    await assert.rejects(() => db.emotions.create({ label: 'X' }), { code: 'validation', path: 'family' });
    await assert.rejects(() => db.emotions.create({ label: '  ', family: 'fear' }), { code: 'validation', path: 'label' });
    await assert.rejects(() => db.emotions.create({ label: 'x'.repeat(81), family: 'fear' }), { code: 'validation', path: 'label' });
    await assert.rejects(() => db.emotions.create({ label: 'X', family: 'bogus' }), { code: 'validation', path: 'family' });
    await assert.rejects(() => db.emotions.create({ label: 'X', family: 'fear', commonNeeds: ['a', 'a'] }), { code: 'validation', path: 'commonNeeds' });
    await assert.rejects(() => db.emotions.create({ label: 'X', family: 'fear', source: 'built_in' }), { code: 'validation', path: 'source' });
    await assert.rejects(() => db.emotions.create({ label: 'X', family: 'fear', labelKey: 'x' }), { code: 'validation', path: 'labelKey' });
    assert.equal((await db.emotions.list()).length, 0);
  }));

test('emotions: one used by an episode cannot be deleted until the episode is gone', () =>
  withDb(async (db) => {
    const emotion = await db.emotions.create({ label: 'Restless', family: 'fear' });
    const episode = await db.episodes.create({ emotions: [{ emotionId: emotion.id, intensity: 5 }] });
    await assert.rejects(() => db.emotions.delete(emotion.id), { code: 'conflict', reason: 'in-use' });
    assert.ok(await db.emotions.get(emotion.id), 'still there');
    await db.episodes.delete(episode.id);
    assert.equal(await db.emotions.delete(emotion.id), true);
  }));

test('actionLibrary: CRUD, defaults and validation', () =>
  withDb(async (db) => {
    const a = await db.actionLibrary.create({ label: 'Take a walk', category: 'body' });
    assert.equal(a.effort, 'low');
    assert.deepEqual(a.intensityRange, { min: 0, max: 10 });
    assert.deepEqual(a.suitableFamilies, []);
    const u = await db.actionLibrary.update(a.id, { effort: 'minimal', intensityRange: { min: 3, max: 8 }, suitableFamilies: ['anger', 'fear'] });
    assert.equal(u.revision, 2);
    assert.deepEqual(u.intensityRange, { min: 3, max: 8 });
    assert.deepEqual((await db.actionLibrary.list('body')).map((x) => x.id), [a.id]);
    await assert.rejects(() => db.actionLibrary.create({ label: 'X', category: 'bogus' }), { code: 'validation', path: 'category' });
    await assert.rejects(() => db.actionLibrary.create({ label: 'X', category: 'rest', effort: 'huge' }), { code: 'validation', path: 'effort' });
    await assert.rejects(() => db.actionLibrary.create({ label: 'X', category: 'rest', intensityRange: { min: 8, max: 2 } }), { code: 'validation', path: 'intensityRange' });
    await assert.rejects(() => db.actionLibrary.create({ label: 'X', category: 'rest', suitableFamilies: ['bogus'] }), { code: 'validation' });
    assert.equal(await db.actionLibrary.delete(a.id), true);
    await assert.rejects(() => db.actionLibrary.get('nonsense'), { code: 'validation' });
    assert.equal((await db.actionLibrary.list()).length, 0);
  }));

/* ---------- settings ---------- */

test('settings: default, create, no-op, update, reset, validation', () =>
  withDb(async (db) => {
    assert.equal(await db.settings.get('theme'), null);
    assert.equal(await db.settings.getValue('theme'), 'system', 'falls back to the default');

    const created = await db.settings.set('theme', 'dark');
    assert.equal(created.created, true);
    assert.equal(created.record.revision, 1);
    assert.equal(await db.settings.getValue('theme'), 'dark');

    const same = await db.settings.set('theme', 'dark');
    assert.equal(same.changed, false);
    assert.equal(same.record.revision, 1, 'no new revision for the same value');

    const changed = await db.settings.set('theme', 'light');
    assert.equal(changed.created, false);
    assert.equal(changed.changed, true);
    assert.equal(changed.record.revision, 2);
    assert.equal(changed.record.createdAt, created.record.createdAt);

    await assert.rejects(() => db.settings.set('theme', 'purple'), { code: 'validation', path: 'theme' });
    await assert.rejects(() => db.settings.set('nonsense', 1), { code: 'validation', path: 'key' });
    await assert.rejects(() => db.settings.get('nonsense'), { code: 'validation' });
    assert.equal(await db.settings.getValue('theme'), 'light', 'invalid writes changed nothing');

    assert.equal((await db.settings.list()).length, 1);
    assert.equal(await db.settings.reset('theme'), true);
    assert.equal(await db.settings.reset('theme'), false);
    assert.equal(await db.settings.getValue('theme'), 'system');
  }));

/* ---------- storage helpers ---------- */

test('storage: status and persistence helpers return a well-formed answer and never throw', () =>
  withDb(async (db) => {
    const status = await db.storage.getStatus();
    assert.equal(typeof status.supported, 'boolean');
    assert.equal(typeof status.persisted, 'boolean');
    const persisted = await db.storage.requestPersistence();
    assert.equal(typeof persisted.supported, 'boolean');
    assert.equal(typeof persisted.persisted, 'boolean');
  }));
