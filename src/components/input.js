import { h, uid } from '../utils/dom.js';

/**
 * Labelled text field (single or multi-line) with optional hint and error.
 * `maxLength` adds a live character count once the text nears the limit (typing stops at the limit, so
 * nothing is ever cut off without being seen). `attrs` are extra attributes for the control, e.g. `name`.
 * @param {{ label: string, type?: string, placeholder?: string, hint?: string, multiline?: boolean, value?: string, rows?: number, maxLength?: number, attrs?: Record<string, any>, onInput?: (value: string) => void }} props
 */
export function createField({ label, type = 'text', placeholder = '', hint, multiline = false, value = '', rows, maxLength, attrs = {}, onInput }) {
  const id = uid('field');
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const countId = `${id}-count`;

  const control = h(multiline ? 'textarea' : 'input', {
    class: 'ra-field__control',
    id,
    type: multiline ? null : type,
    placeholder,
    rows: multiline ? rows : null,
    maxlength: maxLength,
    'aria-describedby': hint ? hintId : null,
    ...attrs,
    onInput: (event) => {
      updateCount();
      onInput?.(event.target.value);
    },
  });
  control.value = value;

  const hintEl = hint ? h('p', { class: 'ra-field__hint', id: hintId }, hint) : null;
  const countEl = maxLength ? h('p', { class: 'ra-field__hint ra-field__count', id: countId, hidden: true }) : null;
  const errorEl = h('p', { class: 'ra-field__error', id: errorId, role: 'alert', hidden: true });

  function updateCount() {
    if (!countEl) return;
    const length = control.value.length;
    countEl.hidden = length < maxLength * 0.8;
    countEl.textContent = `${length} of ${maxLength} characters`;
  }
  updateCount();

  return {
    el: h('div', { class: 'ra-field' }, h('label', { class: 'ra-field__label', for: id }, label), control, hintEl, countEl, errorEl),
    input: control,
    /** Replace the text (and refresh the character count). */
    setValue(next) {
      control.value = next;
      updateCount();
    },
    /** Show an error message, or clear it with a falsy value. */
    setError(message) {
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
      control.setAttribute('aria-invalid', message ? 'true' : 'false');
      const describedBy = [hint ? hintId : null, message ? errorId : null].filter(Boolean).join(' ');
      if (describedBy) control.setAttribute('aria-describedby', describedBy);
      else control.removeAttribute('aria-describedby');
    },
  };
}

/**
 * Labelled drop-down (native <select>, so keyboard and screen-reader behaviour come from the browser).
 * @param {{ label: string, options: {value: string, label: string}[], value?: string, emptyLabel?: string, hint?: string, attrs?: Record<string, any>, onChange?: (value: string) => void }} props
 */
export function createSelect({ label, options, value = '', emptyLabel, hint, attrs = {}, onChange }) {
  const id = uid('select');
  const hintId = `${id}-hint`;
  const control = h(
    'select',
    { class: 'ra-field__control ra-field__select', id, 'aria-describedby': hint ? hintId : null, ...attrs, onChange: (event) => onChange?.(event.target.value) },
    emptyLabel === undefined ? null : h('option', { value: '' }, emptyLabel),
    options.map((option) => h('option', { value: option.value }, option.label)),
  );
  control.value = value;
  return {
    el: h('div', { class: 'ra-field' }, h('label', { class: 'ra-field__label', for: id }, label), hint ? h('p', { class: 'ra-field__hint', id: hintId }, hint) : null, control),
    input: control,
    setValue(next) {
      control.value = next;
    },
  };
}

/**
 * Segmented single-choice control built on native radio inputs
 * (keyboard arrows and screen-reader semantics come from the browser).
 * @param {{ legend: string, name: string, options: {value: string, label: string}[], value: string, onChange: (value: string) => void }} props
 */
export function createSegmented({ legend, name, options, value, onChange }) {
  const radios = new Map();

  const group = h(
    'div',
    { class: 'ra-segmented__group' },
    options.map((option) => {
      const input = h('input', {
        type: 'radio',
        name,
        value: option.value,
        checked: option.value === value,
        onChange: () => onChange(option.value),
      });
      radios.set(option.value, input);
      return h('label', { class: 'ra-segmented__option' }, input, h('span', {}, option.label));
    }),
  );

  return {
    el: h('fieldset', { class: 'ra-segmented' }, h('legend', { class: 'ra-segmented__legend' }, legend), group),
    /** Reflect an externally changed value (e.g. theme toggled from the header). */
    setValue(next) {
      const radio = radios.get(next);
      if (radio) radio.checked = true;
    },
  };
}
