import { h } from '../utils/dom.js';
import { createIcon } from './icons.js';
import { APP_NAME } from '../app/config.js';

/** Brand wordmark. The tablet rail hides everything after "RE:" via CSS. */
export function createBrand(className = 'ra-brand') {
  return h(
    'a',
    { class: className, href: '#/home', 'aria-label': `${APP_NAME} — Home` },
    h('span', {}, 'RE'),
    h('span', { class: 'ra-brand__colon' }, ':'),
    h('span', { class: 'ra-brand__rest' }, 'ACT'),
  );
}

/**
 * Desktop sidebar (full) / tablet rail (icons only). Same markup; CSS switches layout.
 * @param {{ path: string, title: string, icon: string, placement?: string }[]} routes
 */
export function createSidebar(routes) {
  const links = new Map();

  const items = routes.map((route) => {
    const link = h(
      'a',
      { class: `ra-nav__link${route.placement === 'footer' ? ' ra-nav__link--footer' : ''}`, href: `#/${route.path}`, title: route.title },
      createIcon(route.icon),
      h('span', { class: 'ra-nav__label' }, route.title),
    );
    links.set(route.path, link);
    return link;
  });

  const el = h(
    'aside',
    { class: 'ra-sidebar' },
    createBrand(),
    h('nav', { class: 'ra-nav', 'aria-label': 'Primary' }, items),
    h('p', { class: 'ra-sidebar__note' }, 'Private. Everything stays on this device.'),
  );

  return {
    el,
    setActive(path) {
      links.forEach((link, key) => {
        if (key === path) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    },
  };
}
