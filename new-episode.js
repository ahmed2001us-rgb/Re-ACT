import { h } from '../utils/dom.js';
import { createCard } from '../components/card.js';
import { createButton } from '../components/button.js';
import { createEmptyState } from '../components/empty-state.js';

/** What the flow will walk through (informational only; the flow itself is built in Stage 5). */
const STEPS = [
  'Name what you feel, and how strongly',
  'Describe what set it off',
  'Consider ways of seeing it (possibilities, not facts)',
  'Notice what you might need',
  'Notice the impulse, without obeying it',
  'Choose a response, or none yet',
  'Note what happened',
  'Reflect when you are ready',
];

export function render() {
  return h(
    'div',
    { class: 'ra-page' },
    h(
      'div',
      { class: 'ra-page__intro' },
      h('h1', { 'data-page-title': '' }, 'New Episode'),
      h('p', { class: 'ra-page__lede' }, 'A moment of feeling, understood before it is acted on.'),
    ),
    createCard({
      raised: true,
      children: [
        createEmptyState({
          icon: 'plus',
          title: 'The episode flow is not available yet',
          message: 'Recording an episode is built in a later stage. Nothing here saves any data yet.',
          placeholderNote: 'Placeholder · arrives in Stage 5',
          action: createButton({ label: 'Back to Home', href: '#/home', variant: 'secondary' }),
        }),
      ],
    }),
    createCard({
      title: 'What the flow will guide you through',
      children: h('ol', { class: 'ra-steps' }, STEPS.map((step) => h('li', {}, step))),
    }),
  );
}
