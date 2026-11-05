/**
 * Emotional episode model (pure functions; see typedefs.js for the shape).
 *
 * Incomplete episodes are first-class: an episode may be created empty and filled in over
 * several sessions. Only COMPLETING an episode requires data (at least one emotion).
 */
import { ConflictError } from '../utils/errors.js';
import { EPISODE_STATUS, EPISODE_STEPS, ACTION_CATEGORIES, OUTCOME_SHIFT } from './enums.js';
import { defineModel, laterOf } from './model.js';
import { createIssues, isPlainObject, readString, readOptionalText, readInt, readIso, readEnum, readList, rejectDuplicates, rejectUnknownKeys } from './validation.js';
import { ValidationError } from '../utils/errors.js';

export const EPISODE_SCHEMA_VERSION = 1;

export const LIMITS = Object.freeze({
  longText: 5000,
  shortText: 300,
  id: 100,
  tag: 40,
  tags: 20,
  emotions: 20,
  listItems: 12,
  /** An episode cannot have happened in the future; allow a little clock drift. */
  futureToleranceMs: 5 * 60 * 1000,
});

const USER_FIELDS = [
  'occurredAt',
  'emotions',
  'overallIntensity',
  'trigger',
  'actualEvent',
  'interpretations',
  'needs',
  'impulses',
  'chosenResponses',
  'outcome',
  'reflection',
  'tags',
  'currentStep',
  'completedSteps',
];

const SYSTEM_FIELDS = ['id', 'schemaVersion', 'revision', 'createdAt', 'updatedAt', 'completedAt', 'status', 'emotionIds'];

const text = (max) => (value, path, ctx) => readOptionalText(value, path, ctx.issues, max);

/** Read an object with the given keys, e.g. {text, shift, recordedAt}. */
function readObject(value, path, ctx, allowedKeys) {
  if (!isPlainObject(value)) {
    ctx.issues.add(path, 'must be an object.');
    return false;
  }
  rejectUnknownKeys(value, allowedKeys, path, ctx.issues);
  return true;
}

const readers = {
  occurredAt(value, path, ctx) {
    const iso = readIso(value, path, ctx.issues);
    // An already-stored value is never re-judged against today's clock: if the device clock is corrected
    // backwards, existing episodes must stay editable and completable.
    const unchanged = ctx.previous && ctx.previous.occurredAt === iso;
    if (iso && !unchanged && Date.parse(iso) > Date.parse(ctx.now) + LIMITS.futureToleranceMs) {
      ctx.issues.add(path, 'cannot be in the future.');
      return undefined;
    }
    return iso;
  },

  emotions(value, path, ctx) {
    const items = readList(value, path, ctx.issues, {
      max: LIMITS.emotions,
      item(entry, itemPath) {
        if (!readObject(entry, itemPath, ctx, ['emotionId', 'intensity'])) return undefined;
        const emotionId = readString(entry.emotionId, `${itemPath}.emotionId`, ctx.issues, { max: LIMITS.id, required: true });
        const intensity = readInt(entry.intensity, `${itemPath}.intensity`, ctx.issues, { min: 0, max: 10 });
        return emotionId === undefined || intensity === undefined ? undefined : { emotionId, intensity };
      },
    });
    if (items) rejectDuplicates(items.map((entry) => entry?.emotionId), path, ctx.issues, 'emotion');
    return items;
  },

  overallIntensity(value, path, ctx) {
    return value === null ? null : readInt(value, path, ctx.issues, { min: 0, max: 10 });
  },

  trigger: text(LIMITS.longText),
  actualEvent: text(LIMITS.longText),

  interpretations(value, path, ctx) {
    return readList(value, path, ctx.issues, {
      max: LIMITS.listItems,
      item(entry, itemPath) {
        if (!readObject(entry, itemPath, ctx, ['text', 'plausibility'])) return undefined;
        const body = readString(entry.text, `${itemPath}.text`, ctx.issues, { max: LIMITS.longText, required: true });
        const result = { text: body };
        if (entry.plausibility !== undefined) result.plausibility = readInt(entry.plausibility, `${itemPath}.plausibility`, ctx.issues, { min: 0, max: 10 });
        return body === undefined ? undefined : result;
      },
    });
  },

  needs(value, path, ctx) {
    const items = readList(value, path, ctx.issues, {
      max: LIMITS.listItems,
      item: (entry, itemPath) => readString(entry, itemPath, ctx.issues, { max: LIMITS.shortText, required: true }),
    });
    if (items) rejectDuplicates(items, path, ctx.issues, 'need');
    return items;
  },

  impulses(value, path, ctx) {
    return readList(value, path, ctx.issues, {
      max: LIMITS.listItems,
      item(entry, itemPath) {
        if (!readObject(entry, itemPath, ctx, ['text', 'presetId'])) return undefined;
        const body = readString(entry.text, `${itemPath}.text`, ctx.issues, { max: LIMITS.shortText, required: true });
        const result = { text: body };
        if (entry.presetId !== undefined) result.presetId = readString(entry.presetId, `${itemPath}.presetId`, ctx.issues, { max: LIMITS.id, required: true });
        return body === undefined ? undefined : result;
      },
    });
  },

  chosenResponses(value, path, ctx) {
    return readList(value, path, ctx.issues, {
      max: LIMITS.listItems,
      item(entry, itemPath) {
        if (!readObject(entry, itemPath, ctx, ['actionId', 'text', 'category', 'chosenAt'])) return undefined;
        let actionId = null;
        if (entry.actionId !== undefined && entry.actionId !== null) actionId = readString(entry.actionId, `${itemPath}.actionId`, ctx.issues, { max: LIMITS.id, required: true });
        const body = readString(entry.text, `${itemPath}.text`, ctx.issues, { max: LIMITS.shortText, required: true });
        const category = readEnum(entry.category, `${itemPath}.category`, ctx.issues, ACTION_CATEGORIES);
        const chosenAt = entry.chosenAt === undefined ? ctx.now : readIso(entry.chosenAt, `${itemPath}.chosenAt`, ctx.issues);
        return body === undefined || category === undefined || chosenAt === undefined ? undefined : { actionId, text: body, category, chosenAt };
      },
    });
  },

  outcome(value, path, ctx) {
    if (value === null) return null;
    if (!readObject(value, path, ctx, ['text', 'shift', 'recordedAt'])) return undefined;
    const result = {};
    if (value.text !== undefined) result.text = readOptionalText(value.text, `${path}.text`, ctx.issues, LIMITS.longText);
    if (value.shift !== undefined) result.shift = readEnum(value.shift, `${path}.shift`, ctx.issues, OUTCOME_SHIFT);
    if (!result.text && !result.shift) {
      ctx.issues.add(path, 'needs a description or a shift (or set it to null).');
      return undefined;
    }
    result.recordedAt = value.recordedAt === undefined ? ctx.now : readIso(value.recordedAt, `${path}.recordedAt`, ctx.issues);
    return result;
  },

  reflection(value, path, ctx) {
    if (value === null) return null;
    if (!readObject(value, path, ctx, ['text', 'learned', 'recordedAt'])) return undefined;
    const result = {};
    if (value.text !== undefined) result.text = readOptionalText(value.text, `${path}.text`, ctx.issues, LIMITS.longText);
    if (value.learned !== undefined) result.learned = readOptionalText(value.learned, `${path}.learned`, ctx.issues, LIMITS.longText);
    if (!result.text && !result.learned) {
      ctx.issues.add(path, 'needs some text (or set it to null).');
      return undefined;
    }
    result.recordedAt = value.recordedAt === undefined ? ctx.now : readIso(value.recordedAt, `${path}.recordedAt`, ctx.issues);
    return result;
  },

  tags(value, path, ctx) {
    const items = readList(value, path, ctx.issues, {
      max: LIMITS.tags,
      item: (entry, itemPath) => readString(entry, itemPath, ctx.issues, { max: LIMITS.tag, required: true }),
    });
    if (items) rejectDuplicates(items, path, ctx.issues, 'tag');
    return items;
  },

  currentStep: (value, path, ctx) => readEnum(value, path, ctx.issues, EPISODE_STEPS),

  completedSteps(value, path, ctx) {
    const items = readList(value, path, ctx.issues, { max: EPISODE_STEPS.length, item: (entry, itemPath) => readEnum(entry, itemPath, ctx.issues, EPISODE_STEPS) });
    if (items) rejectDuplicates(items, path, ctx.issues, 'step');
    return items;
  },
};

