/**
 * Custom emotions and custom actions (the user's own additions to the built-in libraries).
 * Built-in entries ship in code (src/data); only these custom ones are stored.
 * Built on the same model factory as episodes, so they get the same safety rules.
 */
import { EMOTION_FAMILIES, ACTION_CATEGORIES, ACTION_EFFORT } from './enums.js';
import { defineModel } from './model.js';
import { isPlainObject, readString, readOptionalText, readInt, readEnum, readList, rejectDuplicates, rejectUnknownKeys } from './validation.js';

export const LIBRARY_SCHEMA_VERSION = 1;

export const LIBRARY_LIMITS = Object.freeze({ label: 80, description: 500, listItems: 12, listItemLength: 60 });

/** Case-, spacing- and Unicode-form-insensitive key used to stop two entries sharing a name. */
export function makeLabelKey(label) {
  return label.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const SYSTEM_FIELDS = ['id', 'schemaVersion', 'revision', 'createdAt', 'updatedAt', 'labelKey'];

const label = (value, path, ctx) => readString(value, path, ctx.issues, { max: LIBRARY_LIMITS.label, required: true });
const description = (value, path, ctx) => readOptionalText(value, path, ctx.issues, LIBRARY_LIMITS.description);

function stringList(what) {
  return (value, path, ctx) => {
    const items = readList(value, path, ctx.issues, {
      max: LIBRARY_LIMITS.listItems,
      item: (entry, itemPath) => readString(entry, itemPath, ctx.issues, { max: LIBRARY_LIMITS.listItemLength, required: true }),
    });
    if (items) rejectDuplicates(items, path, ctx.issues, what);
    return items;
  };
}

export const emotionModel = defineModel({
  entity: 'emotion',
  schemaVersion: LIBRARY_SCHEMA_VERSION,
  userFields: ['label', 'family', 'description', 'commonNeeds', 'commonImpulses'],
  systemFields: SYSTEM_FIELDS,
  required: ['label', 'family'],
  readers: {
    label,
    family: (value, path, ctx) => readEnum(value, path, ctx.issues, EMOTION_FAMILIES),
    description,
    commonNeeds: stringList('need'),
    commonImpulses: stringList('impulse'),
  },
  defaults: () => ({ description: null, commonNeeds: [], commonImpulses: [] }),
  finalize(record) {
    record.labelKey = makeLabelKey(record.label);
  },
});

export const actionModel = defineModel({
  entity: 'action',
  schemaVersion: LIBRARY_SCHEMA_VERSION,
  userFields: ['label', 'description', 'category', 'effort', 'suitableFamilies', 'intensityRange'],
  systemFields: SYSTEM_FIELDS,
  required: ['label', 'category'],
  readers: {
    label,
    description,
    category: (value, path, ctx) => readEnum(value, path, ctx.issues, ACTION_CATEGORIES),
    effort: (value, path, ctx) => readEnum(value, path, ctx.issues, ACTION_EFFORT),
    suitableFamilies(value, path, ctx) {
      const items = readList(value, path, ctx.issues, {
        max: EMOTION_FAMILIES.length,
        item: (entry, itemPath) => readEnum(entry, itemPath, ctx.issues, EMOTION_FAMILIES),
      });
      if (items) rejectDuplicates(items, path, ctx.issues, 'family');
      return items;
    },
    intensityRange(value, path, ctx) {
      if (!isPlainObject(value)) {
        ctx.issues.add(path, 'must be an object with min and max.');
        return undefined;
      }
      rejectUnknownKeys(value, ['min', 'max'], path, ctx.issues);
      const min = readInt(value.min, `${path}.min`, ctx.issues, { min: 0, max: 10 });
      const max = readInt(value.max, `${path}.max`, ctx.issues, { min: 0, max: 10 });
      if (min !== undefined && max !== undefined && min > max) {
        ctx.issues.add(path, 'min cannot be greater than max.');
        return undefined;
      }
      return min === undefined || max === undefined ? undefined : { min, max };
    },
  },
  defaults: () => ({ description: null, effort: 'low', suitableFamilies: [], intensityRange: { min: 0, max: 10 } }),
  finalize(record) {
    record.labelKey = makeLabelKey(record.label);
  },
});
