/** Tiny in-browser test harness (no dependencies). Tests run one after another against real IndexedDB. */
import { isDeepEqual } from '../../src/utils/equal.js';

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export class AssertionError extends Error {}

const show = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const assert = {
  ok(value, message = 'expected a truthy value') {
    if (!value) throw new AssertionError(message);
  },
  equal(actual, expected, message = '') {
    if (!Object.is(actual, expected)) throw new AssertionError(`${message} expected ${show(expected)} but got ${show(actual)}`.trim());
  },
  deepEqual(actual, expected, message = '') {
    if (!isDeepEqual(actual, expected)) throw new AssertionError(`${message} expected ${show(expected)} but got ${show(actual)}`.trim());
  },
  /**
   * The call must reject. Optionally check the error's `code`, a validation issue `path`, or `details.reason`.
   * Returns the error.
   */
  async rejects(fn, { code, path, reason, message = 'operation' } = {}) {
    let error;
    try {
      await fn();
    } catch (caught) {
      error = caught;
    }
    if (!error) throw new AssertionError(`${message}: expected it to be rejected, but it succeeded`);
    if (code && error.code !== code) throw new AssertionError(`${message}: expected error code "${code}" but got "${error.code}" (${error.message})`);
    if (path && !error.issues?.some((issue) => issue.path === path || issue.path.startsWith(path))) {
      throw new AssertionError(`${message}: expected a validation issue at "${path}" but got ${show(error.issues)}`);
    }
    if (reason && error.details?.reason !== reason) throw new AssertionError(`${message}: expected reason "${reason}" but got ${show(error.details)}`);
    return error;
  },
};

export async function runAll({ only } = {}) {
  const results = [];
  for (const { name, fn } of tests) {
    if (only && !name.includes(only)) continue;
    const started = performance.now();
    try {
      await fn();
      results.push({ name, ok: true, ms: Math.round(performance.now() - started) });
    } catch (error) {
      results.push({ name, ok: false, ms: Math.round(performance.now() - started), error: `${error?.name}: ${error?.message}` });
    }
  }
  return results;
}
