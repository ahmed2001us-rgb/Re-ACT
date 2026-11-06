/** Date helpers for display. Stored dates are ISO-8601 UTC strings; display uses local time. */

/** @param {Date} [now] */
export function getGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** e.g. "Wednesday, November 4, 2026" in the user's locale. */
export function formatLongDate(now = new Date()) {
  return now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 1–366, local time. Used to pick a stable-for-the-day reminder. */
export function dayOfYear(now = new Date()) {
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start - (now.getTimezoneOffset() - start.getTimezoneOffset()) * 60000;
  return Math.floor(diff / 86400000);
}

const pad = (n) => String(n).padStart(2, '0');

/** ISO string -> value for <input type="datetime-local"> in local time (minute precision). */
export function toLocalInputValue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value from <input type="datetime-local"> (local time) -> ISO string, or null if it is not a real date. */
export function fromLocalInputValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.toISOString();
}

/** e.g. "Wed, 4 Nov, 13:20" in the person's locale. */
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** e.g. "13:20" */
export function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
