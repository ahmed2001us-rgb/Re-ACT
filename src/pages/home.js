import { h } from '../utils/dom.js';
import { getGreeting, formatLongDate, formatDateTime, dayOfYear } from '../utils/date.js';
import { createCard } from '../components/card.js';
import { createButton } from '../components/button.js';
import { createEmptyState } from '../components/empty-state.js';
import { createEpisodeItem } from '../components/episode-item.js';
import { episodeService } from '../services/episode-service.js';
import { libraryService } from '../services/library-service.js';

/** Short reminders; one is shown per day (stable for the whole day). Calm, never instructive or pushy. */
const REMINDERS = [
  'Feel without obeying. Understand without escaping. Act with intention.',
  'An emotion is information, not an instruction.',
  'Between the impulse and the action, there is room to choose.',
  'Rest, a boundary, or asking for support can each be a deliberate act.',
  'You can notice what you feel without needing to fix it right now.',
];

export async function render() {
  const now = new Date();

  // Everything on this page comes from the local database. If storage is unavailable the page still opens.
  let data = null;
  let problem = null;
  try {
    const [counts, recent, resumable, emotionMap] = await Promise.all([episodeService.counts(), episodeService.listRecent({ limit: 5 }), episodeService.getResumable(), libraryService.getEmotionMap()]);
    data = { counts, recent, resumable, emotionMap };
  } catch (error) {
    console.warn('Home could not read episodes', error);
    problem = error?.message || 'Saved episodes could not be read right now.';
  }

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

  const problemCard = (title) =>
    createCard({
      title,
      children: createEmptyState({ icon: 'compass', title: 'Saved episodes are not available', message: `${problem} Nothing has been lost. You can still write an episode, but it may not be remembered until this is resolved.`, compact: true, titleLevel: 3 }),
    });

  let recent;
  let counts;
  if (problem) {
    recent = problemCard('Recent episodes');
    counts = problemCard('Your episodes');
  } else {
    recent = createCard({
      title: 'Recent episodes',
      className: 'ra-card--recent',
      children:
        data.recent.length === 0
          ? createEmptyState({ icon: 'inbox', title: 'No episodes yet', message: 'When you record an episode, the most recent ones will appear here.', action: createButton({ label: 'Record your first episode', variant: 'secondary', href: '#/new-episode' }), compact: true, titleLevel: 3 })
          : [h('ul', { class: 'ra-episode-list', 'aria-label': 'Recent episodes' }, data.recent.map((episode) => createEpisodeItem(episode, data.emotionMap))), h('div', { class: 'ra-row' }, createButton({ label: 'All episodes', variant: 'ghost', href: '#/episodes' }))],
    });
    const stat = (label, value, href, key) =>
      h('li', { class: 'ra-stat' }, h('a', { class: 'ra-stat__link', href, 'data-stat': key }, h('span', { class: 'ra-stat__n' }, String(value)), h('span', { class: 'ra-stat__label' }, label)));
    counts = createCard({
      title: 'Your episodes',
      children:
        data.counts.total === 0
          ? createEmptyState({ icon: 'leaf', title: 'Nothing recorded yet', message: 'Counts appear here once you have recorded an episode. There is no target to reach.', compact: true, titleLevel: 3 })
          : h('ul', { class: 'ra-stats', 'aria-label': 'Episode counts' }, stat('In total', data.counts.total, '#/episodes', 'total'), stat('Completed', data.counts.completed, '#/episodes?status=completed', 'completed'), stat('Drafts', data.counts.inProgress, '#/episodes?status=in_progress', 'drafts')),
    });
  }

  const resume = data?.resumable
    ? h(
        'aside',
        { class: 'ra-notice ra-notice--soft', 'data-resume-card': '' },
        h('p', {}, `You have an unfinished episode from ${formatDateTime(data.resumable.occurredAt)}. It is saved, and you can pick it up whenever you like.`),
        createButton({ label: 'Continue draft', variant: 'secondary', href: `#/edit-episode?id=${encodeURIComponent(data.resumable.id)}` }),
      )
    : null;

  const reminder = h(
    'figure',
    { class: 'ra-reminder' },
    h('blockquote', { class: 'ra-reminder__text' }, REMINDERS[dayOfYear(now) % REMINDERS.length]),
  );

  return h('div', { class: 'ra-page' }, hero, resume, h('div', { class: 'ra-grid' }, recent, counts), reminder);
}
