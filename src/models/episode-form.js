/**
 * Translation between an episode record and the single-page episode form (pure functions, no DOM, no database).
 *
 * The form shows one box per question; the stored episode keeps lists (several possible interpretations,
 * needs, impulses and responses are allowed, and the guided flow of a later stage will use them). Editing
 * through the form therefore changes the FIRST item of each list and keeps any others untouched.
 * Nothing the form does not show (tags, workflow steps) is ever sent, so it is never altered.
 */
import { toLocalInputValue, fromLocalInputValue } from '../utils/date.js';
import { ACTION_CATEGORIES, OUTCOME_SHIFT } from './enums.js';

export const FORM_LIMITS = Object.freeze({ long: 5000, short: 300 });

/** Friendly labels for the vocabularies, so the stored values stay stable while the wording can be refined. */
export const CATEGORY_LABELS = Object.freeze({
  rest: 'Rest',
  body: 'Body or movement',
  expression: 'Expressing it',
  connection: 'Connecting with someone',
  boundary: 'Setting a boundary',
  reflection: 'Reflecting',
  practical: 'Practical action',
  support: 'Asking for support',
  other: 'Something else',
});

export const SHIFT_LABELS = Object.freeze({
  lighter: 'Lighter',
  same: 'About the same',
  heavier: 'Heavier',
  mixed: 'Mixed',
  unsure: 'Not sure',
});

/** The form fields, in the order they appear. `emotions` and `occurred` are handled by their own controls. */
export const TEXT_FIELDS = Object.freeze(['trigger', 'actualEvent', 'interpretation', 'need', 'impulse', 'response', 'outcome', 'reflection']);

/** @param {string} [nowIso] default time for a new episode */
export function emptyForm(nowIso = new Date().toISOString()) {
  return {
    occurred: toLocalInputValue(nowIso),
    emotions: [], // [{ emotionId, intensity }]
    trigger: '',
    actualEvent: '',
    interpretation: '',
    need: '',
    impulse: '',
    response: '',
    responseCategory: '',
    outcome: '',
    outcomeShift: '',
    reflection: '',
  };
}

/** Form values for a stored episode. */
export function episodeToForm(episode) {
  const first = (list) => (Array.isArray(list) && list.length > 0 ? list[0] : null);
  return {
    occurred: toLocalInputValue(episode.occurredAt),
    emotions: episode.emotions.map((entry) => ({ emotionId: entry.emotionId, intensity: entry.intensity })),
    trigger: episode.trigger ?? '',
    actualEvent: episode.actualEvent ?? '',
    interpretation: first(episode.interpretations)?.text ?? '',
    need: first(episode.needs) ?? '',
    impulse: first(episode.impulses)?.text ?? '',
    response: first(episode.chosenResponses)?.text ?? '',
    responseCategory: first(episode.chosenResponses)?.category ?? '',
    outcome: episode.outcome?.text ?? '',
    outcomeShift: episode.outcome?.shift ?? '',
    reflection: episode.reflection?.text ?? '',
  };
}

/** True when nothing has been entered yet. The pre-filled date alone does not count as content. */
export function isFormBlank(form) {
  return form.emotions.length === 0 && TEXT_FIELDS.every((key) => form[key].trim() === '') && form.responseCategory === '' && form.outcomeShift === '';
}

/** True when the two forms hold the same values. */
export function sameForm(a, b) {
  return JSON.stringify(normalised(a)) === JSON.stringify(normalised(b));
}

function normalised(form) {
  return { ...form, emotions: form.emotions.map((e) => [e.emotionId, e.intensity]) };
}

/**
 * Episode fields for a save. `base` is the stored episode (or null for a new one). Values that did not change
 * keep their stored timestamps, so saving the same content twice changes nothing (no new revision).
 */
