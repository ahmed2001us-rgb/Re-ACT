import { h } from '../utils/dom.js';
import { createCard } from '../components/card.js';
import { createButton } from '../components/button.js';
import { createEmptyState } from '../components/empty-state.js';
import { createSegmented } from '../components/input.js';
import { createEpisodeItem } from '../components/episode-item.js';
import { episodeService } from '../services/episode-service.js';
import { libraryService } from '../services/library-service.js';
import { getRouteParams } from '../app/router.js';

const PAGE = 20;
const FILTERS = [
  { value: '', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'in_progress', label: 'Drafts' },
];

/** Every episode, newest first, with a simple status filter. Open one to read, edit or delete it. */
export async function render() {
  const requested = getRouteParams().get('status') ?? '';
  let status = FILTERS.some((filter) => filter.value === requested) ? requested : '';
  let items = [];
  let finished = false;
  let token = 0;

  const list = h('ul', { class: 'ra-episode-list', 'aria-label': 'Episodes' });
  const summary = h('p', { class: 'ra-page__lede', 'aria-live': 'polite', 'data-episodes-summary': '' });
  const more = createButton({ label: 'Show more', variant: 'secondary', onClick: () => loadPage() });
  const empty = h('div', { 'data-episodes-empty': '', hidden: true });
  const body = h('div', { class: 'ra-stack' }, list, empty, h('div', { class: 'ra-row' }, more));
  let emotionMap = new Map();

  const filter = createSegmented({
    legend: 'Show',
    name: 'episode-filter',
    value: status,
    options: FILTERS,
    onChange: (value) => {
      status = value;
      history.replaceState(null, '', value ? `#/episodes?status=${value}` : '#/episodes');
      loadPage(true);
    },
  });

  async function loadPage(reset = false) {
    const run = ++token;
    if (reset) {
      items = [];
      finished = false;
    }
    try {
      const [batch, counts] = await Promise.all([episodeService.listRecent({ limit: PAGE, offset: items.length, status: status || undefined }), episodeService.counts()]);
      if (run !== token) return;
      const known = new Set(emotionMap.keys());
      if (batch.some((episode) => episode.emotions.some((entry) => !known.has(entry.emotionId)))) emotionMap = await libraryService.getEmotionMap();
      items = [...items, ...batch];
      finished = batch.length < PAGE;
      const total = status === 'completed' ? counts.completed : status === 'in_progress' ? counts.inProgress : counts.total;
      summary.textContent = total === 0 ? '' : `${total} ${total === 1 ? 'episode' : 'episodes'}${status === 'in_progress' ? ' in progress' : status === 'completed' ? ' completed' : ''}.`;
      draw();
    } catch (error) {
      if (run !== token) return;
      summary.textContent = '';
      list.replaceChildren();
      more.hidden = true;
      empty.hidden = false;
      empty.replaceChildren(createEmptyState({ icon: 'compass', title: 'Episodes could not be loaded', message: error?.message || 'Nothing was lost. Try again in a moment.', action: createButton({ label: 'Try again', variant: 'primary', onClick: () => loadPage(true) }), compact: true, titleLevel: 2 }));
    }
  }

  function draw() {
    list.replaceChildren(...items.map((episode) => createEpisodeItem(episode, emotionMap)));
    more.hidden = finished || items.length === 0;
    empty.hidden = items.length > 0;
    if (items.length === 0) {
      empty.replaceChildren(
        createEmptyState({
          icon: 'inbox',
          title: status === 'in_progress' ? 'No drafts' : status === 'completed' ? 'No completed episodes yet' : 'No episodes yet',
          message: status ? 'Nothing matches this filter.' : 'When you record an episode, it will appear here.',
          action: createButton({ label: 'New Episode', variant: 'primary', href: '#/new-episode', icon: 'plus' }),
          compact: true,
          titleLevel: 2,
        }),
      );
    }
  }

  const page = h(
    'div',
    { class: 'ra-page' },
    h('div', { class: 'ra-page__intro' }, h('h1', { 'data-page-title': '' }, 'All episodes'), summary),
    createCard({ children: [h('div', { class: 'ra-row ra-row--between' }, filter.el, createButton({ label: 'New Episode', variant: 'primary', href: '#/new-episode', icon: 'plus' })), body] }),
  );
  await loadPage(true);
  return page;
}
