import initialSchema from './001-initial-schema.js';

/** Ordered list of every migration. Versions must run 1, 2, 3... with no gaps. */
export const MIGRATIONS = Object.freeze([initialSchema]);

/** Programmer-error check: throws a plain Error if a migration list is malformed. */
export function assertValidMigrations(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('At least one migration is required.');
  list.forEach((migration, index) => {
    if (migration.version !== index + 1) throw new Error(`Migration versions must be 1, 2, 3... in order; found ${migration.version} at position ${index + 1}.`);
    if (typeof migration.name !== 'string' || typeof migration.up !== 'function') throw new Error(`Migration ${migration.version} needs a name and an up() function.`);
  });
}
