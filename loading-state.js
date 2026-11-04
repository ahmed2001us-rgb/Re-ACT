import { h } from '../utils/dom.js';

/**
 * Loading indicator announced politely to assistive tech.
 * @param {{ label?: string, variant?: 'spinner'|'skeleton' }} props
 */
export function createLoadingState({ label = 'Loading…', variant = 'spinner' } = {}) {
  if (variant === 'skeleton') {
    return h(
      'div',
      { class: 'ra-loading', role: 'status', 'aria-live': 'polite' },
      h('span', { class: 'ra-sr-only' }, label),
      h('div', { class: 'ra-skeleton', 'aria-hidden': 'true' }, h('div', { class: 'ra-skeleton__line' }), h('div', { class: 'ra-skeleton__line' }), h('div', { class: 'ra-skeleton__line' })),
    );
  }
  return h('div', { class: 'ra-loading', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'ra-spinner', 'aria-hidden': 'true' }), h('span', {}, label));
}
