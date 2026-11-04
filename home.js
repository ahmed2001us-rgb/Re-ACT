import { h } from '../utils/dom.js';
import { getGreeting, formatLongDate, dayOfYear } from '../utils/date.js';
import { createCard } from '../components/card.js';
import { createButton } from '../components/button.js';
import { createEmptyState } from '../components/empty-state.js';

/** Short reminders; one is shown per day (stable for the whole day). Calm, never instructive or pushy. */
const REMINDERS = [
  'Feel without obeying. Understand without escaping. Act with intention.',
  'An emotion is information, not an instruction.',
  'Between the impulse and the action, there is room to choose.',
  'Rest, a boundary, or asking for support can each be a deliberate act.',
  'You can notice what you feel without needing to fix it right now.',
];

export function render() {
  const now = new Date();

  const hero = h(
    'section',
    { class: 'ra-card ra-card--raised ra-hero', 'aria-labelledby': 'home-greeting' },
    h(
      'div',
      { class: 'ra-hero__text' },
      h('p', { class: 'ra-hero__date' }, formatLongDate(now)),
      h('h1', { id: 'home-greeting', 'data-page-title': '' }, getGreeting(now)),
      h('p', { class: 'ra-page__lede' }, 'A quiet place to notice what you feel, and choose how to respond.'),
    ),
    createButton({ label: 'New Episode', href: '#/new-episode', variant: 'primary', size: 'large', icon: 'plus' }),
  );

  const recent = createCard({
    title: 'Recent episodes',
    children: createEmptyState({
      icon: 'inbox',
      title: 'No episodes yet',
      message: 'When you record an episode, the most recent ones will appear here.',
      placeholderNote: 'Placeholder · real episodes arrive in Stage 7',
      compact: true,
      titleLevel: 3,
    }),
  });

  const development = createCard({
    title: 'Emotional development',
    children: createEmptyState({
      icon: 'leaf',
      title: 'Nothing to summarise yet',
      message: 'A gentle overview of your awareness and intentional choices will take shape here over time.',
      placeholderNote: 'Placeholder · summary arrives in Stage 8',
      compact: true,
      titleLevel: 3,
    }),
  });

  const reminder = h(
    'figure',
    { class: 'ra-reminder' },
    h('blockquote', { class: 'ra-reminder__text' }, REMINDERS[dayOfYear(now) % REMINDERS.length]),
  );

  return h('div', { class: 'ra-page' }, hero, h('div', { class: 'ra-grid' }, recent, development), reminder);
}
