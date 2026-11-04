import { h } from '../utils/dom.js';

/**
 * @param {{
 *   title?: string,
 *   eyebrow?: string,
 *   level?: 1|2|3,
 *   raised?: boolean,
 *   className?: string,
 *   children?: any,
 * }} props
 */
export function createCard({ title, eyebrow, level = 2, raised = false, className = '', children = [] }) {
  const header =
    title || eyebrow
      ? h(
          'div',
          { class: 'ra-card__header' },
          eyebrow ? h('p', { class: 'ra-card__eyebrow' }, eyebrow) : null,
          title ? h(`h${level}`, {}, title) : null,
        )
      : null;

  return h(
    'section',
    { class: ['ra-card', raised ? 'ra-card--raised' : '', className].filter(Boolean).join(' ') },
    header,
    h('div', { class: 'ra-card__body' }, children),
  );
}
