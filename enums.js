/**
 * Controlled vocabularies shared by the database, services, engine and UI.
 * Values are stored in IndexedDB, so treat them as part of the data contract:
 * add freely, never rename or remove without a migration (see ARCHITECTURE.md).
 */

/** Lifecycle of an episode. Incomplete episodes are first-class, not errors. */
export const EPISODE_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
});

/**
 * Ordered steps of the episode flow. `Episode.currentStep` and
 * `Episode.completedSteps` use these keys, which lets a user stop at any
 * point and resume later. `outcome` and `reflection` are often filled in
 * hours after the moment itself.
 */
export const EPISODE_STEPS = Object.freeze([
  'emotions',
  'trigger',
  'interpretation',
  'need',
  'impulse',
  'response',
  'outcome',
  'reflection',
]);

/**
 * Broad emotion families used for grouping and for matching suggestions.
 * Families are descriptive groupings only; none is "good" or "bad".
 */
export const EMOTION_FAMILIES = Object.freeze([
  'anger',
  'sadness',
  'fear',
  'shame',
  'joy',
  'calm',
  'longing',
  'other',
]);

/** Categories of suggested action. Rest, boundaries and support are first-class. */
export const ACTION_CATEGORIES = Object.freeze([
  'rest',
  'body',
  'expression',
  'connection',
  'boundary',
  'reflection',
  'practical',
  'support',
]);

/** Rough effort an action asks for, so low-energy states are respected. */
export const ACTION_EFFORT = Object.freeze(['minimal', 'low', 'medium']);

/**
 * How the user describes the shift after acting. Deliberately neutral:
 * no value is "success" or "failure".
 */
export const OUTCOME_SHIFT = Object.freeze(['lighter', 'same', 'heavier', 'mixed', 'unsure']);

/** Origin of a library entry. Built-in entries live in code; custom ones in the DB. */
export const SOURCE = Object.freeze({
  BUILT_IN: 'built_in',
  CUSTOM: 'custom',
});
