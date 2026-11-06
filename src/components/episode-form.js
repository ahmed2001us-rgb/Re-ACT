import { h } from '../utils/dom.js';
import { createCard } from './card.js';
import { createButton } from './button.js';
import { createField, createSelect } from './input.js';
import { createEmotionPicker } from './emotion-picker.js';
import { episodeService } from '../services/episode-service.js';
import { libraryService } from '../services/library-service.js';
import { emptyForm, episodeToForm, formToFields, isFormBlank, sameForm, issueToControl, FORM_LIMITS, CATEGORY_OPTIONS, SHIFT_OPTIONS } from '../models/episode-form.js';
import { toLocalInputValue, formatTime } from '../utils/date.js';
import { EPISODE_STATUS } from '../models/enums.js';

const NAMES = {
  occurred: 'The date and time',
  emotions: 'The emotions',
  trigger: 'What set it off',
  actualEvent: 'What happened',
  interpretation: 'The meaning',
  need: 'The need',
  impulse: 'The urge',
  response: 'The response',
  outcome: 'The outcome',
  reflection: 'The reflection',
};

/**
 * The episode form: create, continue a draft, or edit a completed episode.
 *
 * Drafts (new or unfinished) are saved automatically a moment after you stop typing, and again when you leave
 * the page, so a half-written episode is never lost. Completed episodes are changed only when you press Save.
 * Every save is checked against the revision this page last saw, so it can never silently overwrite a change
 * made in another tab.
 *
 * @param {{
 *   episode?: object | null,
 *   episodes?: typeof episodeService,
 *   library?: typeof libraryService,
 *   navigate: (path: string) => void,
 *   replaceRoute: (path: string) => void,
 *   toast: (options: { message: string, tone?: string }) => void,
 *   confirm: (options: object) => Promise<boolean>,
 *   autosaveDelay?: number,
 * }} options
 */
