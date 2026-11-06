/**
 * Model factory shared by episodes, custom emotions and custom actions.
 *
 * A model is a set of PURE functions (no database, no clock, no randomness of its own):
 *   buildNew(input, { id, now })            -> a complete, validated record, or throws ValidationError
 *   buildPatch(existing, patch, { now })    -> the updated record, validated as a whole
 *   finalizeRecord(record, { now })         -> re-validate a record after a status change
 *
 * Rules enforced for every model:
 *  - unknown fields are rejected (typos never become silently stored data);
 *  - system-managed fields (id, createdAt, revision, ...) can never be set by callers;
 *  - the merged result is validated as a whole, so a patch cannot leave a record inconsistent;
 *  - input objects are never mutated.
 */
import { ValidationError } from '../utils/errors.js';
import { UUID_RE } from '../utils/id.js';
import { createIssues, isPlainObject } from './validation.js';

const stripUndefined = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

/** ISO strings are fixed-width, so a plain string comparison orders them correctly. */
export const laterOf = (a, b) => (a >= b ? a : b);

/**
 * @param {{
 *   entity: string,
 *   schemaVersion: number,
 *   userFields: string[],
 *   systemFields: string[],
 *   required?: string[],
 *   readers: Record<string, (value: any, path: string, ctx: {issues: any, now: string}) => any>,
 *   defaults: (now: string) => object,
 *   initialSystem?: (now: string) => object,
 *   finalize?: (record: object, ctx: {issues: any, now: string}) => void,
 * }} definition
 */
export function defineModel({ entity, schemaVersion, userFields, systemFields, required = [], readers, defaults, initialSystem = () => ({}), finalize = () => {} }) {
  const fail = (issues) => {
    throw new ValidationError(issues.list, entity);
  };

  function readFields(source, ctx) {
    const out = {};
    for (const key of userFields) {
      if (source[key] === undefined) continue;
      const value = readers[key](source[key], key, ctx);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  function checkKeys(object, { allowId }, issues) {
    for (const key of Object.keys(object)) {
      if (allowId && key === 'id') continue;
      if (userFields.includes(key)) continue;
      if (systemFields.includes(key)) issues.add(key, 'is managed by the app and cannot be set directly.');
      else issues.add(key, 'is not a recognised field.');
    }
  }

  function buildNew(input, { id, now }) {
    const issues = createIssues();
    if (!isPlainObject(input)) fail({ list: [{ path: '', message: `The ${entity} data must be an object.` }] });
    const ctx = { issues, now };

    checkKeys(input, { allowId: true }, issues);

    let recordId = id;
    if (input.id !== undefined) {
      if (typeof input.id === 'string' && UUID_RE.test(input.id)) recordId = input.id;
      else issues.add('id', 'must be a UUID.');
    }

    const merged = { ...defaults(now), ...stripUndefined(input) };
    for (const key of required) {
      if (merged[key] === undefined) issues.add(key, 'is required.');
    }

    const fields = readFields(merged, ctx);
    const record = {
      id: recordId,
      schemaVersion,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ...initialSystem(now),
      ...fields,
    };
    if (issues.ok) finalize(record, ctx);
    if (!issues.ok) fail(issues);
    return record;
  }

  function buildPatch(existing, patch, { now }) {
    const issues = createIssues();
    if (!isPlainObject(patch)) fail({ list: [{ path: '', message: 'The changes must be an object.' }] });
    if (Object.keys(patch).length === 0) fail({ list: [{ path: '', message: 'No changes were provided.' }] });
    // `previous` lets a reader tell a value the person is changing from one that was already stored.
    const ctx = { issues, now, previous: existing };

    checkKeys(patch, { allowId: false }, issues);

    const current = Object.fromEntries(userFields.filter((key) => existing[key] !== undefined).map((key) => [key, existing[key]]));
    const fields = readFields({ ...current, ...stripUndefined(patch) }, ctx);
    const record = {
      ...existing,
      ...fields,
      revision: existing.revision + 1,
      updatedAt: laterOf(now, existing.updatedAt),
    };
    if (issues.ok) finalize(record, ctx);
    if (!issues.ok) fail(issues);
    return record;
  }

  /** Re-validate a record whose system fields were changed by the repository (e.g. completing an episode). */
  function finalizeRecord(record, { now }) {
    const issues = createIssues();
    finalize(record, { issues, now });
    if (!issues.ok) fail(issues);
    return record;
  }

  return { entity, schemaVersion, userFields, systemFields, buildNew, buildPatch, finalizeRecord };
}
