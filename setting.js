/**
 * Settings are key/value records. Only registered keys are accepted, so a typo can never
 * create a stray setting. To add a setting: add it here (default + check); no migration needed.
 */
import { THEME_PREFERENCES } from './enums.js';
import { ValidationError } from '../utils/errors.js';

export const SETTING_SCHEMA_VERSION = 1;

export const SETTING_DEFINITIONS = Object.freeze({
  theme: {
    default: 'system',
    check: (value) => THEME_PREFERENCES.includes(value),
    expected: `one of: ${THEME_PREFERENCES.join(', ')}`,
  },
});

/** Throws ValidationError unless `key` is registered and `value` is acceptable for it. */
export function assertSetting(key, value) {
  const definition = SETTING_DEFINITIONS[key];
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(SETTING_DEFINITIONS, key)) {
    throw new ValidationError([{ path: 'key', message: `"${String(key)}" is not a known setting.` }], 'setting');
  }
  if (!definition.check(value)) {
    throw new ValidationError([{ path: key, message: `must be ${definition.expected}.` }], 'setting');
  }
}

export function settingDefault(key) {
  return SETTING_DEFINITIONS[key]?.default;
}
