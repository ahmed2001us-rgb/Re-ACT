/** Application-wide constants and the route table (single source for nav, router and titles). */

export const APP_NAME = 'RE:ACT';
export const APP_VERSION = '0.4.0';
export const APP_STAGE = 4;

export const DEFAULT_ROUTE = 'home';

/**
 * Pages are imported lazily so the shell paints first and later stages
 * do not grow the initial payload.
 * `placement: 'footer'` pins the item to the bottom of the sidebar.
 * `hidden: true` routes exist (and can be linked to) but have no navigation item.
 */
export const ROUTES = [
  { path: 'home', title: 'Home', icon: 'home', load: () => import('../pages/home.js') },
  { path: 'new-episode', title: 'New Episode', icon: 'plus', load: () => import('../pages/new-episode.js') },
  { path: 'edit-episode', title: 'Edit Episode', hidden: true, load: () => import('../pages/new-episode.js') },
  { path: 'episode', title: 'Episode', hidden: true, load: () => import('../pages/episode.js') },
  { path: 'episodes', title: 'All Episodes', hidden: true, load: () => import('../pages/episodes.js') },
  { path: 'patterns', title: 'My Patterns', icon: 'patterns', load: () => import('../pages/patterns.js') },
  { path: 'growth', title: 'My Growth', icon: 'growth', load: () => import('../pages/growth.js') },
  { path: 'settings', title: 'Settings', icon: 'settings', placement: 'footer', load: () => import('../pages/settings.js') },
];

export const THEME_COLORS = { light: '#f5f1e8', dark: '#1a1b19' };
