/**
 * Connection manager: opens the database, runs migrations, survives other tabs upgrading it.
 * One instance per database name (the app uses one; tests create their own).
 */
import { unavailableError, versionTooNewError, migrationFailedError, toDbError } from './errors.js';
import { runTransaction } from './idb.js';
import { assertValidMigrations } from './migrations/index.js';

/**
 * @param {{ name: string, migrations: readonly any[], indexedDB: IDBFactory | null | undefined }} options
 */
export function createConnection({ name, migrations, indexedDB: factory }) {
  assertValidMigrations(migrations);
  const targetVersion = migrations[migrations.length - 1].version;
  const listeners = new Set();
  /** @type {IDBDatabase | null} */
  let handle = null;
  /** @type {Promise<IDBDatabase> | null} */
  let opening = null;

  const emit = (type) => {
    for (const listener of [...listeners]) {
      try {
        listener({ type, name });
      } catch (error) {
        console.error('Database listener failed', error);
      }
    }
  };

  function open() {
    if (handle) return Promise.resolve(handle);
    if (opening) return opening;

    opening = new Promise((resolve, reject) => {
      if (!factory) {
        reject(unavailableError());
        return;
      }
      let request;
      try {
        request = factory.open(name, targetVersion);
      } catch (error) {
        reject(toDbError(error));
        return;
      }

      let migrationFailure = null;

      request.onupgradeneeded = (event) => {
        const { oldVersion } = event;
        for (const migration of migrations) {
          if (migration.version <= oldVersion || migration.version > targetVersion) continue;
          try {
            migration.up({ db: request.result, transaction: request.transaction, oldVersion });
          } catch (cause) {
            // Aborting rolls the whole upgrade back: the database stays at its old version with its old data.
            migrationFailure = migrationFailedError(migration, cause);
            try {
              request.transaction.abort();
            } catch {
              /* already aborted */
            }
            return;
          }
        }
      };
      request.onblocked = () => emit('blocked');
      request.onerror = (event) => {
        event.preventDefault?.();
        reject(migrationFailure ?? toDbError(request.error));
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab wants to upgrade: close, or its upgrade would be blocked forever.
        db.onversionchange = () => {
          db.close();
          if (handle === db) handle = null;
          emit('versionchange');
        };
        db.onclose = () => {
          if (handle === db) handle = null;
          emit('closed');
        };
        handle = db;
        resolve(db);
      };
    }).finally(() => {
      opening = null;
    });
    return opening;
  }

  function close() {
    if (handle) {
      handle.close();
      handle = null;
    }
  }

  /** Run one transaction, opening (or re-opening) the connection first. */
  async function run(storeNames, mode, work) {
    const db = await open();
    return runTransaction(db, storeNames, mode, work);
  }

  function deleteDatabase() {
    close();
    return new Promise((resolve, reject) => {
      if (!factory) {
        reject(unavailableError());
        return;
      }
      const request = factory.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(toDbError(request.error));
      request.onblocked = () => emit('blocked');
    });
  }

  return {
    open,
    close,
    run,
    deleteDatabase,
    status: () => ({ state: handle ? 'open' : opening ? 'opening' : 'closed', name, version: handle?.version ?? null, targetVersion }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
