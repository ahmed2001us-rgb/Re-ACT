/**
 * The emotion library: built-in emotions (src/data) merged with the person's own, stored ones.
 * Pages use this; they never read the stores or the data file directly.
 *
 * Every emotion handed out has the same shape:
 *   { id, label, family, description, aliases, builtin, revision? }
 */
import { database } from '../db/index.js';
import { ValidationError, DuplicateError } from '../db/errors.js';
import { BUILTIN_EMOTIONS, getBuiltinEmotion } from '../data/emotions.js';
import { makeLabelKey } from '../models/library.js';
import { UUID_RE } from '../utils/id.js';

const fromCustom = (record) => ({
  id: record.id,
  label: record.label,
  family: record.family,
  description: record.description,
  aliases: [],
  builtin: false,
  revision: record.revision,
});

const fromBuiltin = (emotion) => ({ ...emotion, aliases: [...emotion.aliases], builtin: true });

/** Plain lower-case text without accents, so "Anxiété" matches "anxiete". */
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Emotions matching a search. Matches the name, aliases and description; every word typed must match
 * somewhere. Name matches come first. An empty search returns everything unchanged.
 */
export function searchEmotions(emotions, query) {
  const words = fold(String(query ?? '')).split(/\s+/).filter(Boolean);
  if (words.length === 0) return emotions;
  const scored = [];
  for (const emotion of emotions) {
    const label = fold(emotion.label);
    const aliases = emotion.aliases.map(fold);
    const description = fold(emotion.description ?? '');
    let score = 0;
    let all = true;
    for (const word of words) {
      if (label.startsWith(word)) score += 4;
      else if (label.includes(word)) score += 3;
      else if (aliases.some((alias) => alias.startsWith(word) || alias.includes(word))) score += 2;
      else if (description.includes(word)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (all) scored.push({ emotion, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.emotion.label.localeCompare(b.emotion.label)).map((entry) => entry.emotion);
}

/** @param {ReturnType<typeof import('../db/index.js').createDatabase>} db */
export function createLibraryService(db) {
  const service = {
    /** Built-in emotions followed by the person's own, each group sorted by name. */
    async listEmotions() {
      let custom = [];
      try {
        custom = await db.emotions.list();
      } catch (error) {
        // Storage is unavailable: the built-in emotions still work, and saving will explain the problem.
        console.warn('Could not read your own emotions', error);
      }
      const builtin = BUILTIN_EMOTIONS.map(fromBuiltin).sort((a, b) => a.label.localeCompare(b.label));
      return [...builtin, ...custom.map(fromCustom)];
    },

    async listCustomEmotions() {
      return (await db.emotions.list()).map(fromCustom);
    },

    /** A Map of id -> emotion, for showing names next to stored emotion ids. */
    async getEmotionMap() {
      return new Map((await service.listEmotions()).map((emotion) => [emotion.id, emotion]));
    },

    async getEmotion(id) {
      const builtin = getBuiltinEmotion(id);
      if (builtin) return fromBuiltin(builtin);
      if (typeof id !== 'string' || !UUID_RE.test(id)) return null; // not built-in, and not the shape of a stored id
      const record = await db.emotions.get(id);
      return record ? fromCustom(record) : null;
    },

    /** Add an emotion of your own. The name cannot repeat a built-in or an existing custom one. */
    async createEmotion({ label, description, family = 'other' } = {}) {
      if (typeof label === 'string') {
        const key = makeLabelKey(label);
        const clash = BUILTIN_EMOTIONS.find((emotion) => makeLabelKey(emotion.label) === key);
        if (clash) throw new DuplicateError('emotion', `"${clash.label}" is already in the library. You can choose it from the list.`);
      }
      const input = { label, family };
      if (description !== undefined) input.description = description;
      return fromCustom(await db.emotions.create(input));
    },

    /** Remove one of your own emotions. Refused (with a calm message) while episodes still use it. */
    deleteEmotion: (id, options) => db.emotions.delete(id, options),

    /** Throws a validation error naming any emotion id that is neither built-in nor one of your own. */
    async assertEmotionsExist(ids) {
      const unknown = [];
      let custom = null;
      for (const id of new Set(ids)) {
        if (getBuiltinEmotion(id)) continue;
        custom ??= new Set((await db.emotions.list()).map((record) => record.id));
        if (!custom.has(id)) unknown.push(id);
      }
      if (unknown.length > 0) {
        throw new ValidationError([{ path: 'emotions', message: 'includes an emotion that is not in the library.' }], 'episode');
      }
    },
  };
  return service;
}

export const libraryService = createLibraryService(database);
