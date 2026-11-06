/**
 * Stage 4 app-layer tests (emotion library, episode service, form mapping). Run inside a real browser against
 * real IndexedDB by tests/e2e-stage4.mjs. Every test uses its own throwaway database.
 */
import { test, assert, runAll } from '../db/harness.js';
import { createDatabase } from '../../src/db/index.js';
import { createLibraryService, searchEmotions } from '../../src/services/library-service.js';
import { createEpisodeService } from '../../src/services/episode-service.js';
import { BUILTIN_EMOTIONS } from '../../src/data/emotions.js';
import { EMOTION_FAMILIES } from '../../src/models/enums.js';
import { emptyForm, episodeToForm, formToFields, isFormBlank, sameForm, issueToControl } from '../../src/models/episode-form.js';
import { toLocalInputValue, fromLocalInputValue } from '../../src/utils/date.js';

export { runAll };

let counter = 0;
async function withServices(fn) {
  const name = `react-app-test-${Date.now()}-${++counter}`;
  const db = createDatabase({ name });
  try {
    await db.open();
    const library = createLibraryService(db);
    const episodes = createEpisodeService(db, library);
    return await fn({ db, library, episodes });
  } finally {
    await db.deleteDatabase().catch(() => {});
  }
}

const REQUESTED = ['Anger', 'Anxiety', 'Fear', 'Sadness', 'Disappointment', 'Frustration', 'Envy', 'Jealousy', 'Guilt', 'Shame', 'Loneliness', 'Boredom', 'Overwhelm', 'Excitement', 'Joy', 'Peace', 'Gratitude', 'Motivation', 'Numbness'];

/* ---------- built-in library and search ---------- */

test('library: contains exactly the 19 requested emotions', () => {
  assert.deepEqual(BUILTIN_EMOTIONS.map((e) => e.label), REQUESTED);
});

test('library: every built-in has a unique id, a valid family and a description', () => {
  assert.equal(new Set(BUILTIN_EMOTIONS.map((e) => e.id)).size, 19);
  for (const e of BUILTIN_EMOTIONS) {
    assert.ok(EMOTION_FAMILIES.includes(e.family), `${e.id} family`);
    assert.ok(e.description && e.description.length > 20, `${e.id} description`);
  }
});

test('library: descriptions stay tentative and non-diagnostic', () => {
  const banned = /\b(disorder|diagnos|illness|patholog|syndrome|disease|symptom|condition)/i;
  for (const e of BUILTIN_EMOTIONS) assert.ok(!banned.test(e.description), `${e.id}: ${e.description}`);
});

test('search: by name, alias, description word, accents, several words, and empty', () => {
  const all = BUILTIN_EMOTIONS.map((e) => ({ ...e, aliases: [...e.aliases], builtin: true }));
  assert.equal(searchEmotions(all, 'anger')[0].id, 'anger');
  assert.equal(searchEmotions(all, 'ANG')[0].id, 'anger', 'prefix, any case');
  assert.equal(searchEmotions(all, 'worried')[0].id, 'anxiety', 'alias');
  assert.equal(searchEmotions(all, 'let down')[0].id, 'disappointment', 'two-word alias');
  const accented = [{ id: 'x', label: 'Anxiété', aliases: [], description: '', builtin: false }];
  assert.equal(searchEmotions(accented, 'anxiete')[0]?.id, 'x', 'accents are ignored in the library');
  assert.equal(searchEmotions(accented, 'ANXIÉTÉ')[0]?.id, 'x', 'and in what is typed');
  assert.ok(searchEmotions(all, 'boundary').some((e) => e.id === 'anger'), 'description word');
  assert.equal(searchEmotions(all, '').length, 19);
  assert.equal(searchEmotions(all, '   ').length, 19);
  assert.equal(searchEmotions(all, 'zzzqq').length, 0);
});

/* ---------- library service: custom emotions ---------- */