export function formToFields(form, base = null) {
  const trimmed = (value) => value.trim();
  const fields = {};

  // Date: the input has minute precision, so an untouched date keeps its exact stored value.
  const iso = fromLocalInputValue(form.occurred);
  if (base && toLocalInputValue(base.occurredAt) === form.occurred) fields.occurredAt = base.occurredAt;
  else if (iso) fields.occurredAt = iso;
  else if (form.occurred) fields.occurredAt = form.occurred; // not a real date: let validation explain it

  fields.emotions = form.emotions.map((entry) => ({ emotionId: entry.emotionId, intensity: entry.intensity }));
  fields.trigger = trimmed(form.trigger);
  fields.actualEvent = trimmed(form.actualEvent);

  const rest = (list) => (Array.isArray(list) ? list.slice(1) : []);

  const interpretation = trimmed(form.interpretation);
  const oldInterpretation = base?.interpretations?.[0];
  fields.interpretations = [
    ...(interpretation ? [{ text: interpretation, ...(oldInterpretation?.plausibility !== undefined ? { plausibility: oldInterpretation.plausibility } : {}) }] : []),
    ...rest(base?.interpretations),
  ];

  const need = trimmed(form.need);
  fields.needs = [...(need ? [need] : []), ...rest(base?.needs).filter((other) => other !== need)];

  const impulse = trimmed(form.impulse);
  const oldImpulse = base?.impulses?.[0];
  fields.impulses = [
    ...(impulse ? [{ text: impulse, ...(oldImpulse?.presetId && oldImpulse.text === impulse ? { presetId: oldImpulse.presetId } : {}) }] : []),
    ...rest(base?.impulses),
  ];

  const response = trimmed(form.response);
  const oldResponse = base?.chosenResponses?.[0];
  if (response) {
    const category = form.responseCategory || 'other';
    const entry = { actionId: oldResponse && oldResponse.text === response ? oldResponse.actionId : null, text: response, category };
    if (oldResponse && oldResponse.text === response && oldResponse.category === category) entry.chosenAt = oldResponse.chosenAt;
    fields.chosenResponses = [entry, ...rest(base?.chosenResponses)];
  } else {
    fields.chosenResponses = rest(base?.chosenResponses);
  }

  const outcomeText = trimmed(form.outcome);
  const oldOutcome = base?.outcome;
  if (outcomeText || form.outcomeShift) {
    const outcome = {};
    if (outcomeText) outcome.text = outcomeText;
    if (form.outcomeShift) outcome.shift = form.outcomeShift;
    if (oldOutcome && (oldOutcome.text ?? '') === (outcome.text ?? '') && (oldOutcome.shift ?? '') === (outcome.shift ?? '')) outcome.recordedAt = oldOutcome.recordedAt;
    fields.outcome = outcome;
  } else {
    fields.outcome = null;
  }

  const reflectionText = trimmed(form.reflection);
  const oldReflection = base?.reflection;
  const learned = oldReflection?.learned; // not shown in this form; kept as it is
  if (reflectionText || learned) {
    const reflection = {};
    if (reflectionText) reflection.text = reflectionText;
    if (learned) reflection.learned = learned;
    if (oldReflection && (oldReflection.text ?? '') === (reflection.text ?? '')) reflection.recordedAt = oldReflection.recordedAt;
    fields.reflection = reflection;
  } else {
    fields.reflection = null;
  }

  return fields;
}

/** Which form control a validation issue belongs to (issue paths come from the episode model). */
export function issueToControl(path) {
  const root = String(path).split(/[.[]/)[0];
  return (
    {
      occurredAt: 'occurred',
      emotions: 'emotions',
      trigger: 'trigger',
      actualEvent: 'actualEvent',
      interpretations: 'interpretation',
      needs: 'need',
      impulses: 'impulse',
      chosenResponses: 'response',
      outcome: 'outcome',
      reflection: 'reflection',
    }[root] ?? null
  );
}

export const CATEGORY_OPTIONS = ACTION_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));
export const SHIFT_OPTIONS = OUTCOME_SHIFT.map((value) => ({ value, label: SHIFT_LABELS[value] }));
