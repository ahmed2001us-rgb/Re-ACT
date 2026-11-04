/**
 * IndexedDB schema definition (declarative; no connection logic here).
 * The opener in Stage 3 reads this and builds object stores and indexes,
 * then runs migrations from src/db/migrations for any later version.
 *
 * Only built-in-library *overrides and custom entries* are stored. Built-in
 * emotions/actions ship in code (src/data) so they can improve with app
 * updates without touching user data.
 */

export const DB_NAME = 'react-db';
export const DB_VERSION = 1;

export const STORES = Object.freeze({
  EPISODES: 'episodes',
  EMOTIONS: 'emotions',
  ACTIONS: 'actions',
  SETTINGS: 'settings',
  META: 'meta',
});

/**
 * @typedef {Object} IndexDef
 * @property {string} name
 * @property {string} keyPath
 * @property {{unique?: boolean, multiEntry?: boolean}} [options]
 *
 * @typedef {Object} StoreDef
 * @property {string} name
 * @property {string} keyPath
 * @property {IndexDef[]} indexes
 */

/** @type {StoreDef[]} */
export const SCHEMA = [
  {
    name: STORES.EPISODES,
    keyPath: 'id',
    indexes: [
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
      { name: 'status', keyPath: 'status' },
      // multiEntry: one record is reachable under each of its emotion ids.
      { name: 'emotionIds', keyPath: 'emotionIds', options: { multiEntry: true } },
      { name: 'tags', keyPath: 'tags', options: { multiEntry: true } },
    ],
  },
  {
    name: STORES.EMOTIONS, // custom emotions only
    keyPath: 'id',
    indexes: [{ name: 'family', keyPath: 'family' }],
  },
  {
    name: STORES.ACTIONS, // custom actions only
    keyPath: 'id',
    indexes: [{ name: 'category', keyPath: 'category' }],
  },
  {
    name: STORES.SETTINGS,
    keyPath: 'key',
    indexes: [],
  },
  {
    name: STORES.META, // installId, schema/data versions, export history
    keyPath: 'key',
    indexes: [],
  },
];
