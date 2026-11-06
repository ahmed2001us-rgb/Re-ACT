import { h } from '../utils/dom.js';
import { createIcon } from './icons.js';

/**
 * Empty state. `placeholderNote` visibly marks content that a later stage will
 * replace with real data, so nothing looks finished that is not.
 * @param {{ icon?: string, title: string, message?: string, action?: Node, placeholderNote?: string, compact?: boolean, titleLevel?: 2|3 }} props
 */
export function createEmptyState({ icon = 'inbox', title, message, action, placeholderNote, compact = false, titleLevel = 2 }) {
  return h(
    'div',
    { class: `ra-empty${compact ? ' ra-empty--compact' : ''}` },
    h('div', { class: 'ra-empty__icon' }, createIcon(icon)),
    h(`h${titleLevel}`, { class: 'ra-empty__title' }, title),
    message ? h('p', { class: 'ra-empty__message' }, message) : null,
    action || null,
    placeholderNote ? h('span', { class: 'ra-tag' }, placeholderNote) : null,
  );
}
