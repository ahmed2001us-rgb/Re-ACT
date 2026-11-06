/**
 * RE:ACT — application entry point.
 *
 * Boot order (kept deliberately small):
 *   1. theme from the boot mirror (instant, no database needed)
 *   2. shell + router (the app is usable immediately)
 *   3. database opens in the background; theme reconciles with the stored setting
 *   4. service worker   (Stage 10)
 *
 * If local storage is unavailable the app still works for the session and says so calmly.
 */
import { createStore } from './app/store.js';
import { initTheme, syncThemeWithDatabase } from './app/theme.js';
import { createRouter, navigate } from './app/router.js';
import { mountShell } from './components/shell.js';
import { showToast } from './components/toast.js';
import { openModal, openConfirm } from './components/modal.js';
import { database } from './db/index.js';

const store = createStore({
  route: null,
  sectionTitle: '',
  theme: 'system',
  resolvedTheme: 'light',
  storage: { state: 'opening', version: null, message: null },
  storageIssue: null,
});

initTheme(store);

const root = document.getElementById('app');
const { main } = mountShell(root, { store });

// Background save problems (reported through the store) become a calm notification.
let lastIssue = null;
store.subscribe((state) => {
  if (state.storageIssue && state.storageIssue !== lastIssue) {
    lastIssue = state.storageIssue;
    showToast({ message: state.storageIssue.message, tone: 'caution', duration: 8000 });
  }
});

database.subscribe(({ type }) => {
  if (type === 'versionchange' || type === 'closed') {
    store.set({ storage: { state: 'closed', version: null, message: null } });
    showToast({
      message: type === 'versionchange' ? 'RE:ACT was updated in another tab. Reload this page to keep saving.' : 'Local storage was disconnected. Reload this page to reconnect.',
      tone: 'caution',
      duration: 0,
    });
  }
});

const router = createRouter({
  mount: main,
  store,
  context: { store, navigate, toast: showToast, modal: { openModal, openConfirm } },
});

router.start();
startStorage();

async function startStorage() {
  try {
    await database.open();
    store.set({ storage: { state: 'ready', version: database.status().version, message: null } });
    await syncThemeWithDatabase(store);
  } catch (error) {
    console.warn('Local storage is not available', error);
    const message = error?.message ?? "Saving on this device isn't available right now.";
    store.set({ storage: { state: 'unavailable', version: null, message } });
    showToast({ message: `${message} RE:ACT will keep working, but changes won't be remembered.`, tone: 'caution', duration: 10000 });
  }
}