test('library service: lists the built-ins, then custom emotions', () =>
  withServices(async ({ library }) => {
    assert.equal((await library.listEmotions()).length, 19);
    const made = await library.createEmotion({ label: 'Restless', description: 'A hard-to-settle energy', family: 'fear' });
    const list = await library.listEmotions();
    assert.equal(list.length, 20);
    assert.equal(list[19].id, made.id);
    assert.equal(list[19].builtin, false);
    assert.equal(list[19].description, 'A hard-to-settle energy');
    assert.equal((await library.getEmotion(made.id)).label, 'Restless');
    assert.equal((await library.getEmotion('anger')).builtin, true);
    assert.equal(await library.getEmotion('nope'), null);
  }));

test('library service: custom emotion names cannot repeat a built-in or each other', () =>
  withServices(async ({ library }) => {
    await assert.rejects(() => library.createEmotion({ label: 'Anger' }), { code: 'duplicate', message: 'built-in' });
    await assert.rejects(() => library.createEmotion({ label: '  aNGer ' }), { code: 'duplicate' });
    await library.createEmotion({ label: 'Restless' });
    await assert.rejects(() => library.createEmotion({ label: 'restless' }), { code: 'duplicate' });
    assert.equal((await library.listCustomEmotions()).length, 1);
  }));

test('library service: invalid custom emotions are rejected and nothing is stored', () =>
  withServices(async ({ library }) => {
    await assert.rejects(() => library.createEmotion({ label: '' }), { code: 'validation', path: 'label' });
    await assert.rejects(() => library.createEmotion({ label: '   ' }), { code: 'validation' });
    await assert.rejects(() => library.createEmotion({ label: 'x'.repeat(81) }), { code: 'validation', path: 'label' });
    await assert.rejects(() => library.createEmotion({ label: 'Ok', family: 'nonsense' }), { code: 'validation', path: 'family' });
    await assert.rejects(() => library.createEmotion({ label: 'Ok', description: 'd'.repeat(501) }), { code: 'validation', path: 'description' });
    assert.equal((await library.listCustomEmotions()).length, 0);
  }));

test('library service: a custom emotion used by an episode cannot be removed; an unused one can', () =>
  withServices(async ({ library, episodes }) => {
    const used = await library.createEmotion({ label: 'Restless' });
    const spare = await library.createEmotion({ label: 'Wistful' });
    const draft = await episodes.saveDraft({ fields: { emotions: [{ emotionId: used.id, intensity: 4 }] } });
    await assert.rejects(() => library.deleteEmotion(used.id), { code: 'conflict', reason: 'in-use' });
    assert.equal((await library.listCustomEmotions()).length, 2, 'still there');
    await library.deleteEmotion(spare.id);
    assert.equal((await library.listCustomEmotions()).length, 1);
    await episodes.remove(draft.id);
    await library.deleteEmotion(used.id);
    assert.equal((await library.listCustomEmotions()).length, 0);
  }));

/* ---------- episode service ---------- */

test('episodes: unknown emotion ids are refused everywhere and nothing is stored', () =>
  withServices(async ({ episodes }) => {
    const bad = { emotions: [{ emotionId: 'not-an-emotion', intensity: 5 }] };
    await assert.rejects(() => episodes.saveDraft({ fields: bad }), { code: 'validation', path: 'emotions' });
    await assert.rejects(() => episodes.start(bad), { code: 'validation', path: 'emotions' });
    await assert.rejects(() => episodes.finish({ fields: bad }), { code: 'validation', path: 'emotions' });
    assert.deepEqual(await episodes.counts(), { total: 0, inProgress: 0, completed: 0 });
    const ok = await episodes.saveDraft({ fields: { emotions: [{ emotionId: 'anger', intensity: 5 }] } });
    await assert.rejects(() => episodes.saveDraft({ id: ok.id, fields: bad }), { code: 'validation', path: 'emotions' });
    await assert.rejects(() => episodes.saveChanges(ok.id, bad), { code: 'validation', path: 'emotions' });
    assert.equal((await episodes.get(ok.id)).emotions[0].emotionId, 'anger', 'unchanged');
  }));

