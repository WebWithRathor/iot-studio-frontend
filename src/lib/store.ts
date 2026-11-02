import { useRef, useSyncExternalStore } from 'react';

/**
 * Minimal external store (zustand-like) built on useSyncExternalStore.
 * Kept in-repo to avoid a dependency for ~40 lines of code.
 */
export interface Store<S> {
  get: () => S;
  set: (patch: Partial<S> | ((s: S) => Partial<S>)) => void;
  subscribe: (fn: (s: S, prev: S) => void) => () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<(s: S, prev: S) => void>();
  return {
    get: () => state,
    set: (patch) => {
      const prev = state;
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l(state, prev));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Subscribe to a slice of a store. Re-renders only when the slice changes (shallowly). */
export function useStore<S, T>(store: Store<S>, selector: (s: S) => T): T {
  const cache = useRef<{ value: T; has: boolean }>({ value: undefined as T, has: false });
  const getSnapshot = () => {
    const next = selector(store.get());
    if (cache.current.has && shallowEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { value: next, has: true };
    return next;
  };
  return useSyncExternalStore((cb) => store.subscribe(cb), getSnapshot);
}
