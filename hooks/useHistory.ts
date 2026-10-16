import { useCallback, useState } from 'react';
import { commitHistory, createHistory, redoHistory, undoHistory } from './historyCore';

export interface History<T> {
  state: T;
  set: (next: T | ((prev: T) => T), coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (value: T) => void;
}

/** React wrapper around the pure history core. */
export function useHistory<T>(initial: T, limit = 100): History<T> {
  const [hist, setHist] = useState(() => createHistory(initial));

  const set = useCallback(
    (next: T | ((prev: T) => T), coalesceKey?: string) => {
      const now = Date.now();
      setHist((prev) =>
        commitHistory(
          prev,
          typeof next === 'function' ? (next as (p: T) => T)(prev.present) : next,
          coalesceKey,
          now,
          limit,
        ),
      );
    },
    [limit],
  );

  const undo = useCallback(() => setHist((prev) => undoHistory(prev)), []);
  const redo = useCallback(() => setHist((prev) => redoHistory(prev)), []);
  const reset = useCallback(
    (value: T) => setHist((prev) => commitHistory(prev, value, undefined, Date.now(), limit)),
    [limit],
  );

  return {
    state: hist.present,
    set,
    undo,
    redo,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    reset,
  };
}
