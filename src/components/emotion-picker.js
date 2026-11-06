import { h, uid } from '../utils/dom.js';
import { createButton } from './button.js';
import { createField, createSelect } from './input.js';
import { searchEmotions } from '../services/library-service.js';
import { FAMILY_LABELS } from '../data/emotions.js';
import { EMOTION_FAMILIES } from '../models/enums.js';

export const DEFAULT_INTENSITY = 5;

/**
 * Emotion selection: a searchable library, several emotions at once, an intensity (1-10) for each one,
 * the library's description of each, and a way to add an emotion of your own.
 *
 * @param {{
 *   library: ReturnType<typeof import('../services/library-service.js').createLibraryService>,
 *   value?: {emotionId: string, intensity: number}[],
 *   onChange?: (value: {emotionId: string, intensity: number}[]) => void,
 * }} options
 */
export function createEmotionPicker({ library, value = [], onChange }) {
  const id = uid('emo');
  let emotions = []; // every emotion available (built-in + custom)
  let selected = value.map((entry) => ({ ...entry }));
  let query = '';

  const search = h('input', {
    class: 'ra-field__control ra-emopick__search',
    type: 'search',
    id: `${id}-search`,
    placeholder: 'Search, e.g. "worried" or "let down"',
    autocomplete: 'off',
    'aria-controls': `${id}-chips`,
    onInput: (event) => {
      query = event.target.value;
      renderChips();
    },
  });
  const chips = h('div', { class: 'ra-emopick__chips', id: `${id}-chips`, role: 'group', 'aria-label': 'Emotions' });
  const noMatch = h('p', { class: 'ra-emopick__nomatch', hidden: true, role: 'status' });
  const selectedList = h('ul', { class: 'ra-emopick__selected', 'aria-label': 'Selected emotions' });
  const selectedEmpty = h('p', { class: 'ra-emopick__none' }, 'Nothing selected yet.');
  const errorEl = h('p', { class: 'ra-field__error', role: 'alert', hidden: true });
  const customHost = h('div', { class: 'ra-emopick__custom' });

  const el = h(
    'fieldset',
    { class: 'ra-emopick', 'data-field': 'emotions' },
    h('legend', { class: 'ra-form__legend' }, 'What are you feeling?'),
    h('p', { class: 'ra-form__prompt' }, 'Choose as many as fit. Naming a feeling does not mean it is wrong, or that it needs fixing.'),
    h('label', { class: 'ra-sr-only', for: `${id}-search` }, 'Search emotions'),
    search,
    chips,
    noMatch,
    customHost,
    h('div', { class: 'ra-emopick__selectedwrap' }, h('h3', { class: 'ra-emopick__heading' }, 'How strongly?'), selectedEmpty, selectedList),
    errorEl,
  );

  const byId = () => new Map(emotions.map((emotion) => [emotion.id, emotion]));
  const isSelected = (emotionId) => selected.some((entry) => entry.emotionId === emotionId);
  const emit = () => onChange?.(selected.map((entry) => ({ ...entry })));

  function toggle(emotionId) {
    if (isSelected(emotionId)) selected = selected.filter((entry) => entry.emotionId !== emotionId);
    else selected = [...selected, { emotionId, intensity: DEFAULT_INTENSITY }];
    renderChips();
    renderSelected();
    emit();
    // Re-rendering replaced the button that was used; keep keyboard focus where the person was.
    const chip = [...chips.querySelectorAll('[data-emotion]')].find((node) => node.dataset.emotion === emotionId && !node.hidden);
    (chip ?? search).focus();
  }

  function renderChips() {
    const matches = searchEmotions(emotions, query);
    const shown = new Set(matches.map((emotion) => emotion.id));
    // While searching, the best matches come first (an exact name before an alias match); everything
    // else keeps its place afterwards, hidden. Without a search the library order is unchanged.
    const ordered = query.trim() ? [...matches, ...emotions.filter((emotion) => !shown.has(emotion.id))] : emotions;
    chips.replaceChildren(
      ...ordered.map((emotion) => {
        const pressed = isSelected(emotion.id);
        return h(
          'button',
          {
            class: `ra-chip${pressed ? ' ra-chip--on' : ''}${emotion.builtin ? '' : ' ra-chip--own'}`,
            type: 'button',
            'aria-pressed': pressed ? 'true' : 'false',
            'data-emotion': emotion.id,
            title: emotion.description || undefined,
            hidden: !shown.has(emotion.id) && !pressed,
            onClick: () => toggle(emotion.id),
          },
          emotion.label,
        );
      }),
    );
    // Selected emotions stay visible even when the search no longer matches them.
    const visible = emotions.filter((emotion) => shown.has(emotion.id) || isSelected(emotion.id)).length;
    noMatch.hidden = !(query.trim() && matches.length === 0);
    noMatch.textContent = query.trim() && matches.length === 0 ? `Nothing in the library matches “${query.trim()}”. You can add it as your own emotion below.` : '';
    chips.hidden = visible === 0;
  }

  function renderSelected() {
    const map = byId();
    selectedEmpty.hidden = selected.length > 0;
    selectedList.hidden = selected.length === 0;
    selectedList.replaceChildren(
      ...selected.map((entry) => {
        const emotion = map.get(entry.emotionId);
        const name = emotion?.label ?? 'Unknown emotion';
        const sliderId = `${id}-${entry.emotionId}`;
        const readout = h('output', { class: 'ra-intensity__value', for: sliderId }, `${entry.intensity} of 10`);
        const slider = h('input', {
          class: 'ra-intensity__range',
          type: 'range',
          id: sliderId,
          min: 1,
          max: 10,
          step: 1,
          value: entry.intensity,
          'data-intensity-for': entry.emotionId,
          'aria-valuetext': `${entry.intensity} of 10`,
          onInput: (event) => {
            entry.intensity = Number(event.target.value);
            readout.textContent = `${entry.intensity} of 10`;
            event.target.setAttribute('aria-valuetext', `${entry.intensity} of 10`);
            emit();
          },
        });
        return h(
          'li',
          { class: 'ra-emotion-row', 'data-selected': entry.emotionId },
          h(
            'div',
            { class: 'ra-emotion-row__head' },
            h('label', { class: 'ra-emotion-row__name', for: sliderId }, name, emotion && !emotion.builtin ? h('span', { class: 'ra-tag ra-tag--quiet' }, 'Your own') : null),
            h('button', { class: 'ra-linkbutton', type: 'button', 'aria-label': `Remove ${name}`, onClick: () => toggle(entry.emotionId) }, 'Remove'),
          ),
          emotion?.description ? h('p', { class: 'ra-emotion-row__desc' }, emotion.description) : null,
          h('div', { class: 'ra-intensity' }, h('span', { class: 'ra-intensity__end', 'aria-hidden': 'true' }, 'mild'), slider, h('span', { class: 'ra-intensity__end', 'aria-hidden': 'true' }, 'very strong'), readout),
        );
      }),
    );
  }

  /* ---- adding an emotion of your own ---- */
  function renderCustom(open = false) {
    if (!open) {
      customHost.replaceChildren(
        createButton({
          label: 'Add an emotion of your own',
          variant: 'ghost',
          onClick: () => {
            renderCustom(true);
            customHost.querySelector('input')?.focus();
          },
        }),
      );
      return;
    }
    const label = createField({ label: 'Name', placeholder: 'e.g. Restless', maxLength: 80, attrs: { name: 'custom-emotion-label', autocomplete: 'off' }, value: query.trim().slice(0, 80) });
    const description = createField({ label: 'In your own words (optional)', multiline: true, rows: 2, maxLength: 500, attrs: { name: 'custom-emotion-description' }, hint: 'What does it feel like for you? Only you will see this.' });
    const family = createSelect({
      label: 'Closest group (optional)',
      options: EMOTION_FAMILIES.map((key) => ({ value: key, label: FAMILY_LABELS[key] })),
      value: 'other',
      attrs: { name: 'custom-emotion-family' },
      hint: 'Only used for grouping.',
    });
    const status = h('p', { class: 'ra-field__error', role: 'alert', hidden: true });

    const add = createButton({
      label: 'Add and select',
      variant: 'primary',
      onClick: async () => {
        label.setError('');
        status.hidden = true;
        add.disabled = true;
        try {
          const created = await library.createEmotion({ label: label.input.value, description: description.input.value, family: family.input.value });
          emotions = await library.listEmotions();
          selected = [...selected, { emotionId: created.id, intensity: DEFAULT_INTENSITY }];
          query = '';
          search.value = '';
          renderChips();
          renderSelected();
          renderCustom(false);
          emit();
          customHost.dataset.lastAdded = created.label;
          customHost.querySelector('button')?.focus();
        } catch (error) {
          const issue = error?.issues?.[0];
          const message = issue ? `${issue.path === 'label' ? 'The name' : issue.path} ${issue.message}` : error?.message || 'That emotion could not be added.';
          label.setError(message);
          label.input.focus();
        } finally {
          add.disabled = false;
        }
      },
    });
    customHost.replaceChildren(
      h(
        'div',
        { class: 'ra-emopick__customform', role: 'group', 'aria-label': 'Add an emotion of your own' },
        label.el,
        description.el,
        family.el,
        status,
        h('div', { class: 'ra-row' }, add, createButton({ label: 'Cancel', variant: 'ghost', onClick: () => renderCustom(false) })),
      ),
    );
  }

  /** Load the library. Call once after creating the picker. */
  async function load() {
    emotions = await library.listEmotions();
    renderChips();
    renderSelected();
    renderCustom(false);
  }

  return {
    el,
    load,
    getValue: () => selected.map((entry) => ({ ...entry })),
    /** Replace the selection (e.g. after loading a saved episode). */
    setValue(next) {
      selected = next.map((entry) => ({ ...entry }));
      renderChips();
      renderSelected();
    },
    setError(message) {
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
      el.setAttribute('aria-invalid', message ? 'true' : 'false');
    },
    focus() {
      search.focus();
    },
  };
}
