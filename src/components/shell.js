import { h } from '../utils/dom.js';
import { ROUTES } from '../app/config.js';
import { createSidebar } from './sidebar.js';
import { createBottomNav } from './bottom-nav.js';
import { createHeader } from './header.js';
import { createToastRegion } from './toast.js';

/**
 * Builds the persistent application frame and returns the element pages render into.
 * Navigation highlighting follows the store's `route`.
 */
export function mountShell(root, { store }) {
  const navRoutes = ROUTES.filter((route) => !route.hidden);
  const sidebar = createSidebar(navRoutes);
  const bottomNav = createBottomNav(navRoutes);
  const header = createHeader({ store });
  const main = h('main', { class: 'ra-main', id: 'main', tabindex: '-1' });

  const skipLink = h(
    'a',
    {
      class: 'ra-skip-link',
      href: '#main',
      onClick: (event) => {
        // Prevent the hash change (it would trigger the router); just move focus.
        event.preventDefault();
        main.focus();
      },
    },
    'Skip to content',
  );

  root.replaceChildren(
    skipLink,
    h('div', { class: 'ra-app' }, sidebar.el, h('div', { class: 'ra-main-wrap' }, header.el, main)),
    bottomNav.el,
    createToastRegion(),
  );

  store.subscribe((state) => {
    sidebar.setActive(state.route);
    bottomNav.setActive(state.route);
  });

  return { main };
}
