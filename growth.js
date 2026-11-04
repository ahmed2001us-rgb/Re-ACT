import { h } from '../utils/dom.js';
import { createCard } from '../components/card.js';
import { createEmptyState } from '../components/empty-state.js';

export function render() {
  return h(
    'div',
    { class: 'ra-page' },
    h(
      'div',
      { class: 'ra-page__intro' },
      h('h1', { 'data-page-title': '' }, 'My Growth'),
      h('p', { class: 'ra-page__lede' }, 'Here, growth means awareness and intention. It does not mean feeling better, and there are no points.'),
    ),
    createCard({
      raised: true,
      children: createEmptyState({
        icon: 'growth',
        title: 'Your growth view is still empty',
        message: 'As you record and reflect, this page will describe how your awareness and choices are changing, at your own pace.',
        placeholderNote: 'Placeholder · arrives in Stage 8',
      }),
    }),
  );
}
