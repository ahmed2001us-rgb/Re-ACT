/**
 * Episode workflow on top of the database service. This is what pages call: they never
 * touch src/db directly. Stage 5 (the episode flow) is built on these functions.
 */
import { database } from '../db/index.js';
import { createLibraryService } from './library-service.js';

/** @param {ReturnType<typeof import('../db/index.js').createDatabase>} db */
export function createEpisodeService(db, library = createLibraryService(db)) {
  // Ask the browser once, after the first episode has been saved, not to evict this data under storage pressure.
  // Never at start-up (some browsers show a prompt) and never allowed to get in the way of saving.
  let persistenceAsked = false;
  const askForPersistence = () => {
    if (persistenceAsked) return;
    persistenceAsked = true;
    Promise.resolve()
      .then(() => db.storage?.requestPersistence())
      .catch(() => {});
  };

  /** Emotions must exist in the library (built-in or the person's own) before they are stored. */
  const checkEmotions = (fields) => (Array.isArray(fields?.emotions) ? library.assertEmotionsExist(fields.emotions.map((entry) => entry?.emotionId)) : undefined);

  return {
    /** Begin a new episode as a draft. It is saved immediately, so nothing typed afterwards can be lost. */
    async start(initial = {}) {
      await checkEmotions(initial);
      const created = await db.episodes.create(initial);
      askForPersistence();
      return created;
    },

    /**
     * Save a draft. Without `id` a new draft is created; with `id` the existing one is updated.
     * Pass `expectedRevision` (from the record you last saw) to refuse the save if it was changed elsewhere.
     * Saving identical data changes nothing (no new revision).
     */
    async saveDraft({ id = null, fields = {}, expectedRevision } = {}) {
      await checkEmotions(fields);
      const saved = await (id ? db.episodes.update(id, fields, { expectedRevision }) : db.episodes.create(fields));
      askForPersistence();
      return saved;
    },

    /**
     * Save and complete in one step (needs at least one emotion). For an existing draft the last edit and the
     * completion are one transaction. For a new episode, the draft is created first; if completion is then
     * refused the words are still kept as a draft.
     */
    async finish({ id = null, fields = {}, expectedRevision } = {}) {
      await checkEmotions(fields);
      if (id) return db.episodes.complete(id, { expectedRevision, fields });
      const draft = await db.episodes.create(fields);
      askForPersistence();
      return db.episodes.complete(draft.id);
    },

    /** Edit an episode (completed or not) without changing whether it is complete. */
    async saveChanges(id, fields, { expectedRevision } = {}) {
      await checkEmotions(fields);
      return db.episodes.update(id, fields, { expectedRevision });
    },

    /**
     * Save progress without finishing. `fields` are episode fields; `currentStep` is where the person is now;
     * `markStepsDone` adds to the steps already finished (merged atomically with what is stored).
     * Pass `expectedRevision` (from the record you last read) to refuse the save if another tab changed it.
     */
    async saveProgress(id, fields = {}, { currentStep, markStepsDone = [], expectedRevision } = {}) {
      await checkEmotions(fields);
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
