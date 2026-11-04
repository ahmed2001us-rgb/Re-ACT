import { h } from '../utils/dom.js';
import { createCard } from '../components/card.js';
import { createButton } from '../components/button.js';
import { createEmptyState } from '../components/empty-state.js';

export function render() {
  return h(
    'div',
    { class: 'ra-page' },
    h(
      'div',
      { class: 'ra-page__intro' },
      h('h1', { 'data-page-title': '' }, 'My Patterns'),
      h('p', { class: 'ra-page__lede' }, 'Recurring emotions, triggers and impulses, shown as observations rather than judgements.'),
    ),
    createCard({
      raised: true,
      children: createEmptyState({
        icon: 'patterns',
        title: 'No patterns to show yet',
        message: 'Patterns can only appear after you have recorded some episodes. There is no minimum and no pressure.',
        placeholderNote: 'Placeholder · arrives in Stage 7',
        action: createButton({ label: 'Go to New Episode', href: '#/new-episode', variant: 'secondary' }),
      }),
    }),
  );
}
