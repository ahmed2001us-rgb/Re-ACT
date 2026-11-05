import { DbError, StorageError, DuplicateError } from '../utils/errors.js';

export * from '../utils/errors.js';

/** Messages are calm and safe to show to the person using the app. */
export const unavailableError = (cause) =>
  new StorageError('unavailable', "Saving on this device isn't available in this browser right now.", { cause });

export const versionTooNewError = (cause) =>
  new StorageError('version-too-new', 'Your saved data was created by a newer version of RE:ACT. Reload to get the latest version.', { cause });

export const migrationFailedError = (migration, cause) =>
  new StorageError('migration-failed', 'Your saved data could not be updated. Nothing was lost; please try again.', {
    cause,
    details: { version: migration.version, name: migration.name },
  });

/** Translate a raw browser error into one of our errors. Our own errors pass through unchanged. */
export function toDbError(error) {
  if (error instanceof DbError) return error;
  switch (error?.name) {
    case 'QuotaExceededError':
      return new StorageError('quota', "There isn't enough storage space on this device to save this.", { cause: error });
    case 'VersionError':
      return versionTooNewError(error);
    case 'SecurityError':
      return unavailableError(error);
    case 'ConstraintError': {
      const duplicate = new DuplicateError('record');
      duplicate.cause = error;
      return duplicate;
    }
    default:
      return new StorageError('transaction', 'Something went wrong while saving. Nothing was changed.', { cause: error });
  }
}