test('episodes: intensity accepts 1 to 10 and refuses 0, 11, fractions and text', () =>
  withServices(async ({ episodes }) => {
    for (const intensity of [1, 2, 9, 10]) {
      const saved = await episodes.saveDraft({ fields: { emotions: [{ emotionId: 'joy', intensity }] } });
      assert.equal(saved.emotions[0].intensity, intensity);
    }
    for (const intensity of [0, -1, 11, 5.5, '5', null, NaN]) {
      await assert.rejects(() => episodes.saveDraft({ fields: { emotions: [{ emotionId: 'joy', intensity }] } }), { code: 'validation', path: 'emotions[0].intensity', message: String(intensity) });
    }
    assert.equal((await episodes.counts()).total, 4, 'refused values created nothing');
  }));

test('episodes: several emotions each keep their own intensity, in order', () =>
  withServices(async ({ episodes, library }) => {
    const mine = await library.createEmotion({ label: 'Restless' });
    const fields = { emotions: [{ emotionId: 'anger', intensity: 8 }, { emotionId: 'sadness', intensity: 3 }, { emotionId: mine.id, intensity: 10 }, { emotionId: 'peace', intensity: 1 }] };
    const saved = await episodes.saveDraft({ fields });
    const again = await episodes.get(saved.id);
    assert.deepEqual(again.emotions, fields.emotions);
    assert.deepEqual(again.emotionIds, ['anger', 'sadness', mine.id, 'peace']);
  }));

test('episodes: all 19 built-in emotions can be chosen together', () =>
  withServices(async ({ episodes }) => {
    const emotions = BUILTIN_EMOTIONS.map((e, i) => ({ emotionId: e.id, intensity: (i % 10) + 1 }));
    const saved = await episodes.saveDraft({ fields: { emotions } });
    assert.deepEqual((await episodes.get(saved.id)).emotions, emotions);
    await assert.rejects(() => episodes.saveDraft({ fields: { emotions: [...emotions, { emotionId: 'anger', intensity: 3 }] } }), { code: 'validation' });
  }));

test('episodes: saveDraft creates, then updates; identical saves change nothing; stale saves are refused', () =>
  withServices(async ({ episodes }) => {
    const a = await episodes.saveDraft({ fields: { trigger: 'one' } });
    assert.equal(a.revision, 1);
    assert.equal(a.status, 'in_progress');
    const b = await episodes.saveDraft({ id: a.id, fields: { trigger: 'two' }, expectedRevision: 1 });
    assert.equal(b.revision, 2);
    const same = await episodes.saveDraft({ id: a.id, fields: { trigger: 'two' }, expectedRevision: 2 });
    assert.equal(same.revision, 2, 'no new revision');
    assert.equal(same.updatedAt, b.updatedAt);
    await assert.rejects(() => episodes.saveDraft({ id: a.id, fields: { trigger: 'three' }, expectedRevision: 1 }), { code: 'conflict', reason: 'stale' });
    assert.equal((await episodes.get(a.id)).trigger, 'two');
    await assert.rejects(() => episodes.saveDraft({ id: 'f'.repeat(8) + '-0000-4000-8000-000000000000', fields: { trigger: 'x' } }), { code: 'not-found' });
    assert.equal((await episodes.counts()).total, 1, 'an unknown id never creates a record');
  }));

