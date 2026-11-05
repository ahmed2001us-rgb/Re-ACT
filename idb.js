/** Low-level IndexedDB helpers. Only src/db uses these. */
import { toDbError } from './errors.js';

/** Wrap an IDBRequest in a promise. */
export function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function abort(tx) {
  try {
    tx.abort();
  } catch {
    /* already finished */
  }
}

/**
 * Run `work(tx)` in ONE transaction and resolve only after the transaction has committed
 * (not merely after the last request succeeded), so a resolved write is durable.
 * If `work` throws or rejects, the whole transaction is rolled back and nothing is written.
 * `work` may await IndexedDB requests only; awaiting anything else lets the transaction commit early.
 */
export function runTransaction(db, storeNames, mode, work) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = mode === 'readwrite' ? db.transaction(storeNames, mode, { durability: 'strict' }) : db.transaction(storeNames, mode);
    } catch (error) {
      reject(toDbError(error));
      return;
    }

    let result;
    let failure = null;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? toDbError(tx.error ?? new DOMException('The transaction was aborted.', 'AbortError')));

    let outcome;
    try {
      outcome = work(tx);
    } catch (error) {
      failure = toDbError(error);
      abort(tx);
      return;
    }
    Promise.resolve(outcome).then(
      (value) => {
        result = value;
      },
      (error) => {
        failure = failure ?? toDbError(error);
        abort(tx);
      },
    );
  });
}

/**
 * Walk a cursor over a store or index and collect records.
 * @param {IDBObjectStore|IDBIndex} source
 * @param {IDBKeyRange|null} query
 * @param {IDBCursorDirection} direction
 * @param {{ offset?: number, limit?: number, filter?: (record: any) => boolean }} [options]
 */
export function collect(source, query, direction, { offset = 0, limit = Infinity, filter } = {}) {
  return new Promise((resolve, reject) => {
    const out = [];
    let skipped = 0;
    const request = source.openCursor(query, direction);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      if (filter && !filter(cursor.value)) {
        cursor.continue();
        return;
      }
      if (skipped < offset) {
        skipped += 1;
        cursor.continue();
        return;
      }
      out.push(cursor.value);
      if (out.length >= limit) {
        resolve(out);
        return;
      }
      cursor.continue();
    };
  });
}
