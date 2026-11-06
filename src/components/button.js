import { h } from '../utils/dom.js';
import { createIcon } from './icons.js';

/**
 * Button, or a link styled as a button when `href` is given (use links for navigation).
 * @param {{
 *   label: string,
 *   variant?: 'primary'|'secondary'|'ghost',
 *   size?: 'default'|'large',
 *   icon?: string,
 *   href?: string,
 *   type?: 'button'|'submit',
 *   onClick?: (event: Event) => void,
 *   disabled?: boolean,
 * }} props
 */
export function createButton({ label, variant = 'secondary', size = 'default', icon, href, type = 'button', onClick, disabled = false }) {
  const classes = ['ra-btn', `ra-btn--${variant}`, size === 'large' ? 'ra-btn--large' : ''].filter(Boolean).join(' ');
  const content = [icon ? createIcon(icon) : null, label];

  if (href) {
    return h('a', { class: classes, href, onClick }, content);
  }
  return h('button', { class: classes, type, disabled, onClick }, content);
}

/** Square icon-only button; `label` becomes the accessible name. */
export function createIconButton({ label, icon, onClick }) {
  return h('button', { class: 'ra-btn ra-btn--icon', type: 'button', 'aria-label': label, title: label, onClick }, createIcon(icon));
}
