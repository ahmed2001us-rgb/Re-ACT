/**
 * Episode workflow on top of the database service. This is what pages call: they never
 * touch src/db directly. Stage 5 (the episode flow) is built on these functions.
 */
import { database } from '../db/index.js';

/** @param {ReturnType<typeof import('../db/index.js').createDatabase>} db */
export function createEpisodeService(db) {
  return {
    /** Begin a new episode as a draft. It is saved immediately, so nothing typed afterwards can be lost. */
    start(initial = {}) {
      return db.episodes.create(initial);
    },

    /**
     * Save progress without finishing. `fields` are episode fields; `currentStep` is where the person is now;
     * `markStepsDone` adds to the steps already finished (merged atomically with what is stored).
     * Pass `expectedRevision` (from the record you last read) to refuse the save if another tab changed it.
     */
    saveProgress(id, fields = {}, { currentStep, markStepsDone = [], expectedRevision } = {}) {
      return db.episodes.update(
        id,
        (current) => {
          const patch = { ...fields };
          if (currentStep !== undefined) patch.currentStep = currentStep;
          if (markStepsDone.length > 0) patch.completedSteps = [...new Set([...current.completedSteps, ...markStepsDone])];
          return patch;
        },
        { expectedRevision },
      );
    },

    complete: (id, options) => db.episodes.complete(id, options),
    reopen: (id, options) => db.episodes.reopen(id, options),
    get: (id) => db.episodes.get(id),
    remove: (id, options) => db.episodes.delete(id, options),

    /** The unfinished episode touched most recently, or null (for "continue where you left off"). */
    async getResumable() {
      const [latest] = await db.episodes.listIncomplete({ limit: 1 });
      return latest ?? null;
    },
    listIncomplete: (options) => db.episodes.listIncomplete(options),
    listRecent: (options) => db.episodes.listRecent(options),

    async counts() {
      const [inProgress, completed] = await Promise.all([db.episodes.count({ status: 'in_progress' }), db.episodes.count({ status: 'completed' })]);
      return { total: inProgress + completed, inProgress, completed };
    },
  };
}

export const episodeService = createEpisodeService(database);