export function createEpisodeForm({ episode = null, episodes = episodeService, library = libraryService, navigate, replaceRoute, toast, confirm, autosaveDelay = 1000 }) {
  let record = episode; // the latest stored version this page knows about
  let form = record ? episodeToForm(record) : emptyForm();
  let lastSaved = record ? episodeToForm(record) : null; // the form values as of the last successful save
  let queue = Promise.resolve();
  let timer = null;
  let stopped = false; // set when the episode is deleted or this page was told to stop saving
  let blocked = null; // 'changed-elsewhere' | 'gone' once saving must stop

  const isCompleted = () => record?.status === EPISODE_STATUS.COMPLETED;
  const dirty = () => (lastSaved ? !sameForm(form, lastSaved) : !isFormBlank(form));
  const canAutosave = () => !stopped && !blocked && !isCompleted();

  /* ---------- controls ---------- */
  const picker = createEmotionPicker({
    library,
    value: form.emotions,
    onChange(value) {
      form.emotions = value;
      picker.setError('');
      changed();
    },
  });

  const controls = {};
  const text = (key, props) => {
    const field = createField({ ...props, value: form[key], attrs: { name: key, ...(props.attrs ?? {}) }, onInput: (value) => { form[key] = value; field.setError(''); changed(); } });
    controls[key] = field;
    return field.el;
  };

  const occurred = createField({
    label: 'When did this happen?',
    type: 'datetime-local',
    value: form.occurred,
    hint: 'Pre-filled with now. Change it if you are writing this down later.',
    attrs: { name: 'occurred', max: toLocalInputValue(new Date().toISOString()) },
    onInput: (value) => {
      form.occurred = value;
      occurred.setError('');
      changed();
    },
  });
  controls.occurred = occurred;
  controls.emotions = picker;

  const categorySelect = createSelect({
    label: 'What kind of response was it?',
    options: CATEGORY_OPTIONS,
    value: form.responseCategory,
    emptyLabel: 'Not sure, or skip',
    hint: 'Optional. If you leave it, the response is filed under “Something else”.',
    attrs: { name: 'responseCategory' },
    onChange: (value) => {
      form.responseCategory = value;
      changed();
    },
  });
  const shiftSelect = createSelect({
    label: 'Compared with before, how do you feel now?',
    options: SHIFT_OPTIONS,
    value: form.outcomeShift,
    emptyLabel: 'Skip',
    hint: 'Optional. No answer here is better or worse than another.',
    attrs: { name: 'outcomeShift' },
    onChange: (value) => {
      form.outcomeShift = value;
      changed();
    },
  });

  const feeling = createCard({ title: 'The feeling', raised: true, className: 'ra-form__card', children: [occurred.el, picker.el] });
  const moment = createCard({
    title: 'The moment',
    className: 'ra-form__card',
    children: [
      text('trigger', { label: 'What set it off?', multiline: true, rows: 3, maxLength: FORM_LIMITS.long, hint: 'The moment, person, thought or situation that seemed to start the feeling. Optional.' }),
      text('actualEvent', { label: 'What actually happened?', multiline: true, rows: 4, maxLength: FORM_LIMITS.long, hint: 'Just what a camera would have recorded, apart from what it meant to you.' }),
    ],
  });
  const sense = createCard({
    title: 'Making sense of it',
    className: 'ra-form__card',
    children: [
      text('interpretation', { label: 'What does it seem to mean?', multiline: true, rows: 3, maxLength: FORM_LIMITS.long, hint: 'Your reading of it. It is one possibility, not a fact, and you can change your mind.' }),
      text('need', { label: 'What might you need?', multiline: true, rows: 2, maxLength: FORM_LIMITS.short, hint: 'Possibly something like rest, clarity, respect, closeness, reassurance or space. A guess is fine.' }),
    ],
  });
  const respond = createCard({
    title: 'Urge and response',
    className: 'ra-form__card',
    children: [
      text('impulse', { label: 'What did you feel like doing?', multiline: true, rows: 2, maxLength: FORM_LIMITS.short, hint: 'The first urge: to act, to say something, or to pull away. Noticing an urge is not the same as obeying it.' }),
      text('response', { label: 'What did you choose to do?', multiline: true, rows: 3, maxLength: FORM_LIMITS.short, hint: 'If anything. Resting, setting a boundary and asking for support are real choices, and so is not acting yet.' }),
      categorySelect.el,
    ],
  });
  const after = createCard({
    title: 'Afterwards',
    className: 'ra-form__card',
    children: [
      text('outcome', { label: 'What happened afterwards?', multiline: true, rows: 3, maxLength: FORM_LIMITS.long, hint: 'Optional. You can come back and add this later.' }),
      shiftSelect.el,
      text('reflection', { label: 'Looking back, is there anything you notice?', multiline: true, rows: 4, maxLength: FORM_LIMITS.long, hint: 'Optional. Anything you want to remember.' }),
    ],
  });

  /* ---------- status, notices, actions ---------- */
  const status = h('p', { class: 'ra-formbar__status', role: 'status', 'aria-live': 'polite', 'data-save-status': '' });
  const notice = h('div', { class: 'ra-notice', role: 'alert', hidden: true });
  const actions = h('div', { class: 'ra-formbar__actions' });
  const bar = h('div', { class: 'ra-formbar' }, status, actions);

  function setStatus(message, tone = 'neutral') {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function showNotice(message) {
    notice.replaceChildren(h('p', {}, message), createButton({ label: 'Reload this page', variant: 'secondary', onClick: () => location.reload() }));
    notice.hidden = false;
  }

  function renderActions() {
    const completed = isCompleted();
    const buttons = [];
    if (completed) {
      buttons.push(createButton({ label: 'Save changes', variant: 'primary', onClick: () => submit('changes') }));
      buttons.push(createButton({ label: 'Cancel', variant: 'ghost', onClick: cancel }));
    } else {
      buttons.push(createButton({ label: 'Save episode', variant: 'primary', onClick: () => submit('finish') }));
      buttons.push(createButton({ label: 'Save draft', variant: 'secondary', onClick: () => submit('draft') }));
    }
    if (record) buttons.push(createButton({ label: 'Delete', variant: 'ghost', onClick: remove }));
    actions.replaceChildren(...buttons);
  }

  function describeStatus() {
    if (blocked) return;
    if (isCompleted()) setStatus(dirty() ? 'You have unsaved changes.' : 'No changes yet.');
    else if (!record && isFormBlank(form)) setStatus('Nothing is saved yet. Drafts are saved automatically as you type.');
    else if (dirty()) setStatus('Saving soon…');
    else setStatus(`Draft saved at ${formatTime(record.updatedAt)}.`);
  }

  /* ---------- change tracking and autosave ---------- */
  let beforeUnloadGuard = null;
  function changed() {
    describeStatus();
    guardUnload();
    if (!canAutosave()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      persist('auto').catch(() => {});
    }, autosaveDelay);
  }

  /** A completed episode changes only on Save, so warn before the browser closes or reloads with edits pending. */
  function guardUnload() {
    const need = isCompleted() && dirty() && !stopped;
    if (need && !beforeUnloadGuard) {
      beforeUnloadGuard = (event) => {
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', beforeUnloadGuard);
    } else if (!need && beforeUnloadGuard) {
      window.removeEventListener('beforeunload', beforeUnloadGuard);
      beforeUnloadGuard = null;
    }
  }

  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  function showIssues(error, { focus }) {
    let first = null;
    const messages = [];
    for (const issue of error.issues ?? []) {
      const key = issueToControl(issue.path);
      const message = `${NAMES[key] ?? 'This'} ${issue.message}`;
      messages.push(message);
      if (key && controls[key]) {
        controls[key].setError(message);
        first ??= controls[key];
      }
    }
    if (focus && first) (first.input ?? first).focus?.();
    return messages[0] ?? error.message;
  }

  function afterSaved(saved, snapshot) {
    const wasNew = !record;
    record = saved;
    lastSaved = snapshot;
    if (wasNew) {
      // The draft now has an id: a refresh reopens it, and the Delete button appears.
      replaceRoute(`edit-episode?id=${encodeURIComponent(saved.id)}`);
      renderActions();
    }
  }

  /**
   * Save the form. kind: 'auto' (draft, quiet), 'draft' (draft, explicit), 'finish' (save and complete),
   * 'changes' (edit a completed episode). Saves run one at a time, in order.
   */
  function persist(kind) {
    return enqueue(async () => {
      if (stopped || blocked) return null;
      const snapshot = structuredClone(form);
      if (kind === 'auto' && ((!record && isFormBlank(snapshot)) || (record && lastSaved && sameForm(snapshot, lastSaved)))) return record;
      const fields = formToFields(snapshot, record);
      try {
        let saved;
        if (kind === 'finish') {
          if (!record) afterSaved(await episodes.saveDraft({ fields }), snapshot);
          saved = await episodes.finish({ id: record.id, fields, expectedRevision: record.revision });
        } else if (kind === 'changes') {
          saved = await episodes.saveChanges(record.id, fields, { expectedRevision: record.revision });
        } else {
          saved = await episodes.saveDraft({ id: record?.id ?? null, fields, expectedRevision: record?.revision });
        }
        afterSaved(saved, snapshot);
        if (kind === 'auto' || kind === 'draft') describeStatus();
        return saved;
      } catch (error) {
        handleSaveError(error, kind);
        throw error;
      }
    });
  }

  function handleSaveError(error, kind) {
    if (error?.code === 'conflict' && error.details?.reason === 'stale') {
      blocked = 'changed-elsewhere';
      setStatus('Not saved. This episode was changed somewhere else.', 'caution');
      showNotice('This episode was changed in another tab or window, so this page stopped saving to avoid overwriting that change. What you typed here is still on this page: copy anything you want to keep, then reload.');
    } else if (error?.code === 'not-found') {
      blocked = 'gone';
      setStatus('Not saved. This episode no longer exists.', 'caution');
      showNotice('This episode no longer exists, perhaps because it was deleted in another tab. What you typed is still on this page: copy anything you want to keep.');
    } else if (error?.code === 'validation') {
      const message = showIssues(error, { focus: kind !== 'auto' });
      setStatus(`Not saved. ${message}`, 'caution');
      if (kind !== 'auto') toast({ message: 'Some details need another look before this can be saved.', tone: 'caution' });
    } else {
      setStatus(`Not saved. ${error?.message ?? 'Saving did not work.'}`, 'caution');
      if (kind !== 'auto') toast({ message: error?.message ?? 'Saving did not work. Your text is still on this page.', tone: 'caution', duration: 8000 });
    }
  }

  async function submit(kind) {
    clearTimeout(timer);
    timer = null;
    if (blocked) {
      toast({ message: 'This page stopped saving. Reload it to continue.', tone: 'caution' });
      return;
    }
    if (kind === 'draft' && !record && isFormBlank(form)) {
      toast({ message: 'There is nothing to save yet.', tone: 'info' });
      return;
    }
    if ((kind === 'finish' || kind === 'changes') && form.emotions.length === 0) {
      picker.setError(kind === 'finish' ? 'Choose at least one emotion to save this episode. You can still save a draft without one.' : 'An episode needs at least one emotion.');
      picker.focus();
      setStatus('Not saved. Choose at least one emotion.', 'caution');
      return;
    }
    setStatus('Saving…');
    try {
      const saved = await persist(kind);
      if (!saved) return;
      if (kind === 'draft') toast({ message: 'Draft saved. You can continue it any time.', tone: 'success' });
      else {
        toast({ message: kind === 'finish' ? 'Episode saved.' : 'Changes saved.', tone: 'success' });
        guardUnload();
        navigate(`episode?id=${encodeURIComponent(saved.id)}`);
      }
    } catch {
      // handleSaveError has already explained what happened and kept the text on the page.
    }
  }

  async function cancel() {
    if (dirty()) {
      const discard = await confirm({ title: 'Discard your changes?', message: 'The changes you made on this page have not been saved.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing' });
      if (!discard) return;
    }
    stopped = true;
    guardUnload();
    navigate(`episode?id=${encodeURIComponent(record.id)}`);
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this episode?',
      message: 'It will be removed from this device for good. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    clearTimeout(timer);
    try {
      await queue; // let any save in progress finish first
      await episodes.remove(record.id, { expectedRevision: record.revision });
      stopped = true;
      guardUnload();
      toast({ message: 'Episode deleted.', tone: 'neutral' });
      navigate('episodes');
    } catch (error) {
      if (error?.code === 'not-found') {
        stopped = true;
        toast({ message: 'That episode was already gone.', tone: 'info' });
        navigate('episodes');
      } else if (error?.code === 'conflict') {
        toast({ message: 'This episode was changed elsewhere. Reload the page to see it before deleting.', tone: 'caution', duration: 8000 });
      } else {
        toast({ message: error?.message ?? 'The episode could not be deleted.', tone: 'caution', duration: 8000 });
      }
    }
  }

  /* ---------- leaving the page ---------- */
  function flush() {
    clearTimeout(timer);
    timer = null;
    if (canAutosave() && dirty()) return persist('auto').catch(() => {});
    return queue;
  }
  const onHidden = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  const onPageHide = () => flush();
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', onPageHide);

  const el = h('form', { class: 'ra-form', novalidate: true, onSubmit: (event) => event.preventDefault() }, notice, feeling, moment, sense, respond, after, bar);

  return {
    el,
    /** Load the emotion library. Call once, then insert `el`. */
    async load() {
      await picker.load();
      renderActions();
      describeStatus();
    },
    /** Save anything pending (used when leaving the page). */
    flush,
    /** Stop listening. Pending draft changes are saved first. */
    destroy() {
      flush();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      stopped = stopped || false;
      if (beforeUnloadGuard) window.removeEventListener('beforeunload', beforeUnloadGuard);
    },
    get record() {
      return record;
    },
    isDirty: dirty,
  };
}
