/**
 * The database service: the ONLY public entry point to local storage.
 * Nothing outside src/db touches IndexedDB; other modules import from here
 * (usually through a service in src/services).
 *
 *   import { database } from '../db/index.js';
 *   const episode = await database.episodes.create({ emotions: [{ emotionId: 'anger', intensity: 6 }] });
 */
import { DB_NAME, STORES } from './schema.js';
import { MIGRATIONS } from './migrations/index.js';
import { createConnection } from './connection.js';
import { createEpisodeRepository } from './repositories/episodes.js';
import { createLibraryRepository } from './repositories/library.js';
import { createSettingsRepository } from './repositories/settings.js';
import { emotionModel, actionModel } from '../models/library.js';
import { RecordInUseError } from './in-use.js';
import { promisify } from './idb.js';
import { nowIso } from '../utils/time.js';

export * from './errors.js';
export { DB_NAME, DB_VERSION, STORES, SCHEMA } from './schema.js';

/**
 * Guarantee that every repository operation returns a promise and never throws synchronously
 * (invalid input becomes a rejected promise), so `await`, `.catch()` and `Promise.all` all behave the same.
 */
function settled(repository) {
  return Object.freeze(
    Object.fromEntries(Object.entries(repository).map(([name, operation]) => [name, async (...args) => operation.apply(repository, args)])),
  );
}

/**
 * Create an independent database service. The app uses the shared `database` below;
 * tests create their own with a unique name, an injected clock, or extra migrations.
 *
 * @param {{ name?: string, migrations?: readonly any[], indexedDB?: IDBFactory | null, now?: () => string }} [options]
 */
export function createDatabase({ name = DB_NAME, migrations = MIGRATIONS, indexedDB: factory = globalThis.indexedDB, now = nowIso } = {}) {
  const connection = createConnection({ name, migrations, indexedDB: factory });
  const context = { run: connection.run, now };

  const emotions = createLibraryRepository({
    ...context,
    entity: 'emotion',
    storeName: STORES.EMOTIONS,
    filterIndex: 'family',
    model: emotionModel,
    extraStores: [STORES.EPISODES],
    // A custom emotion that past episodes refer to cannot be removed: those episodes would lose meaning.
    async beforeDelete(tx, record) {
      const used = await promisify(tx.objectStore(STORES.EPISODES).index('emotionIds').count(IDBKeyRange.only(record.id)));
      if (used > 0) throw new RecordInUseError('emotion', used);
    },
  });

  const actionLibrary = createLibraryRepository({
    ...context,
    entity: 'action',
    storeName: STORES.ACTION_LIBRARY,
    filterIndex: 'category',
    model: actionModel,
  });

  return Object.freeze({
    name,
    open: connection.open,
    close: connection.close,
    deleteDatabase: connection.deleteDatabase,
    status: connection.status,
    /** Listen for 'versionchange' (another tab upgraded the database), 'closed' or 'blocked'. */
    subscribe: connection.subscribe,
    episodes: settled(createEpisodeRepository(context)),
    emotions: settled(emotions),
    actionLibrary: settled(actionLibrary),
    settings: settled(createSettingsRepository(context)),
    storage: Object.freeze({ getStatus: getStorageStatus, requestPersistence: requestPersistentStorage }),
  });
}

async function getStorageStatus() {
  const storage = globalThis.navigator?.storage;
  if (!storage) return { supported: false, persisted: false, usage: null, quota: null };
  const persisted = typeof storage.persisted === 'function' ? await storage.persisted().catch(() => false) : false;
  const estimate = typeof storage.estimate === 'function' ? await storage.estimate().catch(() => ({})) : {};
  return { supported: true, persisted, usage: estimate.usage ?? null, quota: estimate.quota ?? null };
}

/** Ask the browser not to evict this site's data under storage pressure. Call after the user has saved something meaningful. */
async function requestPersistentStorage() {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.persist !== 'function') return { supported: false, persisted: false };
  try {
    return { supported: true, persisted: await storage.persist() };
  } catch {
    return { supported: true, persisted: false };
  }
}

/** The shared instance used by the app. */
export const database = createDatabase();
