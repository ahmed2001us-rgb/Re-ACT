import { h } from '../utils/dom.js';
import { createIcon } from './icons.js';

/**
 * Mobile bottom navigation (shown below 720px by CSS).
 * Short labels keep five items legible on narrow screens.
 * @param {{ path: string, title: string, icon: string }[]} routes
 */
const SHORT_LABELS = { 'new-episode': 'New', patterns: 'Patterns', growth: 'Growth' };

export function createBottomNav(routes) {
  const links = new Map();

  const items = routes.map((route) => {
    const link = h(
      'a',
      { class: 'ra-bottomnav__link', href: `#/${route.path}`, 'aria-label': route.title },
      createIcon(route.icon),
      h('span', { 'aria-hidden': 'true' }, SHORT_LABELS[route.path] || route.title),
    );
    links.set(route.path, link);
    return link;
  });

  return {
    el: h('nav', { class: 'ra-bottomnav', 'aria-label': 'Primary (mobile)' }, items),
    setActive(path) {
      links.forEach((link, key) => {
        if (key === path) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    },
  };
}