export const episodeModel = defineModel({
  entity: 'episode',
  schemaVersion: EPISODE_SCHEMA_VERSION,
  userFields: USER_FIELDS,
  systemFields: SYSTEM_FIELDS,
  readers,
  defaults: (now) => ({
    occurredAt: now,
    emotions: [],
    overallIntensity: null,
    trigger: null,
    actualEvent: null,
    interpretations: [],
    needs: [],
    impulses: [],
    chosenResponses: [],
    outcome: null,
    reflection: null,
    tags: [],
    currentStep: EPISODE_STEPS[0],
    completedSteps: [],
  }),
  initialSystem: () => ({ status: EPISODE_STATUS.IN_PROGRESS, completedAt: null }),
  finalize(record, { issues }) {
    // Derived, indexed copy of the emotion ids (IndexedDB cannot index inside an array of objects).
    record.emotionIds = record.emotions.map((entry) => entry.emotionId);
    if (record.status === EPISODE_STATUS.COMPLETED) {
      if (record.emotions.length === 0) issues.add('emotions', 'at least one emotion is needed to complete an episode.');
      if (!record.completedAt) issues.add('completedAt', 'is required for a completed episode.');
    } else if (record.completedAt !== null) {
      issues.add('completedAt', 'must be empty while the episode is in progress.');
    }
  },
});

export const buildNewEpisode = episodeModel.buildNew;
export const buildEpisodePatch = episodeModel.buildPatch;

/** Mark an episode complete. Requires at least one emotion. */
export function buildCompletion(existing, { now }) {
  if (existing.status === EPISODE_STATUS.COMPLETED) throw new ConflictError('episode', 'This episode is already complete.');
  return episodeModel.finalizeRecord(
    { ...existing, status: EPISODE_STATUS.COMPLETED, completedAt: now, revision: existing.revision + 1, updatedAt: laterOf(now, existing.updatedAt) },
    { now },
  );
}

/** Reopen a completed episode so it can be edited as a draft again. */
export function buildReopen(existing, { now }) {
  if (existing.status !== EPISODE_STATUS.COMPLETED) throw new ConflictError('episode', 'This episode is not complete, so it cannot be reopened.');
  return episodeModel.finalizeRecord(
    { ...existing, status: EPISODE_STATUS.IN_PROGRESS, completedAt: null, revision: existing.revision + 1, updatedAt: laterOf(now, existing.updatedAt) },
    { now },
  );
}

export { ValidationError, createIssues };
