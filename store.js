/**
 * Minimal observable store for UI state only (current route, theme).
 * Persistent user data never lives here; it belongs in IndexedDB via services.
 */

/**
 * @template T
 * @param {T} initial
 */
export function createStore(initial) {
  let state = { ...initial };
  const subscribers = new Set();

  return {
    get: () => state,
    /** Shallow-merge a patch and notify subscribers. */
    set(patch) {
      state = { ...state, ...patch };
      subscribers.forEach((fn) => fn(state));
    },
    /** @returns {() => void} unsubscribe */
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
