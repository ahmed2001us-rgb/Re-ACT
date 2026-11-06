/** Time helpers. Stored timestamps are always ISO-8601 UTC strings with milliseconds. */

export const MS_PER_DAY = 86_400_000;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Current time as an ISO-8601 UTC string. */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * True only for real, canonical UTC timestamps (e.g. "2026-11-04T10:15:30.000Z").
 * Rejects impossible dates such as February 31st and non-UTC offsets.
 */
export function isValidIso(value) {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) return false;
  const canonical = value.replace(/(\.\d+)?Z$/, (_, fraction) => `.${((fraction || '.').slice(1) + '000').slice(0, 3)}Z`);
  const date = new Date(canonical);
  return !Number.isNaN(date.getTime()) && date.toISOString() === canonical;
}

/** Local calendar date "YYYY-MM-DD" for an ISO timestamp (the device's time zone). */
export function toDateKey(iso) {
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
