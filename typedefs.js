/**
 * Data model shapes, as JSDoc typedefs (no runtime code). The rules that enforce them are in
 * src/models/*.js (episode.js, library.js, setting.js); the stores and indexes are in src/db/schema.js.
 *
 * Conventions
 *  - ids are UUID strings; timestamps are canonical ISO-8601 UTC strings (`2026-11-04T10:30:00.000Z`)
 *  - every record has `schemaVersion` (for migrations), `revision` (starts at 1, +1 per change) and
 *    `createdAt` / `updatedAt`
 *  - `id`, `revision`, timestamps, `status`, `completedAt` and `emotionIds` are managed by the database:
 *    callers cannot set them
 *  - text is trimmed; blank text is stored as null
 */

/**
 * One emotion within an episode, with its own intensity. Each emotion can appear once per episode.
 * @typedef {Object} EpisodeEmotion
 * @property {string} emotionId        Key of a built-in emotion, or the id of a custom one.
 * @property {number} intensity        Whole number 0–10.
 */

/**
 * A possible reading of the situation. Always a possibility, never a fact.
 * @typedef {Object} Interpretation
 * @property {string} text
 * @property {number} [plausibility]   Optional whole number 0–10: how true it feels.
 */

/**
 * An automatic urge felt in the moment, captured before choosing a response.
 * @typedef {Object} Impulse
 * @property {string} text
 * @property {string} [presetId]       Set when picked from the built-in impulse list.
 */

/**
 * A response the person chose. May come from the action library or be entirely their own.
 * @typedef {Object} ChosenResponse
 * @property {string|null} actionId    Library action id, or null for a custom response.
 * @property {string} text
 * @property {'rest'|'body'|'expression'|'connection'|'boundary'|'reflection'|'practical'|'support'|'other'} category
 * @property {string} chosenAt         Stamped by the database when omitted.
 */

/**
 * @typedef {Object} Outcome
 * @property {string} [text]
 * @property {'lighter'|'same'|'heavier'|'mixed'|'unsure'} [shift]  Neutral vocabulary: no value is "success" or "failure".
 * @property {string} recordedAt       Stamped by the database.
 */

/**
 * @typedef {Object} Reflection
 * @property {string} [text]
 * @property {string} [learned]
 * @property {string} recordedAt       Stamped by the database.
 */

/**
 * An emotional episode: one moment of emotion, understood and responded to.
 * Unfinished episodes are normal: only completing one requires data (at least one emotion).
 *
 * @typedef {Object} Episode
 * @property {string} id
 * @property {number} schemaVersion
 * @property {number} revision
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} occurredAt                When the emotional moment happened (defaults to creation time).
 * @property {'in_progress'|'completed'} status
 * @property {string|null} completedAt          Null while in progress.
 * @property {string} currentStep               One of EPISODE_STEPS: where to resume.
 * @property {string[]} completedSteps          Subset of EPISODE_STEPS already finished.
 * @property {EpisodeEmotion[]} emotions        Several emotions, each with its own intensity.
 * @property {string[]} emotionIds              Derived from `emotions`; indexed for "episodes with emotion X".
 * @property {number|null} overallIntensity     Optional 0–10 summary.
 * @property {string|null} trigger              What set the feeling off.
 * @property {string|null} actualEvent          What actually happened, kept apart from what it meant.
 * @property {Interpretation[]} interpretations Possible readings.
 * @property {string[]} needs                   Underlying needs.
 * @property {Impulse[]} impulses               Immediate impulses.
 * @property {ChosenResponse[]} chosenResponses Responses chosen, each with its category.
 * @property {Outcome|null} outcome
 * @property {Reflection|null} reflection
 * @property {string[]} tags
 */

/**
 * A custom emotion added by the person. Built-in emotions ship in src/data and are never stored.
 * @typedef {Object} Emotion
 * @property {string} id
 * @property {string} label
 * @property {string} labelKey                  Derived; unique, so two entries cannot share a name.
 * @property {'anger'|'sadness'|'fear'|'shame'|'joy'|'calm'|'longing'|'other'} family
 * @property {string|null} description          Neutral, non-diagnostic.
 * @property {string[]} commonNeeds             Possibilities, never facts.
 * @property {string[]} commonImpulses
 * @property {number} schemaVersion
 * @property {number} revision
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * A custom suggested action. Always optional, never a prescription.
 * @typedef {Object} ActionSuggestion
 * @property {string} id
 * @property {string} label
 * @property {string} labelKey                  Derived; unique.
 * @property {string|null} description
 * @property {'rest'|'body'|'expression'|'connection'|'boundary'|'reflection'|'practical'|'support'|'other'} category
 * @property {'minimal'|'low'|'medium'} effort
 * @property {string[]} suitableFamilies        Emotion families it suits; empty means any.
 * @property {{min: number, max: number}} intensityRange  0–10 inclusive range it suits.
 * @property {number} schemaVersion
 * @property {number} revision
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * One persisted setting. Only keys registered in src/models/setting.js are accepted.
 * @typedef {Object} Setting
 * @property {string} key                       e.g. "theme".
 * @property {*} value
 * @property {number} schemaVersion
 * @property {number} revision
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export {};
