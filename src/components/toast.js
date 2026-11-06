import { h } from '../utils/dom.js';
import { createIconButton } from './button.js';

const MAX_VISIBLE = 3;
let region = null;

/** Create the live region once; the shell mounts it. */
export function createToastRegion() {
  region = h('div', { class: 'ra-toasts', role: 'region', 'aria-label': 'Notifications', 'aria-live': 'polite' });
  return region;
}

/**
 * Show a short, calm notification.
 * @param {{ message: string, tone?: 'neutral'|'info'|'success'|'caution', duration?: number }} options
 *   duration in ms; 0 keeps it until dismissed. Hovering or focusing pauses the timer.
 * @returns {() => void} dismiss function
 */
export function showToast({ message, tone = 'neutral', duration = 5000 }) {
  if (!region) throw new Error('Toast region is not mounted.');

  while (region.children.length >= MAX_VISIBLE) region.firstElementChild.remove();

  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    toast.remove();
  };
  const start = () => {
    if (duration > 0) timer = setTimeout(dismiss, duration);
  };
  const pause = () => clearTimeout(timer);

  const toast = h(
    'div',
    { class: `ra-toast ra-toast--${tone}`, onMouseenter: pause, onMouseleave: start, onFocusin: pause, onFocusout: start },
    h('p', { class: 'ra-toast__message' }, message),
    createIconButton({ label: 'Dismiss notification', icon: 'close', onClick: dismiss }),
  );

  region.append(toast);
  start();
  return dismiss;
}
