/**
 * Pure undo/redo history logic (no React).
 *
 * Kept separate so it can be unit tested directly; `useHistory` is a thin
 * React wrapper around these functions.
 */

export interface HistoryState<T> {
  present: T;
  past: T[];
  future: T[];
  lastKey: string | null;
  lastTime: number;
}

export const COALESCE_WINDOW_MS = 600;

export function createHistory<T>(initial: T): HistoryState<T> {
  return { present: initial, past: [], future: [], lastKey: null, lastTime: 0 };
}

/**
 * Commit a new value. Rapid changes sharing a `coalesceKey` within the window
 * replace the top of the stack instead of pushing a new entry.
 */
export function commitHistory<T>(
  state: HistoryState<T>,
  value: T,
  coalesceKey: string | undefined,
  now: number,
  limit = 100,
): HistoryState<T> {
  if (value === state.present) return state;

  const coalesce =
    !!coalesceKey && coalesceKey === state.lastKey && now - state.lastTime < COALESCE_WINDOW_MS;

  const past = coalesce
    ? state.past
    : [...state.past, state.present].slice(Math.max(0, state.past.length + 1 - limit));

  return { present: value, past, future: [], lastKey: coalesceKey ?? null, lastTime: now };
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const present = state.past[state.past.length - 1];
  return {
    present,
    past: state.past.slice(0, -1),
    future: [state.present, ...state.future],
    lastKey: null,
    lastTime: state.lastTime,
  };
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const [present, ...future] = state.future;
  return {
    present,
    past: [...state.past, state.present],
    future,
    lastKey: null,
    lastTime: state.lastTime,
  };
}
