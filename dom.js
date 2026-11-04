/**
 * Tiny DOM builder. Strings are always inserted as text nodes (never HTML),
 * so user-provided text is safe by construction.
 *
 * h('button', { class: 'x', onClick: fn, 'aria-label': 'Save' }, 'Save')
 */

/**
 * @param {string} tag
 * @param {Record<string, any>} [attrs]  `class`, `onClick`-style listeners, or any attribute.
 * @param {...(Node|string|number|null|undefined|false|Array<any>)} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') {
      el.className = value;
    } else if (/^on[A-Z]/.test(key) && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

let counter = 0;
/** Unique, stable-per-session id for label/aria wiring. */
export function uid(prefix = 'ra') {
  counter += 1;
  return `${prefix}-${counter}`;
}
