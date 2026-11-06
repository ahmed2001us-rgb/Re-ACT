import { h } from '../utils/dom.js';
import { createCard } from '../components/card.js';
import { createButton } from '../components/button.js';
import { createEmptyState } from '../components/empty-state.js';
import { createMeter } from '../components/episode-item.js';
import { episodeService } from '../services/episode-service.js';
import { libraryService } from '../services/library-service.js';
import { formatDateTime } from '../utils/date.js';
import { CATEGORY_LABELS, SHIFT_LABELS } from '../models/episode-form.js';
import { EPISODE_STATUS } from '../models/enums.js';
import { getRouteParams } from '../app/router.js';

const missing = (title, message) => {
  const empty = createEmptyState({ icon: 'compass', title, message, action: createButton({ label: 'All episodes', variant: 'primary', href: '#/episodes' }) });
  empty.querySelector('.ra-empty__title').setAttribute('data-page-title', '');
  return h('div', { class: 'ra-page' }, createCard({ children: empty }));
};

/** Read one episode. Text is shown exactly as written. Edit and Delete are here too. */
export async function render({ navigate, toast, modal }) {
  const id = getRouteParams().get('id');
  let episode;
  let emotionMap;
  try {
    episode = id ? await episodeService.get(id) : null;
    if (episode) emotionMap = await libraryService.getEmotionMap();
  } catch (error) {
    return missing('This episode could not be opened', error?.message || 'Nothing was lost. Try again in a moment.');
  }
  if (!episode) return missing('This episode does not exist', 'It may have been deleted.');

  const draft = episode.status === EPISODE_STATUS.IN_PROGRESS;
  const editHref = `#/edit-episode?id=${encodeURIComponent(episode.id)}`;

  async function remove() {
    const ok = await modal.openConfirm({ title: 'Delete this episode?', message: 'It will be removed from this device for good. This cannot be undone.', confirmLabel: 'Delete permanently', cancelLabel: 'Keep it' });
    if (!ok) return;
    try {
      await episodeService.remove(episode.id, { expectedRevision: episode.revision });
      toast({ message: 'Episode deleted.' });
      navigate('episodes');
    } catch (error) {
      if (error?.code === 'not-found') {
        toast({ message: 'That episode was already gone.', tone: 'info' });
        navigate('episodes');
      } else if (error?.code === 'conflict') {
        toast({ message: 'This episode was changed elsewhere. Reload the page to see the latest version before deleting.', tone: 'caution', duration: 8000 });
      } else {
        toast({ message: error?.message || 'The episode could not be deleted.', tone: 'caution', duration: 8000 });
      }
    }
  }

  const section = (title, ...content) => {
    const body = content.flat().filter(Boolean);
    return body.length === 0 ? null : h('section', { class: 'ra-detail' }, h('h3', { class: 'ra-detail__title' }, title), body);
  };
  const para = (text) => h('p', { class: 'ra-detail__text' }, text);

  const emotions = episode.emotions.length
    ? h(
        'ul',
        { class: 'ra-emotion-list' },
        episode.emotions.map((entry) => {
          const emotion = emotionMap.get(entry.emotionId);
          return h(
            'li',
            { class: 'ra-emotion-view', 'data-emotion': entry.emotionId },
            h('div', { class: 'ra-emotion-view__head' }, h('strong', {}, emotion?.label ?? 'Unknown emotion'), h('span', { class: 'ra-emotion-view__n' }, createMeter(entry.intensity), h('span', {}, `${entry.intensity} of 10`))),
            emotion?.description ? h('p', { class: 'ra-emotion-view__desc' }, emotion.description) : null,
          );
        }),
      )
    : h('p', { class: 'ra-detail__quiet' }, 'No emotion chosen yet.');

  const responses = episode.chosenResponses.map((r) => h('p', { class: 'ra-detail__text' }, r.text, ' ', h('span', { class: 'ra-tag ra-tag--quiet' }, CATEGORY_LABELS[r.category] ?? r.category)));
  const outcome = episode.outcome ? [episode.outcome.text ? para(episode.outcome.text) : null, episode.outcome.shift ? h('p', { class: 'ra-detail__quiet' }, `Compared with before: ${SHIFT_LABELS[episode.outcome.shift].toLowerCase()}.`) : null] : [];
  const reflection = episode.reflection ? [episode.reflection.text ? para(episode.reflection.text) : null, episode.reflection.learned ? para(episode.reflection.learned) : null] : [];

  const details = [
    section('What set it off', episode.trigger ? para(episode.trigger) : null),
    section('What actually happened', episode.actualEvent ? para(episode.actualEvent) : null),
    section('What it seemed to mean (one possibility)', episode.interpretations.map((i) => para(i.text))),
    section('What might have been needed', episode.needs.map(para)),
    section('The urge', episode.impulses.map((i) => para(i.text))),
    section('What was chosen', responses),
    section('Afterwards', outcome),
    section('Looking back', reflection),
  ].filter(Boolean);

  return h(
    'div',
    { class: 'ra-page', 'data-episode-view': episode.id },
    h(
      'div',
      { class: 'ra-page__intro' },
      h('a', { class: 'ra-backlink', href: '#/episodes' }, '← All episodes'),
      h('h1', { 'data-page-title': '' }, formatDateTime(episode.occurredAt)),
      h('p', { class: 'ra-page__lede' }, draft ? 'A draft. It is not finished yet.' : 'A moment of feeling, recorded.'),
      h('div', { class: 'ra-row' }, draft ? createButton({ label: 'Continue draft', variant: 'primary', href: editHref }) : createButton({ label: 'Edit', variant: 'secondary', href: editHref }), createButton({ label: 'Delete', variant: 'ghost', onClick: remove })),
    ),
    createCard({ raised: true, title: 'The feeling', children: emotions }),
    details.length ? createCard({ children: details }) : createCard({ children: h('p', { class: 'ra-detail__quiet' }, 'Nothing else has been written down yet.') }),
    h('p', { class: 'ra-detail__meta' }, `Started ${formatDateTime(episode.createdAt)}. Last changed ${formatDateTime(episode.updatedAt)}.`),
  );
}
