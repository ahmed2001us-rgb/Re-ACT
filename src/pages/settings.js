import { h } from '../utils/dom.js';
import { createCard } from '../components/card.js';
import { createButton } from '../components/button.js';
import { createField, createSegmented } from '../components/input.js';
import { createLoadingState } from '../components/loading-state.js';
import { openModal, openConfirm } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { setTheme } from '../app/theme.js';
import { libraryService } from '../services/library-service.js';
import { FAMILY_LABELS } from '../data/emotions.js';
import { APP_NAME, APP_VERSION, APP_STAGE } from '../app/config.js';

let unsubscribers = [];

export async function render({ store }) {
  // Appearance: the segmented control also reflects changes made from the header toggle.
  const themeControl = createSegmented({
    legend: 'Theme',
    name: 'theme',
    value: store.get().theme,
    options: [
      { value: 'system', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
    onChange: (value) => setTheme(store, value),
  });
  const storageValue = h('dd', { 'data-storage-status': '', 'aria-live': 'polite' });
  const showStorage = (storage) => {
    storageValue.textContent =
      storage.state === 'ready' ? `Ready (database version ${storage.version})`
      : storage.state === 'opening' ? 'Starting…'
      : storage.state === 'closed' ? 'Disconnected. Reload this page to reconnect.'
      : `Unavailable. ${storage.message ?? ''}`.trim();
  };
  showStorage(store.get().storage);
  unsubscribers.push(
    store.subscribe((state) => {
      themeControl.setValue(state.theme);
      showStorage(state.storage);
    }),
  );

  const appearance = createCard({
    title: 'Appearance',
    children: [
      h('p', {}, '“System” follows your device. Light and dark use the same calm palette.'),
      themeControl.el,
    ],
  });

  const about = createCard({
    title: 'About',
    children: [
      h(
        'dl',
        { class: 'ra-definition' },
        h('dt', {}, 'Application'),
        h('dd', {}, APP_NAME),
        h('dt', {}, 'Version'),
        h('dd', {}, `${APP_VERSION} (development stage ${APP_STAGE} of 10)`),
        h('dt', {}, 'Privacy'),
        h('dd', {}, 'Nothing is sent anywhere. Your episodes and settings are kept in this browser, on this device.'),
        h('dt', {}, 'Local storage'),
        storageValue,
      ),
    ],
  });

  return h(
    'div',
    { class: 'ra-page' },
    h(
      'div',
      { class: 'ra-page__intro' },
      h('h1', { 'data-page-title': '' }, 'Settings'),
      h('p', { class: 'ra-page__lede' }, 'Adjust how RE:ACT looks, and manage the emotions you have added. More options arrive in later stages.'),
    ),
    appearance,
    await createOwnEmotionsCard(),
    about,
    createPreviewCard(),
  );
}

export function destroy() {
  unsubscribers.forEach((off) => off());
  unsubscribers = [];
}

/** Development-only showcase so every shared component can be exercised. Removed or hidden in Stage 9. */
function createPreviewCard() {
  const loadingSlot = h('div', { class: 'ra-preview', 'aria-live': 'polite' }, h('p', {}, 'Loading states appear here.'));
  let loadingTimer = null;

  const sampleField = createField({
    label: 'Sample text field',
    placeholder: 'Type something',
    hint: 'This text is not saved anywhere.',
  });
  const validateButton = createButton({
    label: 'Check field',
    onClick: () => sampleField.setError(sampleField.input.value.trim() ? '' : 'This field is empty. That is fine; this is only a demonstration.'),
  });

  return createCard({
    eyebrow: 'Development preview',
    title: 'Interface components',
    children: [
      h('p', {}, 'These controls demonstrate the shared components. They do not change any stored data.'),

      h('div', { class: 'ra-stack' }, h('h3', {}, 'Buttons'), h('div', { class: 'ra-row' }, createButton({ label: 'Primary', variant: 'primary' }), createButton({ label: 'Secondary' }), createButton({ label: 'Ghost', variant: 'ghost' }))),

      h(
        'div',
        { class: 'ra-stack' },
        h('h3', {}, 'Notifications'),
        h(
          'div',
          { class: 'ra-row' },
          createButton({ label: 'Neutral', onClick: () => showToast({ message: 'A quiet, neutral notification.' }) }),
          createButton({ label: 'Info', onClick: () => showToast({ message: 'Some information, shown calmly.', tone: 'info' }) }),
          createButton({ label: 'Success', onClick: () => showToast({ message: 'Done. Nothing more is needed.', tone: 'success' }) }),
          createButton({ label: 'Caution', onClick: () => showToast({ message: 'A gentle note to take into account.', tone: 'caution' }) }),
        ),
      ),

      h(
        'div',
        { class: 'ra-stack' },
        h('h3', {}, 'Dialogs'),
        h(
          'div',
          { class: 'ra-row' },
          createButton({
            label: 'Open dialog',
            onClick: () =>
              openModal({
                title: 'A simple dialog',
                body: h('p', {}, 'Dialogs trap focus, close with Escape, and return you to where you were.'),
                actions: [{ label: 'Close', variant: 'primary' }],
              }),
          }),
          createButton({
            label: 'Open confirmation',
            onClick: async () => {
              const confirmed = await openConfirm({ title: 'Please confirm', message: 'Confirm this demonstration action?', confirmLabel: 'Confirm', cancelLabel: 'Not now' });
              showToast({ message: confirmed ? 'You confirmed.' : 'You chose not to continue.', tone: confirmed ? 'success' : 'neutral' });
            },
          }),
        ),
      ),

      h('div', { class: 'ra-stack' }, h('h3', {}, 'Fields'), sampleField.el, h('div', { class: 'ra-row' }, validateButton)),

      h(
        'div',
        { class: 'ra-stack' },
        h('h3', {}, 'Loading state'),
        loadingSlot,
        createButton({
          label: 'Show loading for 2 seconds',
          onClick: () => {
            clearTimeout(loadingTimer);
            loadingSlot.replaceChildren(createLoadingState({ label: 'Preparing…', variant: 'skeleton' }));
            loadingTimer = setTimeout(() => loadingSlot.replaceChildren(h('p', {}, 'Finished loading.')), 2000);
          },
        }),
      ),
    ],
  });
}

/** The emotions the person added themselves. Removing one is refused while episodes still use it. */
async function createOwnEmotionsCard() {
  const list = h('ul', { class: 'ra-own-emotions', 'aria-label': 'Your own emotions', 'data-own-emotions': '' });
  const status = h('p', { class: 'ra-field__hint', role: 'status', 'aria-live': 'polite' });
  let failure = null;

  async function draw() {
    let own = [];
    try {
      own = await libraryService.listCustomEmotions();
    } catch (error) {
      failure = error?.message || 'Your emotions could not be read right now.';
    }
    status.textContent = failure ?? (own.length === 0 ? 'You have not added any emotions of your own. You can add one while recording an episode.' : '');
    list.hidden = own.length === 0;
    list.replaceChildren(
      ...own.map((emotion) =>
        h(
          'li',
          { class: 'ra-own-emotions__item', 'data-own-emotion': emotion.label },
          h('div', {}, h('strong', {}, emotion.label), h('p', { class: 'ra-field__hint' }, [FAMILY_LABELS[emotion.family], emotion.description].filter(Boolean).join(' · '))),
          createButton({
            label: 'Remove',
            variant: 'ghost',
            onClick: async () => {
              const ok = await openConfirm({ title: `Remove “${emotion.label}”?`, message: 'It will be removed from your emotion list. Episodes that already use it keep it, and in that case it cannot be removed.', confirmLabel: 'Remove', cancelLabel: 'Keep it' });
              if (!ok) return;
              try {
                await libraryService.deleteEmotion(emotion.id, { expectedRevision: emotion.revision });
                showToast({ message: `“${emotion.label}” was removed.`, tone: 'success' });
              } catch (error) {
                showToast({ message: error?.message || 'It could not be removed.', tone: 'caution', duration: 8000 });
              }
              await draw();
            },
          }),
        ),
      ),
    );
  }
  await draw();

  return createCard({ title: 'Your own emotions', children: [h('p', {}, 'Emotions you added to the library when recording an episode.'), status, list] });
}
