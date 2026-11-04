/**
 * Theme management: 'system' | 'light' | 'dark'.
 *
 * INTERIM STORAGE: the preference is kept in localStorage (key below) so the
 * theme can be applied before first paint (see the inline script in index.html).
 * Stage 3 moves it into the IndexedDB `settings` store; this module is the only
 * place that has to change.
 */
import { THEME_COLORS } from './config.js';

const STORAGE_KEY = 'react.theme';
const VALID = ['system', 'light', 'dark'];

export function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** @param {'system'|'light'|'dark'} preference @returns {'light'|'dark'} */
export function resolveTheme(preference) {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[resolved]);
  return resolved;
}

/** Apply the stored preference and follow OS changes while set to 'system'. */
export function initTheme(store) {
  const preference = readStoredTheme();
  store.set({ theme: preference, resolvedTheme: applyTheme(preference) });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.get().theme === 'system') {
      store.set({ resolvedTheme: applyTheme('system') });
    }
  });
}

export function setTheme(store, preference) {
  if (!VALID.includes(preference)) return;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* Storage unavailable: the choice still applies for this session. */
  }
  store.set({ theme: preference, resolvedTheme: applyTheme(preference) });
}

/** Header shortcut: flip between light and dark explicitly. */
export function toggleTheme(store) {
  setTheme(store, store.get().resolvedTheme === 'dark' ? 'light' : 'dark');
}
