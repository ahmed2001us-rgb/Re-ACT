import { h, uid } from '../utils/dom.js';

/**
 * Labelled text field (single or multi-line) with optional hint and error.
 * @param {{ label: string, type?: string, placeholder?: string, hint?: string, multiline?: boolean, value?: string, onInput?: (value: string) => void }} props
 */
export function createField({ label, type = 'text', placeholder = '', hint, multiline = false, value = '', onInput }) {
  const id = uid('field');
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const control = h(multiline ? 'textarea' : 'input', {
    class: 'ra-field__control',
    id,
    type: multiline ? null : type,
    placeholder,
    'aria-describedby': hint ? hintId : null,
    onInput: (event) => onInput?.(event.target.value),
  });
  control.value = value;

  const hintEl = hint ? h('p', { class: 'ra-field__hint', id: hintId }, hint) : null;
  const errorEl = h('p', { class: 'ra-field__error', id: errorId, role: 'alert', hidden: true });

  return {
    el: h('div', { class: 'ra-field' }, h('label', { class: 'ra-field__label', for: id }, label), control, hintEl, errorEl),
    input: control,
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
