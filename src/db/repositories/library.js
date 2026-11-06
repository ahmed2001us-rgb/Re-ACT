/**
 * Generic repository for the two custom-library stores (emotions, actionLibrary).
 * Same safety rules as episodes, plus: names are unique (case/spacing-insensitive).
 */
import { promisify } from '../idb.js';
import { DuplicateError, NotFoundError } from '../errors.js';
import { isPlainObject } from '../../models/validation.js';
import { isDeepEqual } from '../../utils/equal.js';
import { newId } from '../../utils/id.js';
import { assertId, assertExpectedRevision, checkRevision, withoutVersion } from './shared.js';

/**
 * @param {{
 *   entity: string, storeName: string, filterIndex: string, model: any,
 *   run: Function, now: () => string,
 *   extraStores?: string[],
 *   beforeDelete?: (tx: IDBTransaction, record: any) => Promise<void>,
 * }} options
 */
export function createLibraryRepository({ entity, storeName, filterIndex, model, run, now, extraStores = [], beforeDelete }) {
  const stores = [storeName, ...extraStores];

  async function assertNameFree(store, record) {
    const clash = await promisify(store.index('labelKey').get(record.labelKey));
    if (clash && clash.id !== record.id) {
      throw new DuplicateError(entity, `There is already ${/^[aeiou]/i.test(entity) ? 'an' : 'a'} ${entity} called "${clash.label}". Nothing was changed.`);
    }
  }

  return {
    create(input) {
      const record = model.buildNew(input, { id: newId(), now: now() });
      return run(stores, 'readwrite', async (tx) => {
        const store = tx.objectStore(storeName);
        if ((await promisify(store.count(record.id))) > 0) throw new DuplicateError(entity, `A ${entity} with id ${record.id} already exists. Nothing was overwritten.`);
        await assertNameFree(store, record);
        await promisify(store.add(record));
        return record;
      });
    },

    async get(id) {
      assertId(id, entity);
      return (await run(stores, 'readonly', (tx) => promisify(tx.objectStore(storeName).get(id)))) ?? null;
    },

    async getOrThrow(id) {
      const record = await this.get(id);
      if (!record) throw new NotFoundError(entity, id);
      return record;
    },

    /** All entries sorted by name; optionally only those whose `filterIndex` field equals `filter`. */
    async list(filter) {
      const all = await run(stores, 'readonly', (tx) => {
        const store = tx.objectStore(storeName);
        return filter === undefined ? promisify(store.getAll()) : promisify(store.index(filterIndex).getAll(filter));
      });
      return all.sort((a, b) => a.labelKey.localeCompare(b.labelKey));
    },

    update(id, patch, { expectedRevision } = {}) {
      assertId(id, entity);
      assertExpectedRevision(expectedRevision);
      return run(stores, 'readwrite', async (tx) => {
        const store = tx.objectStore(storeName);
        const current = await promisify(store.get(id));
        if (!current) throw new NotFoundError(entity, id);
        checkRevision(entity, current, expectedRevision);
        const fields = typeof patch === 'function' ? patch(structuredClone(current)) : patch;
        if (isPlainObject(fields) && Object.keys(fields).length === 0) return current;
        const next = model.buildPatch(current, fields, { now: now() });
        if (isDeepEqual(withoutVersion(next), withoutVersion(current))) return current;
        await assertNameFree(store, next);
        await promisify(store.put(next));
        return next;
      });
    },

    delete(id, { expectedRevision } = {}) {
      assertId(id, entity);
      assertExpectedRevision(expectedRevision);
      return run(stores, 'readwrite', async (tx) => {
        const store = tx.objectStore(storeName);
        const current = await promisify(store.get(id));
        if (!current) throw new NotFoundError(entity, id);
        checkRevision(entity, current, expectedRevision);
        if (beforeDelete) await beforeDelete(tx, current);
        await promisify(store.delete(id));
        return true;
      });
    },
  };
}
