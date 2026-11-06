/**
 * Theme management: 'system' | 'light' | 'dark'.
 *
 * Source of truth: the `theme` record in the IndexedDB settings store.
 * Boot mirror: localStorage, because the theme must be applied before first paint
 * (inline script in index.html) and IndexedDB cannot be read synchronously.
 *
 * Write-behind safety: a choice is applied and mirrored immediately and flagged "pending"
 * until the database confirms it. If the page is closed first, the next start sees the flag
 * and writes the mirrored choice to the database instead of letting the older stored value win.
 */
import { THEME_COLORS } from './config.js';
import { THEME_PREFERENCES } from '../models/enums.js';
import { settingsService } from '../services/settings-service.js';

const STORAGE_KEY = 'react.theme';
const PENDING_KEY = 'react.theme.pending';

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice still applies for this session */
  }
}
function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readStoredTheme() {
  const value = lsGet(STORAGE_KEY);
  return THEME_PREFERENCES.includes(value) ? value : 'system';
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

/** Apply the mirrored preference immediately (no database needed) and follow OS changes while set to 'system'. */
export function initTheme(store) {
  const preference = readStoredTheme();
  store.set({ theme: preference, resolvedTheme: applyTheme(preference) });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.get().theme === 'system') {
      store.set({ resolvedTheme: applyTheme('system') });
    }
  });
}

/**
 * Once the database is open: reconcile it with the mirror. Returns which side won.
 *  - pending flag set  -> the mirrored choice never reached the database; it wins and is saved
 *  - stored record     -> the database wins (and the mirror is refreshed)
 *  - neither, mirror customised (e.g. chosen before the database existed) -> migrate it into the database
 */
export async function syncThemeWithDatabase(store) {
  const before = store.get().theme;
  const mirror = readStoredTheme();

  if (lsGet(PENDING_KEY)) {
    await settingsService.set('theme', mirror);
    if (readStoredTheme() === mirror) lsRemove(PENDING_KEY);
    return 'mirror';
  }

  const record = await settingsService.getRecord('theme');
  if (store.get().theme !== before) return 'user-changed'; // the person chose a theme while we were reading
  if (record && THEME_PREFERENCES.includes(record.value)) {
    if (record.value !== before) {
      lsSet(STORAGE_KEY, record.value);
      store.set({ theme: record.value, resolvedTheme: applyTheme(record.value) });
    }
    return 'database';
  }
  if (mirror !== 'system') {
    await settingsService.set('theme', mirror);
    return 'migrated';
  }
  return 'default';
}

/** Apply a choice now; save it in the background. Failure to save is reported through the store, never thrown. */
export function setTheme(store, preference) {
  if (!THEME_PREFERENCES.includes(preference)) return;
  lsSet(STORAGE_KEY, preference);
  lsSet(PENDING_KEY, '1');
  store.set({ theme: preference, resolvedTheme: applyTheme(preference) });

  settingsService.set('theme', preference).then(
    () => {
      if (readStoredTheme() === preference) lsRemove(PENDING_KEY); // a newer choice keeps its own pending flag
    },
    (error) => {
      store.set({
        storageIssue: {
          message: `${error?.message ?? 'Your theme choice could not be saved.'} It still applies for now.`,
        },
      });
    },
  );
}

/** Header shortcut: flip between light and dark explicitly. */
export function toggleTheme(store) {
  setTheme(store, store.get().resolvedTheme === 'dark' ? 'light' : 'dark');
}
