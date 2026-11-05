import { ConflictError } from '../utils/errors.js';

/** Refusing to delete something that other records still refer to. */
export class RecordInUseError extends ConflictError {
  constructor(entity, count) {
    super(entity, `This ${entity} is used by ${count} episode${count === 1 ? '' : 's'}, so it was not removed.`, { reason: 'in-use', count });
  }
}
