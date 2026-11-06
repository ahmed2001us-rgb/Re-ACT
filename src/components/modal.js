import { h, uid } from '../utils/dom.js';
import { createButton, createIconButton } from './button.js';

/**
 * Modal built on the native <dialog> element, which provides the focus trap,
 * Escape-to-close and an inert background. Focus returns to the opener on close.
 *
 * @param {{
 *   title: string,
 *   body?: any,
 *   actions?: { label: string, variant?: 'primary'|'secondary'|'ghost', value?: string, closes?: boolean, onClick?: () => (void|boolean|Promise<void|boolean>) }[],
 *   dismissible?: boolean,
 * }} options
 * @returns {{ close: (value?: string) => void, closed: Promise<string>, element: HTMLDialogElement }}
 */
export function openModal({ title, body = null, actions = [], dismissible = true }) {
  const opener = document.activeElement;
  const titleId = uid('modal-title');

  const dialog = /** @type {HTMLDialogElement} */ (h('dialog', { class: 'ra-modal', 'aria-labelledby': titleId }));
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });

  const close = (value = 'dismissed') => {
    if (dialog.open) dialog.close(value);
  };

  const actionButtons = actions.map((action) =>
    createButton({
      label: action.label,
      variant: action.variant || 'secondary',
      onClick: async () => {
        const result = await action.onClick?.();
        if (action.closes !== false && result !== false) close(action.value || action.label);
      },
    }),
  );

  dialog.append(
    h(
      'div',
      { class: 'ra-modal__inner' },
      h(
        'div',
        { class: 'ra-modal__header' },
        h('h2', { id: titleId }, title),
        dismissible ? createIconButton({ label: 'Close', icon: 'close', onClick: () => close() }) : null,
      ),
      body ? h('div', { class: 'ra-modal__body' }, body) : null,
      actionButtons.length ? h('div', { class: 'ra-modal__actions' }, actionButtons) : null,
    ),
  );

  dialog.addEventListener('cancel', (event) => {
    if (!dismissible) event.preventDefault();
  });
  // The dialog has no padding of its own, so a click whose target is the dialog is a backdrop click.
  dialog.addEventListener('click', (event) => {
    if (dismissible && event.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener && typeof opener.focus === 'function') opener.focus();
    resolveClosed(dialog.returnValue || 'dismissed');
  });

  document.body.append(dialog);
  dialog.showModal();
  return { close, closed, element: dialog };
}

/**
 * Confirmation dialog. Resolves true only when the confirm button is used.
 * @param {{ title: string, message: string, confirmLabel?: string, cancelLabel?: string }} options
 * @returns {Promise<boolean>}
 */
export async function openConfirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
  const { closed } = openModal({
    title,
    body: h('p', {}, message),
    actions: [
      { label: cancelLabel, variant: 'ghost', value: 'cancel' },
      { label: confirmLabel, variant: 'primary', value: 'confirm' },
    ],
  });
  return (await closed) === 'confirm';
}
