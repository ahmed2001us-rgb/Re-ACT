import { h } from '../utils/dom.js';
import { formatDateTime } from '../utils/date.js';
import { EPISODE_STATUS } from '../models/enums.js';

/** Short preview of the first thing written, trimmed on a word boundary. */
export function previewText(episode, max = 140) {
  const source = episode.trigger || episode.actualEvent || episode.interpretations?.[0]?.text || episode.outcome?.text || episode.reflection?.text || '';
  const flat = source.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** A name + intensity chip, e.g. "Anger 7". Unknown ids (never expected) read as "Unknown emotion". */
export function createEmotionTag(entry, emotionMap) {
  const name = emotionMap.get(entry.emotionId)?.label ?? 'Unknown emotion';
  return h('li', { class: 'ra-emotag', 'aria-label': `${name}, intensity ${entry.intensity} of 10`, 'data-emotion': entry.emotionId }, h('span', {}, name), h('span', { class: 'ra-emotag__n', 'aria-hidden': 'true' }, entry.intensity));
}

/**
 * One episode in a list. The whole item is a link: completed episodes open to read, drafts open to continue.
 * @param {object} episode
 * @param {Map<string, {label: string}>} emotionMap
 */
export function createEpisodeItem(episode, emotionMap) {
  const draft = episode.status === EPISODE_STATUS.IN_PROGRESS;
  const preview = previewText(episode);
  return h(
    'li',
    { class: 'ra-episode-item', 'data-episode-id': episode.id, 'data-status': episode.status },
    h(
      'a',
      { class: 'ra-episode-item__link', href: draft ? `#/edit-episode?id=${encodeURIComponent(episode.id)}` : `#/episode?id=${encodeURIComponent(episode.id)}` },
      h('span', { class: 'ra-episode-item__top' }, h('time', { datetime: episode.occurredAt }, formatDateTime(episode.occurredAt)), draft ? h('span', { class: 'ra-tag ra-tag--solid' }, 'Draft · continue') : null),
      episode.emotions.length > 0 ? h('ul', { class: 'ra-emotags', 'aria-label': 'Emotions' }, episode.emotions.map((entry) => createEmotionTag(entry, emotionMap))) : h('span', { class: 'ra-episode-item__quiet' }, 'No emotion chosen yet'),
      preview ? h('span', { class: 'ra-episode-item__preview' }, preview) : h('span', { class: 'ra-episode-item__quiet' }, draft ? 'Nothing written yet' : ''),
    ),
  );
}

/** Ten small segments, filled up to `value`. Decorative: the number is always shown as text beside it. */
export function createMeter(value) {
  return h('span', { class: 'ra-meter', 'aria-hidden': 'true' }, Array.from({ length: 10 }, (_, i) => h('span', { class: `ra-meter__seg${i < value ? ' is-on' : ''}` })));
}
