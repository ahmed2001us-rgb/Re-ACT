import { STORES } from '../schema.js';
import { promisify } from '../idb.js';
import { assertSetting, settingDefault, SETTING_SCHEMA_VERSION } from '../../models/setting.js';
import { isDeepEqual } from '../../utils/equal.js';

const S = STORES.SETTINGS;

/**
 * Settings are key/value pairs, so setting a value is an explicit update by design.
 * It is still never silent: the result says whether it created or changed anything,
 * and every change bumps the record's revision.
 */
export function createSettingsRepository({ run, now }) {
  return {
    /** The stored record, or null if the user has never changed this setting. */
    async get(key) {
      assertSetting(key, settingDefault(key));
      return (await run([S], 'readonly', (tx) => promisify(tx.objectStore(S).get(key)))) ?? null;
    },

    /** The stored value, or the built-in default. */
    async getValue(key) {
      const record = await this.get(key);
      return record ? record.value : settingDefault(key);
    },

    /** @returns {Promise<{ record: any, created: boolean, changed: boolean }>} */
    async set(key, value) {
      assertSetting(key, value);
      return run([S], 'readwrite', async (tx) => {
        const store = tx.objectStore(S);
        const current = await promisify(store.get(key));
        if (current && isDeepEqual(current.value, value)) return { record: current, created: false, changed: false };
        const stamp = now();
        const record = {
          key,
          schemaVersion: SETTING_SCHEMA_VERSION,
          revision: (current?.revision ?? 0) + 1,
          createdAt: current?.createdAt ?? stamp,
          updatedAt: current && stamp < current.updatedAt ? current.updatedAt : stamp,
          value,
        };
        await promisify(current ? store.put(record) : store.add(record));
        return { record, created: !current, changed: true };
      });
    },

    /** Forget the stored value so the default applies again. Returns whether anything was stored. */
    async reset(key) {
      assertSetting(key, settingDefault(key));
      return run([S], 'readwrite', async (tx) => {
        const store = tx.objectStore(S);
        const existed = (await promisify(store.count(key))) > 0;
        if (existed) await promisify(store.delete(key));
        return existed;
      });
    },

    async list() {
      return run([S], 'readonly', (tx) => promisify(tx.objectStore(S).getAll()));
    },
  };
}