test('episodes: persistent storage is requested once, after the first save, and a failure never blocks saving', () =>
  withServices(async ({ db }) => {
    let asked = 0;
    const counting = { ...db, storage: { ...db.storage, requestPersistence: async () => { asked += 1; } } };
    const service = createEpisodeService(counting);
    assert.equal(asked, 0, 'not asked before anything is saved');
    await service.saveDraft({ fields: { trigger: 'first' } });
    await service.saveDraft({ fields: { trigger: 'second' } });
    await service.finish({ fields: { emotions: [{ emotionId: 'joy', intensity: 3 }] } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(asked, 1, 'asked exactly once');
    const failing = createEpisodeService({ ...db, storage: { requestPersistence: async () => { throw new Error('refused'); } } });
    const saved = await failing.saveDraft({ fields: { trigger: 'still saves' } });
    assert.equal(saved.trigger, 'still saves');
  }));

test('episodes: finish completes a new episode in one call', () =>
  withServices(async ({ episodes }) => {
    const done = await episodes.finish({ fields: { emotions: [{ emotionId: 'anxiety', intensity: 6 }], trigger: 'x' } });
    assert.equal(done.status, 'completed');
    assert.ok(done.completedAt);
    assert.deepEqual(await episodes.counts(), { total: 1, inProgress: 0, completed: 1 });
  }));

test('episodes: finishing without an emotion is refused; a new episode stays as a draft with its words', () =>
  withServices(async ({ episodes }) => {
    await assert.rejects(() => episodes.finish({ fields: { trigger: 'kept' } }), { code: 'validation', path: 'emotions' });
    const [draft] = await episodes.listIncomplete();
    assert.equal(draft.trigger, 'kept', 'the words are not lost');
    assert.equal(draft.status, 'in_progress');
  }));

test('episodes: finishing an existing draft is all-or-nothing', () =>
  withServices(async ({ episodes }) => {
    const draft = await episodes.saveDraft({ fields: { trigger: 'before' } });
    await assert.rejects(() => episodes.finish({ id: draft.id, fields: { trigger: 'after' }, expectedRevision: 1 }), { code: 'validation', path: 'emotions' });
    const stored = await episodes.get(draft.id);
    assert.equal(stored.trigger, 'before', 'the failed finish changed nothing');
    assert.equal(stored.revision, 1);
    const ok = await episodes.finish({ id: draft.id, fields: { trigger: 'after', emotions: [{ emotionId: 'joy', intensity: 7 }] }, expectedRevision: 1 });
    assert.equal(ok.status, 'completed');
    assert.equal(ok.trigger, 'after');
    assert.equal(ok.revision, 2, 'edit and completion are a single revision');
    await assert.rejects(() => episodes.finish({ id: draft.id, fields: {} }), { code: 'conflict' });
  }));

test('episodes: saveChanges edits a completed episode and keeps it completed; it cannot lose its last emotion', () =>
  withServices(async ({ episodes }) => {
    const done = await episodes.finish({ fields: { emotions: [{ emotionId: 'guilt', intensity: 4 }] } });
    const edited = await episodes.saveChanges(done.id, { reflection: { text: 'Noticed later' } }, { expectedRevision: done.revision });
    assert.equal(edited.status, 'completed');
    assert.equal(edited.reflection.text, 'Noticed later');
    await assert.rejects(() => episodes.saveChanges(done.id, { emotions: [] }), { code: 'validation', path: 'emotions' });
    assert.equal((await episodes.get(done.id)).emotions.length, 1);
  }));

test('episodes: remove deletes; removing twice is an error, never a silent success', () =>
  withServices(async ({ episodes }) => {
    const e = await episodes.saveDraft({ fields: { trigger: 'x' } });
    assert.equal(await episodes.remove(e.id), true);
    assert.equal(await episodes.get(e.id), null);
    await assert.rejects(() => episodes.remove(e.id), { code: 'not-found' });
  }));

test('episodes: text survives exactly (Arabic, emoji, line breaks, quotes, markup-like text)', () =>
  withServices(async ({ episodes }) => {
    const trigger = 'اجتماع طويل جداً 😤\n"quoted" & <b>not bold</b>\n\tindented';
    const saved = await episodes.saveDraft({ fields: { trigger, actualEvent: 'line one\nline two' } });
    const again = await episodes.get(saved.id);
    assert.equal(again.trigger, trigger.trim());
    assert.equal(again.actualEvent, 'line one\nline two');
  }));

/* ---------- form mapping (pure) ---------- */

const FULL_FORM = () => ({
  occurred: '2026-11-03T16:30',
  emotions: [{ emotionId: 'anger', intensity: 7 }, { emotionId: 'sadness', intensity: 4 }],
  trigger: 'A late meeting',
  actualEvent: 'It ran forty minutes over.',
  interpretation: 'They lost track of time.',
  need: 'Respect for my time',
  impulse: 'Send a sharp email',
  response: 'Took a short walk first',
  responseCategory: 'body',
  outcome: 'Calmer',
  outcomeShift: 'lighter',
  reflection: 'I waited before replying.',
});

test('form: an empty form is blank; the pre-filled date alone is not content', () => {
  const form = emptyForm('2026-11-04T10:00:00.000Z');
  assert.ok(form.occurred.length === 16);
  assert.ok(isFormBlank(form));
  assert.ok(!isFormBlank({ ...form, trigger: 'x' }));
  assert.ok(!isFormBlank({ ...form, emotions: [{ emotionId: 'joy', intensity: 5 }] }));
  assert.ok(!isFormBlank({ ...form, outcomeShift: 'same' }));
  assert.ok(isFormBlank({ ...form, trigger: '   \n ' }), 'whitespace is not content');
});

test('form: a full form round-trips through the database unchanged', () =>
  withServices(async ({ episodes }) => {
    const form = FULL_FORM();
    const saved = await episodes.saveDraft({ fields: formToFields(form, null) });
    assert.deepEqual(episodeToForm(saved), form);
    assert.equal(saved.interpretations[0].text, 'They lost track of time.');
    assert.deepEqual(saved.needs, ['Respect for my time']);
    assert.equal(saved.impulses[0].text, 'Send a sharp email');
    assert.equal(saved.chosenResponses[0].category, 'body');
    assert.equal(saved.outcome.shift, 'lighter');
    assert.equal(saved.reflection.text, 'I waited before replying.');
  }));

test('form: saving unchanged content again is a no-op (no new revision), so autosave never churns the record', () =>
  withServices(async ({ episodes }) => {
    const saved = await episodes.saveDraft({ fields: formToFields(FULL_FORM(), null) });
    const again = await episodes.saveDraft({ id: saved.id, fields: formToFields(episodeToForm(saved), saved), expectedRevision: saved.revision });
    assert.equal(again.revision, saved.revision);
    assert.equal(again.updatedAt, saved.updatedAt);
  }));

test('form: the exact stored time survives an untouched date field (minute precision in the input)', () =>
  withServices(async ({ episodes }) => {
    const iso = '2026-11-03T14:30:42.123Z';
    const saved = await episodes.saveDraft({ fields: { occurredAt: iso } });
    const fields = formToFields(episodeToForm(saved), saved);
    assert.equal(fields.occurredAt, iso);
    const moved = formToFields({ ...episodeToForm(saved), occurred: '2026-11-02T09:15' }, saved);
    assert.equal(moved.occurredAt, new Date(2026, 10, 2, 9, 15).toISOString());
  }));

test('form: editing the first item of a list keeps the other items, plausibility, ids and the unseen learned note', () =>
  withServices(async ({ episodes }) => {
    const base = await episodes.saveDraft({
      fields: {
        emotions: [{ emotionId: 'anger', intensity: 5 }],
        interpretations: [{ text: 'first', plausibility: 6 }, { text: 'second' }],
        needs: ['rest', 'space'],
        impulses: [{ text: 'leave', presetId: 'preset-1' }, { text: 'shout' }],
        chosenResponses: [{ actionId: null, text: 'walk', category: 'body' }, { actionId: null, text: 'text a friend', category: 'connection' }],
        reflection: { text: 'looking back', learned: 'a pause helps' },
        tags: ['work'],
        currentStep: 'need',
        completedSteps: ['emotions', 'trigger'],
      },
    });
    const form = { ...episodeToForm(base), interpretation: 'first, reworded', need: 'quiet', impulse: 'leave', response: 'walk', reflection: 'new words' };
    const fields = formToFields(form, base);
    assert.ok(!('tags' in fields) && !('currentStep' in fields) && !('completedSteps' in fields), 'fields the form does not show are never sent');
    const saved = await episodes.saveDraft({ id: base.id, fields, expectedRevision: base.revision });
    assert.deepEqual(saved.interpretations, [{ text: 'first, reworded', plausibility: 6 }, { text: 'second' }]);
    assert.deepEqual(saved.needs, ['quiet', 'space']);
    assert.deepEqual(saved.impulses, [{ text: 'leave', presetId: 'preset-1' }, { text: 'shout' }]);
    assert.equal(saved.chosenResponses.length, 2);
    assert.equal(saved.chosenResponses[0].chosenAt, base.chosenResponses[0].chosenAt, 'unchanged response keeps its time');
    assert.deepEqual(saved.reflection.learned, 'a pause helps');
    assert.deepEqual(saved.tags, ['work']);
    assert.equal(saved.currentStep, 'need');
    assert.deepEqual(saved.completedSteps, ['emotions', 'trigger']);
  }));

test('form: clearing a box clears that stored value; whitespace-only counts as empty', () =>
  withServices(async ({ episodes }) => {
    const base = await episodes.saveDraft({ fields: formToFields(FULL_FORM(), null) });
    const cleared = { ...episodeToForm(base), trigger: '   ', interpretation: '', need: '', impulse: '', response: '', responseCategory: 'body', outcome: '', outcomeShift: '', reflection: '' };
    const saved = await episodes.saveDraft({ id: base.id, fields: formToFields(cleared, base), expectedRevision: base.revision });
    assert.equal(saved.trigger, null);
    assert.deepEqual(saved.interpretations, []);
    assert.deepEqual(saved.needs, []);
    assert.deepEqual(saved.impulses, []);
    assert.deepEqual(saved.chosenResponses, []);
    assert.equal(saved.outcome, null);
    assert.equal(saved.reflection, null);
  }));

test('form: a response without a category is filed under "other"; an outcome can be a shift alone', () =>
  withServices(async ({ episodes }) => {
    const form = { ...emptyForm(), response: 'Slept on it', outcomeShift: 'unsure' };
    const saved = await episodes.saveDraft({ fields: formToFields(form, null) });
    assert.equal(saved.chosenResponses[0].category, 'other');
    assert.deepEqual({ shift: saved.outcome.shift, text: saved.outcome.text }, { shift: 'unsure', text: undefined });
  }));

test('form: sameForm compares values, and issue paths map to form controls', () => {
  assert.ok(sameForm(FULL_FORM(), FULL_FORM()));
  assert.ok(!sameForm(FULL_FORM(), { ...FULL_FORM(), trigger: 'other' }));
  assert.ok(!sameForm(FULL_FORM(), { ...FULL_FORM(), emotions: [{ emotionId: 'anger', intensity: 6 }, { emotionId: 'sadness', intensity: 4 }] }));
  assert.equal(issueToControl('emotions[0].intensity'), 'emotions');
  assert.equal(issueToControl('occurredAt'), 'occurred');
  assert.equal(issueToControl('chosenResponses[0].text'), 'response');
  assert.equal(issueToControl('somethingElse'), null);
});

test('form: validation problems come back as issues the form can show (future date, over-long text)', () =>
  withServices(async ({ episodes }) => {
    const future = { ...emptyForm(), occurred: '2099-01-01T10:00', trigger: 'x' };
    const error = await assert.rejects(() => episodes.saveDraft({ fields: formToFields(future, null) }), { code: 'validation', path: 'occurredAt' });
    assert.ok(error.issues.some((i) => issueToControl(i.path) === 'occurred'));
    await assert.rejects(() => episodes.saveDraft({ fields: formToFields({ ...emptyForm(), impulse: 'x'.repeat(301) }, null) }), { code: 'validation', path: 'impulses' });
    await assert.rejects(() => episodes.saveDraft({ fields: formToFields({ ...emptyForm(), trigger: 'x'.repeat(5001) }, null) }), { code: 'validation', path: 'trigger' });
    assert.equal((await episodes.counts()).total, 0);
  }));

test('dates: local input values round-trip; impossible dates are refused', () => {
  const iso = new Date(2026, 10, 4, 13, 20).toISOString();
  assert.equal(toLocalInputValue(iso), '2026-11-04T13:20');
  assert.equal(fromLocalInputValue('2026-11-04T13:20'), iso);
  assert.equal(fromLocalInputValue('2026-02-30T10:00'), null);
  assert.equal(fromLocalInputValue(''), null);
  assert.equal(fromLocalInputValue('garbage'), null);
  assert.equal(toLocalInputValue('nope'), '');
});
