/**
 * Built-in emotion library. Ships in code and is never copied into the database: only the person's
 * own additions are stored (see ARCHITECTURE.md). The `id` is the stable key stored in episodes, so
 * never rename or remove one; add freely.
 *
 * Descriptions are neutral and tentative: an emotion is information, not a verdict, and none is good or bad.
 * `aliases` only help search ("mad" finds Anger); they are never shown as definitions.
 */

/** Friendly names for the emotion families (used when adding an emotion of your own). */
export const FAMILY_LABELS = Object.freeze({
  anger: 'Anger and frustration',
  sadness: 'Sadness and loss',
  fear: 'Fear and worry',
  shame: 'Shame and guilt',
  joy: 'Joy and excitement',
  calm: 'Calm and peace',
  longing: 'Longing and wanting',
  other: 'Something else, or not sure',
});

const e = (id, label, family, description, aliases) => Object.freeze({ id, label, family, description, aliases: Object.freeze(aliases) });

export const BUILTIN_EMOTIONS = Object.freeze([
  e('anger', 'Anger', 'anger', 'A strong feeling that often comes up when something seems unfair, disrespectful, or in the way. It can carry energy to protect a boundary.', ['mad', 'furious', 'rage', 'irritated', 'resentful', 'angry']),
  e('anxiety', 'Anxiety', 'fear', 'A tense, uneasy feeling about something uncertain that may happen. The body often feels keyed up.', ['worry', 'worried', 'nervous', 'uneasy', 'on edge', 'dread', 'anxious']),
  e('fear', 'Fear', 'fear', 'A response to something that feels threatening or unsafe, right now or soon.', ['scared', 'afraid', 'frightened', 'terrified', 'panic']),
  e('sadness', 'Sadness', 'sadness', 'A heavy, tender feeling that often follows a loss, a change, or something that mattered not going as hoped.', ['sad', 'down', 'low', 'grief', 'hurt', 'blue', 'tearful']),
  e('disappointment', 'Disappointment', 'sadness', 'The feeling when a hope or an expectation is not met.', ['let down', 'letdown', 'deflated', 'discouraged', 'disappointed']),
  e('frustration', 'Frustration', 'anger', 'Irritation at being stuck, blocked, or unable to get through something that seems like it should be simpler.', ['annoyed', 'irritated', 'fed up', 'stuck', 'exasperated', 'frustrated']),
  e('envy', 'Envy', 'longing', 'Wanting something someone else has: an object, a quality, or a way of living.', ['covet', 'comparison', 'wish i had', 'envious']),
  e('jealousy', 'Jealousy', 'fear', 'An uneasy, guarded feeling about possibly losing something or someone important to you.', ['possessive', 'insecure', 'threatened', 'suspicious', 'jealous']),
  e('guilt', 'Guilt', 'shame', 'A feeling that you acted against your own values or hurt someone, often with an urge to make it right.', ['remorse', 'regret', 'sorry', 'bad about', 'guilty']),
  e('shame', 'Shame', 'shame', 'A painful feeling about who you are rather than what you did, often with an urge to hide or pull away.', ['embarrassed', 'humiliated', 'exposed', 'small', 'unworthy', 'ashamed']),
  e('loneliness', 'Loneliness', 'longing', 'A sense of missing connection or understanding. It can happen alone or in a crowd.', ['lonely', 'alone', 'isolated', 'disconnected', 'left out']),
  e('boredom', 'Boredom', 'other', 'A flat or restless feeling when nothing seems to engage you. It can point to a wish for meaning or stimulation.', ['bored', 'restless', 'uninterested', 'apathy', 'flat']),
  e('overwhelm', 'Overwhelm', 'other', 'A feeling that there is more to handle than you have room for right now.', ['overwhelmed', 'too much', 'swamped', 'overloaded', 'stressed']),
  e('excitement', 'Excitement', 'joy', 'An energised, forward-leaning feeling about something you are looking forward to.', ['thrilled', 'eager', 'anticipation', 'enthusiastic', 'excited']),
  e('joy', 'Joy', 'joy', 'A warm, bright feeling of delight or fullness.', ['happy', 'happiness', 'delight', 'glad', 'cheerful']),
  e('peace', 'Peace', 'calm', 'A settled, quiet feeling of ease, where little needs to change.', ['calm', 'content', 'relaxed', 'serene', 'at ease', 'peaceful']),
  e('gratitude', 'Gratitude', 'joy', 'A warm appreciation for someone, something, or what you have.', ['thankful', 'appreciative', 'grateful', 'blessed']),
  e('motivation', 'Motivation', 'other', 'A felt push or pull toward doing something that matters to you.', ['driven', 'inspired', 'determined', 'energised', 'ambitious', 'motivated']),
  e('numbness', 'Numbness', 'other', 'A muted or blank feeling, as if feelings are far away or turned down. It can happen when there is a lot to feel.', ['numb', 'empty', 'blank', 'detached', 'nothing']),
]);

const BY_ID = new Map(BUILTIN_EMOTIONS.map((emotion) => [emotion.id, emotion]));

export const getBuiltinEmotion = (id) => BY_ID.get(id) ?? null;
