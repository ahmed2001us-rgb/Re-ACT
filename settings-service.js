import { database } from '../db/index.js';

/** @param {ReturnType<typeof import('../db/index.js').createDatabase>} db */
export function createSettingsService(db) {
  return {
    /** Stored value, or the default if the person never changed it. */
    get: (key) => db.settings.getValue(key),
    /** The stored record (null if never changed), to tell "chose the default" from "never chose". */
    getRecord: (key) => db.settings.get(key),
    set: (key, value) => db.settings.set(key, value),
    reset: (key) => db.settings.reset(key),
  };
}

export const settingsService = createSettingsService(database);
