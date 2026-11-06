/**
 * Error types used by the data layer. Every error has a stable `code` (for code to branch on)
 * and a `message` that is safe to show to the person using the app (no internals, no stack).
 * The original browser error, when there is one, is kept on `cause` for diagnostics.
 */

export class DbError extends Error {
  /**
   * @param {string} code
   * @param {string} message  User-safe.
   * @param {{ cause?: unknown, details?: unknown }} [options]
   */
  constructor(code, message, { cause, details } = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (cause !== undefined) this.cause = cause;
    if (details !== undefined) this.details = details;
  }
}

/** Input did not pass validation. Nothing was written. `issues` lists every problem found. */
export class ValidationError extends DbError {
  /** @param {{ path: string, message: string }[]} issues @param {string} [entity] */
  constructor(issues, entity = 'record') {
    const list = issues.map((issue) => (issue.path ? `${issue.path} ${issue.message}` : issue.message));
    super('validation', `The ${entity} could not be saved: ${list.join(' ')}`, { details: { issues } });
    this.issues = issues;
  }
}

/** The record that was asked for does not exist. */
export class NotFoundError extends DbError {
  constructor(entity, id) {
    super('not-found', `That ${entity} could not be found. It may have been deleted.`, { details: { id } });
  }
}

/** A record with the same id (or the same unique name) already exists. Nothing was changed. */
export class DuplicateError extends DbError {
  constructor(entity, message) {
    super('duplicate', message || `This ${entity} already exists. Nothing was changed.`);
  }
}

/** The record changed since it was read (for example in another tab). Nothing was changed. */
export class ConflictError extends DbError {
  constructor(entity, message, details) {
    super('conflict', message || `This ${entity} was changed elsewhere. Reload it and try again.`, { details });
  }
}

/** The browser's storage could not be used (unsupported, full, blocked, newer version...). */
export class StorageError extends DbError {}
