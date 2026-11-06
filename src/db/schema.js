/**
 * Declarative description of the IndexedDB schema (what the database must look like
 * after ALL migrations have run). The migrations in ./migrations create it; a test
 * compares the real database against this file so the two can never drift apart.
 *
 * Only the user's own records live here. Built-in emotions and actions ship in code
 * (src/data), so app updates can improve them without touching user data.
 */

export const DB_NAME = 'react-db';
export const DB_VERSION = 1;

export const STORES = Object.freeze({
  EPISODES: 'episodes',
  EMOTIONS: 'emotions', // custom emotions only
  ACTION_LIBRARY: 'actionLibrary', // custom actions only
  SETTINGS: 'settings',
});

/**
 * @typedef {{ name: string, keyPath: string | string[], options?: { unique?: boolean, multiEntry?: boolean } }} IndexDef
 * @typedef {{ name: string, keyPath: string, indexes: IndexDef[] }} StoreDef
 */

/** @type {StoreDef[]} */
export const SCHEMA = [
  {
    name: STORES.EPISODES,
    keyPath: 'id',
    indexes: [
      { name: 'occurredAt', keyPath: 'occurredAt' },
      // One record is reachable under each of its emotion ids (IndexedDB cannot index inside an array of objects).
      { name: 'emotionIds', keyPath: 'emotionIds', options: { multiEntry: true } },
      // "Unfinished episodes, most recently touched first."
      { name: 'status_updatedAt', keyPath: ['status', 'updatedAt'] },
    ],
  },
  {
    name: STORES.EMOTIONS,
    keyPath: 'id',
    indexes: [
      { name: 'family', keyPath: 'family' },
      { name: 'labelKey', keyPath: 'labelKey', options: { unique: true } },
    ],
  },
  {
    name: STORES.ACTION_LIBRARY,
    keyPath: 'id',
    indexes: [
      { name: 'category', keyPath: 'category' },
      { name: 'labelKey', keyPath: 'labelKey', options: { unique: true } },
    ],
  },
  { name: STORES.SETTINGS, keyPath: 'key', indexes: [] },
];
