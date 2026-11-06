/**
 * Migration 1: create the initial stores and indexes.
 *
 * Migrations are history. Never edit one after release and never read the live SCHEMA
 * from here (it describes the latest version, not this one). To change the schema, add
 * a new migration file and register it in ./index.js.
 *
 * `up` runs inside the versionchange transaction, so it must use IndexedDB requests only
 * (no awaiting anything else), or the transaction would commit early.
 */
export default {
  version: 1,
  name: 'initial-schema',
  up({ db }) {
    const episodes = db.createObjectStore('episodes', { keyPath: 'id' });
    episodes.createIndex('occurredAt', 'occurredAt');
    episodes.createIndex('emotionIds', 'emotionIds', { multiEntry: true });
    episodes.createIndex('status_updatedAt', ['status', 'updatedAt']);

    const emotions = db.createObjectStore('emotions', { keyPath: 'id' });
    emotions.createIndex('family', 'family');
    emotions.createIndex('labelKey', 'labelKey', { unique: true });

    const actionLibrary = db.createObjectStore('actionLibrary', { keyPath: 'id' });
    actionLibrary.createIndex('category', 'category');
    actionLibrary.createIndex('labelKey', 'labelKey', { unique: true });

    db.createObjectStore('settings', { keyPath: 'key' });
  },
};
