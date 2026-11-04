import { h } from '../utils/dom.js';
import { createIconButton } from './button.js';
import { createBrand } from './sidebar.js';
import { toggleTheme } from '../app/theme.js';

/**
 * Application header: brand on mobile, current section name on larger screens,
 * and a theme toggle on all sizes.
 */
export function createHeader({ store }) {
  const section = h('p', { class: 'ra-header__section' });
  let toggle = null;

  function renderToggle() {
    const dark = store.get().resolvedTheme === 'dark';
    const next = createIconButton({
      label: dark ? 'Switch to light theme' : 'Switch to dark theme',
      icon: dark ? 'sun' : 'moon',
      onClick: () => toggleTheme(store),
    });
    if (toggle) toggle.replaceWith(next);
    toggle = next;
    return next;
  }

  const actions = h('div', { class: 'ra-header__actions' });
  actions.append(renderToggle());

  const el = h('header', { class: 'ra-header' }, createBrand('ra-brand ra-header__brand'), section, actions);

  let lastTheme = store.get().resolvedTheme;
  store.subscribe((state) => {
    section.textContent = state.sectionTitle || '';
    if (state.resolvedTheme !== lastTheme) {
      lastTheme = state.resolvedTheme;
      const hadFocus = document.activeElement === toggle;
      renderToggle();
      if (hadFocus) toggle.focus();
    }
  });

  return { el };
}
