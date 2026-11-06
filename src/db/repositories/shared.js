import { ConflictError, ValidationError } from '../errors.js';
import { UUID_RE } from '../../utils/id.js';

export function assertId(id, entity) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new ValidationError([{ path: 'id', message: 'must be a valid id.' }], entity);
  }
}

export function assertExpectedRevision(expectedRevision) {
  if (expectedRevision !== undefined && !(Number.isInteger(expectedRevision) && expectedRevision >= 1)) {
    throw new ValidationError([{ path: 'expectedRevision', message: 'must be a whole number of 1 or more.' }], 'request');
  }
}

/** Optimistic concurrency: refuse to change a record that someone else changed since it was read. */
export function checkRevision(entity, current, expectedRevision) {
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw new ConflictError(entity, undefined, { reason: 'stale', expected: expectedRevision, actual: current.revision });
  }
}

export function assertPaging({ limit, offset }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new ValidationError([{ path: 'limit', message: 'must be a whole number from 1 to 1000.' }], 'request');
  if (!Number.isInteger(offset) || offset < 0) throw new ValidationError([{ path: 'offset', message: 'must be a whole number of 0 or more.' }], 'request');
}

/** Record without the fields that change on every save, to detect "nothing actually changed". */
export const withoutVersion = (record) => ({ ...record, revision: 0, updatedAt: '' });
