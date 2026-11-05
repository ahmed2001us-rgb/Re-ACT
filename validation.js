/**
 * Small validation primitives. They never coerce types ("5" is not 5) and never throw;
 * they record problems in an `issues` collector so every problem is reported at once.
 */

export function createIssues() {
  const list = [];
  return {
    list,
    add(path, message) {
      list.push({ path, message });
    },
    get ok() {
      return list.length === 0;
    },
  };
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Required or optional text. Trims. Returns the trimmed string, or undefined after recording an issue. */
export function readString(value, path, issues, { max, required = false } = {}) {
  if (typeof value !== 'string') {
    issues.add(path, 'must be text.');
    return undefined;
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    issues.add(path, 'is required.');
    return undefined;
  }
  if (max !== undefined && trimmed.length > max) {
    issues.add(path, `must be at most ${max} characters.`);
    return undefined;
  }
  return trimmed;
}

/** Nullable text: null, or text that trims to empty, becomes null. */
export function readOptionalText(value, path, issues, max) {
  if (value === null) return null;
  const text = readString(value, path, issues, { max });
  if (text === undefined) return undefined;
  return text === '' ? null : text;
}

export function readInt(value, path, issues, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) {
    issues.add(path, `must be a whole number from ${min} to ${max}.`);
    return undefined;
  }
  return value;
}

/** Only the canonical form produced by Date#toISOString() is accepted, so stored dates sort correctly as text. */
export function readIso(value, path, issues) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value) return value;
  issues.add(path, 'must be a UTC timestamp such as 2026-11-04T10:30:00.000Z.');
  return undefined;
}

export function readEnum(value, path, issues, allowed) {
  if (typeof value === 'string' && allowed.includes(value)) return value;
  issues.add(path, `must be one of: ${allowed.join(', ')}.`);
  return undefined;
}

/** Validates an array and maps each item with `item(value, itemPath)`. */
export function readList(value, path, issues, { max, item }) {
  if (!Array.isArray(value)) {
    issues.add(path, 'must be a list.');
    return undefined;
  }
  if (value.length > max) {
    issues.add(path, `can have at most ${max} items.`);
    return undefined;
  }
  return value.map((entry, index) => item(entry, `${path}[${index}]`));
}

export function rejectDuplicates(values, path, issues, what = 'values') {
  const seen = new Set();
  for (const value of values) {
    if (value === undefined) continue;
    const key = typeof value === 'string' ? value.toLowerCase() : value;
    if (seen.has(key)) {
      issues.add(path, `contains the same ${what} more than once ("${value}").`);
      return;
    }
    seen.add(key);
  }
}

export function rejectUnknownKeys(object, allowed, path, issues) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) issues.add(path ? `${path}.${key}` : key, 'is not a recognised field.');
  }
}
