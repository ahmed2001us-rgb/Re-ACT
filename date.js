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
