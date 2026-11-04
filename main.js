/**
 * RE:ACT — application entry point.
 *
 * Boot order (kept deliberately small):
 *   1. theme            (src/app/theme.js; moves to the settings store in Stage 3)
 *   2. shell + router   (src/app, src/components, src/pages)
 *   3. database         (Stage 3)
 *   4. service worker   (Stage 10)
 */
import { createStore } from './app/store.js';
import { initTheme } from './app/theme.js';
import { createRouter, navigate } from './app/router.js';
import { mountShell } from './components/shell.js';
import { showToast } from './components/toast.js';
import { openModal, openConfirm } from './components/modal.js';

const store = createStore({ route: null, sectionTitle: '', theme: 'system', resolvedTheme: 'light' });

initTheme(store);

const root = document.getElementById('app');
const { main } = mountShell(root, { store });

const router = createRouter({
  mount: main,
  store,
  context: { store, navigate, toast: showToast, modal: { openModal, openConfirm } },
});

router.start();
