import { h } from '../utils/dom.js';
import { createCard } from '../components/card.js';
import { createButton } from '../components/button.js';
import { createEmptyState } from '../components/empty-state.js';
import { createLoadingState } from '../components/loading-state.js';
import { createEpisodeForm } from '../components/episode-form.js';
import { episodeService } from '../services/episode-service.js';
import { formatDateTime } from '../utils/date.js';
import { EPISODE_STATUS } from '../models/enums.js';
import { getRouteParams, replaceRoute } from '../app/router.js';

let activeForm = null;

/**
 * Two routes share this page:
 *   #/new-episode            a blank form (with a pointer to an unfinished draft, if there is one)
 *   #/edit-episode?id=...    continue a draft, or edit a completed episode
 */
export async function render({ route, navigate, toast, modal }) {
  const editing = route.path === 'edit-episode';
  let episode = null;

  if (editing) {
    const id = getRouteParams().get('id');
    try {
      episode = id ? await episodeService.get(id) : null;
    } catch (error) {
      return notice('This episode could not be opened', error?.message || 'Nothing was lost. Try again in a moment.');
    }
    if (!episode) return notice('This episode does not exist', 'It may have been deleted. You can return to your episodes or start a new one.');
  }

  const draft = episode?.status === EPISODE_STATUS.IN_PROGRESS;
  const heading = !editing ? 'New Episode' : draft ? 'Continue your draft' : 'Edit episode';
  const lede = !editing
    ? 'A moment of feeling, understood before it is acted on. Fill in as much or as little as you like: drafts are saved as you go.'
    : draft
      ? `From ${formatDateTime(episode.occurredAt)}. Pick up where you left off.`
      : `From ${formatDateTime(episode.occurredAt)}. Changes are saved when you press Save changes.`;

  const form = createEpisodeForm({ episode, navigate, replaceRoute, toast, confirm: modal.openConfirm });
  const page = h(
    'div',
    { class: 'ra-page ra-page--form' },
    h('div', { class: 'ra-page__intro' }, h('h1', { 'data-page-title': '' }, heading), h('p', { class: 'ra-page__lede' }, lede)),
  );

  if (!editing) {
    const banner = await resumeBanner();
    if (banner) page.append(banner);
  }

  const holder = h('div', {}, createLoadingState({ label: 'Opening the form…', variant: 'skeleton' }));
  page.append(holder);
  try {
    await form.load();
    holder.replaceWith(form.el);
    activeForm = form;
  } catch (error) {
    form.destroy();
    holder.replaceWith(createCard({ children: createEmptyState({ icon: 'compass', title: 'The form could not be opened', message: error?.message || 'Nothing was lost. Try again.', action: createButton({ label: 'Try again', variant: 'primary', onClick: () => location.reload() }) }) }));
  }
  return page;
}

export function destroy() {
  activeForm?.destroy();
  activeForm = null;
}

async function resumeBanner() {
  let latest = null;
  try {
    latest = await episodeService.getResumable();
  } catch {
    return null; // storage trouble is reported elsewhere; the blank form still works
  }
  if (!latest) return null;
  return h(
    'aside',
    { class: 'ra-notice ra-notice--soft', 'data-resume-banner': '' },
    h('p', {}, `You have an unfinished episode from ${formatDateTime(latest.occurredAt)}. You can pick it up, or begin a new one below.`),
    h('div', { class: 'ra-row' }, createButton({ label: 'Continue draft', variant: 'secondary', href: `#/edit-episode?id=${encodeURIComponent(latest.id)}` }), createButton({ label: 'All drafts', variant: 'ghost', href: '#/episodes?status=in_progress' })),
  );
}

function notice(title, message) {
  const empty = createEmptyState({ icon: 'compass', title, message, action: createButton({ label: 'All episodes', variant: 'primary', href: '#/episodes' }) });
  empty.querySelector('.ra-empty__title').setAttribute('data-page-title', '');
  return h('div', { class: 'ra-page' }, createCard({ children: empty }));
}
