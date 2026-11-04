/**
 * Core data models, expressed as JSDoc typedefs (no runtime code).
 * This file is the single source of truth for entity shapes; the matching
 * IndexedDB stores and indexes are in src/db/schema.js.
 *
 * Conventions: ids are UUID strings; timestamps are ISO-8601 UTC strings;
 * every persisted entity carries `schemaVersion` so records can be migrated.
 */

/**
 * One chosen emotion within an episode, with its own intensity.
 * @typedef {Object} EpisodeEmotion
 * @property {string} emotionId        Key of a built-in emotion or id of a custom one.
 * @property {number} intensity        0–10 whole number.
 */

/**
 * A possible reading of the situation. Always a possibility, never a fact:
 * the UI and engine must present these as "one way to see it".
 * @typedef {Object} Interpretation
 * @property {string} text
 * @property {number} [plausibility]   Optional 0–10 self-rating of how true it feels.
 */

/**
 * An automatic urge felt in the moment (what the emotion wants to do).
 * @typedef {Object} Impulse
 * @property {string} text
 * @property {string} [presetId]       Set when picked from the built-in impulse list.
 */

/**
 * A response the user chose. May come from the action library or be custom.
 * @typedef {Object} ChosenResponse
 * @property {string|null} actionId    Library action key/id, or null for a custom response.
 * @property {string} [customText]
 * @property {string} chosenAt         ISO timestamp.
 */

/**
 * @typedef {Object} Outcome
 * @property {string} [text]
 * @property {'lighter'|'same'|'heavier'|'mixed'|'unsure'} [shift]
 * @property {string} recordedAt       ISO timestamp.
 */

/**
 * @typedef {Object} Reflection
 * @property {string} [text]
 * @property {string} [learned]
 * @property {string} recordedAt       ISO timestamp.
 */

/**
 * An emotional episode: one moment of emotion, understood and responded to.
 * @typedef {Object} Episode
 * @property {string} id
 * @property {number} schemaVersion
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} completedAt         Null until the user finishes the flow.
 * @property {'in_progress'|'completed'} status
 * @property {string} currentStep               One of EPISODE_STEPS; where to resume.
 * @property {string[]} completedSteps          Subset of EPISODE_STEPS already filled in.
 * @property {EpisodeEmotion[]} emotions        Multiple emotions, each with intensity.
 * @property {string[]} emotionIds              Denormalised from `emotions` for indexing.
 * @property {number|null} overallIntensity     Optional 0–10 summary intensity.
 * @property {{text: string, occurredAt?: string}|null} trigger
 * @property {Interpretation[]} interpretations
 * @property {string[]} needs                   Need keys from the library or free text.
 * @property {Impulse[]} impulses
 * @property {ChosenResponse[]} chosenResponses
 * @property {Outcome|null} outcome
 * @property {Reflection|null} reflection
 * @property {string[]} tags
 */

/**
 * An emotion definition. Built-in emotions live in src/data/emotions and are
 * never copied into the database; this shape also describes user-created ones.
 * @typedef {Object} Emotion
 * @property {string} id                        Stable key, e.g. "frustration".
 * @property {string} label
 * @property {'anger'|'sadness'|'fear'|'shame'|'joy'|'calm'|'longing'|'other'} family
 * @property {string} description               Neutral, non-diagnostic.
 * @property {string[]} commonNeeds             Need keys this emotion often points to (possibilities only).
 * @property {string[]} commonImpulses          Impulse preset ids often associated with it.
 * @property {'built_in'|'custom'} source
 * @property {number} schemaVersion
 * @property {string} [createdAt]               Custom entries only.
 */

/**
 * An optional suggested action. Never a prescription.
 * @typedef {Object} ActionSuggestion
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {'rest'|'body'|'expression'|'connection'|'boundary'|'reflection'|'practical'|'support'} category
 * @property {'minimal'|'low'|'medium'} effort
 * @property {string[]} suitableFamilies        Emotion families it suits; empty means any.
 * @property {{min: number, max: number}} intensityRange  0–10 inclusive range it suits.
 * @property {'built_in'|'custom'} source
 * @property {number} schemaVersion
 * @property {string} [createdAt]               Custom entries only.
 */

/**
 * One persisted setting (key/value store).
 * @typedef {Object} Setting
 * @property {string} key                       e.g. "theme", "locale".
 * @property {*} value                          JSON-serialisable.
 * @property {string} updatedAt
 */

export {};
