import { STORES } from '../schema.js';
import { promisify, collect } from '../idb.js';
import { DuplicateError, NotFoundError, ValidationError } from '../errors.js';
import { buildNewEpisode, buildEpisodePatch, buildCompletion, buildReopen } from '../../models/episode.js';
import { EPISODE_STATUS } from '../../models/enums.js';
import { isPlainObject } from '../../models/validation.js';
import { isDeepEqual } from '../../utils/equal.js';
import { newId } from '../../utils/id.js';
import { assertId, assertExpectedRevision, checkRevision, assertPaging, withoutVersion } from './shared.js';

const S = STORES.EPISODES;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Start of the given local calendar day (the device's time zone), or throws. */
function localDayStart(key, path) {
  const match = DATE_KEY.exec(key ?? '');
  const date = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!date || date.getMonth() !== Number(match[2]) - 1) {
    throw new ValidationError([{ path, message: 'must be a real date written YYYY-MM-DD.' }], 'request');
  }
  return date;
}

/**
 * @param {{ run: (stores: string[], mode: 'readonly'|'readwrite', work: (tx: IDBTransaction) => any) => Promise<any>, now: () => string }} context
 */
export function createEpisodeRepository({ run, now }) {
  /** Read-modify-write in ONE transaction, so concurrent callers can never lose each other's changes. */
  function mutate(id, { expectedRevision } = {}, change) {
    assertId(id, 'episode');
    assertExpectedRevision(expectedRevision);
    return run([S], 'readwrite', async (tx) => {
      const store = tx.objectStore(S);
      const current = await promisify(store.get(id));
      if (!current) throw new NotFoundError('episode', id);
      checkRevision('episode', current, expectedRevision);
      const next = change(current);
      if (next === current || isDeepEqual(withoutVersion(next), withoutVersion(current))) return current; // nothing changed: no new revision
      await promisify(store.put(next));
      return next;
    });
  }

  return {
    /** Create an episode (a draft by default). Never overwrites: an existing id is rejected. */
    create(input = {}) {
      const record = buildNewEpisode(input, { id: newId(), now: now() });
      return run([S], 'readwrite', async (tx) => {
        const store = tx.objectStore(S);
        if ((await promisify(store.count(record.id))) > 0) throw new DuplicateError('episode', `An episode with id ${record.id} already exists. Nothing was overwritten.`);
        await promisify(store.add(record));
        return record;
      });
    },

    /** The episode, or null if there is none with that id. */
    async get(id) {
      assertId(id, 'episode');
      return (await run([S], 'readonly', (tx) => promisify(tx.objectStore(S).get(id)))) ?? null;
    },

    async getOrThrow(id) {
      const record = await this.get(id);
      if (!record) throw new NotFoundError('episode', id);
      return record;
    },

    /**
     * Change fields. `patch` is an object, or a synchronous function (current) => object that
     * runs inside the transaction (use it for changes that depend on the current value).
     * Pass `expectedRevision` to refuse the change if the record was edited elsewhere meanwhile.
     */
    update(id, patch, options) {
      return mutate(id, options, (current) => {
        const fields = typeof patch === 'function' ? patch(structuredClone(current)) : patch;
        if (isPlainObject(fields) && Object.keys(fields).length === 0) return current;
        return buildEpisodePatch(current, fields, { now: now() });
      });
    },

    /**
     * Mark complete (needs at least one emotion). Already complete -> ConflictError.
     * Pass `fields` to apply a last edit and complete in the SAME transaction, so a failure leaves nothing half-done.
     */
    complete(id, options) {
      const fields = options?.fields;
      return mutate(id, options, (current) => {
        const stamp = now();
        const base = fields && Object.keys(fields).length > 0 ? buildEpisodePatch(current, fields, { now: stamp }) : current;
        const done = buildCompletion(base, { now: stamp });
        // Edit and completion are ONE change, so they count as one revision.
        return { ...done, revision: current.revision + 1 };
      });
    },

    /** Reopen a completed episode as a draft. Not complete -> ConflictError. */
    reopen(id, options) {
      return mutate(id, options, (current) => buildReopen(current, { now: now() }));
    },

    /** Delete permanently. A missing episode is an error, never a silent success. */
    delete(id, { expectedRevision } = {}) {
      assertId(id, 'episode');
      assertExpectedRevision(expectedRevision);
      return run([S], 'readwrite', async (tx) => {
        const store = tx.objectStore(S);
        const current = await promisify(store.get(id));
        if (!current) throw new NotFoundError('episode', id);
        checkRevision('episode', current, expectedRevision);
        await promisify(store.delete(id));
        return true;
      });
    },

    /** Newest first by when the episode happened. Optional status filter and paging. */
    listRecent({ limit = 50, offset = 0, status } = {}) {
      assertPaging({ limit, offset });
      return run([S], 'readonly', (tx) =>
        collect(tx.objectStore(S).index('occurredAt'), null, 'prev', { limit, offset, filter: status ? (record) => record.status === status : undefined }),
      );
    },

    /** Unfinished episodes, most recently touched first (for "continue where you left off"). */
    listIncomplete({ limit = 50, offset = 0 } = {}) {
      assertPaging({ limit, offset });
      const range = IDBKeyRange.bound([EPISODE_STATUS.IN_PROGRESS, ''], [EPISODE_STATUS.IN_PROGRESS, '￿']);
      return run([S], 'readonly', (tx) => collect(tx.objectStore(S).index('status_updatedAt'), range, 'prev', { limit, offset }));
    },

    /** Episodes that include a given emotion, newest first. */
    async listByEmotion(emotionId, { limit = 50, offset = 0 } = {}) {
      assertPaging({ limit, offset });
      if (typeof emotionId !== 'string' || !emotionId) throw new ValidationError([{ path: 'emotionId', message: 'is required.' }], 'request');
      const all = await run([S], 'readonly', (tx) => collect(tx.objectStore(S).index('emotionIds'), IDBKeyRange.only(emotionId), 'next'));
      all.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
      return all.slice(offset, offset + limit);
    },

    /** Episodes from `from` to `to` inclusive, as local calendar days (YYYY-MM-DD), oldest first. */
    listByDateRange(from, to) {
      const start = localDayStart(from, 'from');
      const end = localDayStart(to, 'to');
      if (start > end) throw new ValidationError([{ path: 'from', message: 'cannot be after the end date.' }], 'request');
      end.setDate(end.getDate() + 1);
      const range = IDBKeyRange.bound(start.toISOString(), end.toISOString(), false, true);
      return run([S], 'readonly', (tx) => collect(tx.objectStore(S).index('occurredAt'), range, 'next'));
    },

    count({ status } = {}) {
      return run([S], 'readonly', (tx) => {
        const store = tx.objectStore(S);
        if (!status) return promisify(store.count());
        return promisify(store.index('status_updatedAt').count(IDBKeyRange.bound([status, ''], [status, '￿'])));
      });
    },

    /** Everything, oldest first (used by export). */
    getAll() {
      return run([S], 'readonly', (tx) => promisify(tx.objectStore(S).index('occurredAt').getAll()));
    },
  };
}
