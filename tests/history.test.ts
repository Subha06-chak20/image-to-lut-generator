import { describe, expect, it } from 'vitest';
import { commitHistory, createHistory, redoHistory, undoHistory } from '../hooks/historyCore';

describe('history core', () => {
  it('commits and undoes to the prior value', () => {
    let s = createHistory(0);
    s = commitHistory(s, 1, undefined, 1000);
    s = commitHistory(s, 2, undefined, 2000);
    expect(s.present).toBe(2);
    expect(s.past).toEqual([0, 1]);

    s = undoHistory(s);
    expect(s.present).toBe(1);
    s = undoHistory(s);
    expect(s.present).toBe(0);
    s = undoHistory(s);
    expect(s.present).toBe(0); // no-op at the bottom
  });

  it('redoes forward again', () => {
    let s = createHistory(0);
    s = commitHistory(s, 1, undefined, 1000);
    s = commitHistory(s, 2, undefined, 2000);
    s = undoHistory(s);
    s = undoHistory(s);
    expect(s.present).toBe(0);
    s = redoHistory(s);
    expect(s.present).toBe(1);
    s = redoHistory(s);
    expect(s.present).toBe(2);
    s = redoHistory(s);
    expect(s.present).toBe(2); // no-op at the top
  });

  it('clears the redo stack on a new commit', () => {
    let s = createHistory(0);
    s = commitHistory(s, 1, undefined, 1000);
    s = undoHistory(s);
    expect(s.future).toEqual([1]);
    s = commitHistory(s, 5, undefined, 3000);
    expect(s.future).toEqual([]);
  });

  it('coalesces rapid changes sharing a key', () => {
    let s = createHistory(0);
    s = commitHistory(s, 1, 'slider', 1000);
    s = commitHistory(s, 2, 'slider', 1100);
    s = commitHistory(s, 3, 'slider', 1200);
    // Three rapid slider ticks should be a single undo step.
    expect(s.past).toEqual([0]);
    expect(s.present).toBe(3);
    s = undoHistory(s);
    expect(s.present).toBe(0);
  });

  it('does not coalesce beyond the time window', () => {
    let s = createHistory(0);
    s = commitHistory(s, 1, 'slider', 1000);
    s = commitHistory(s, 2, 'slider', 5000);
    expect(s.past).toEqual([0, 1]);
  });

  it('ignores no-op commits', () => {
    let s = createHistory(5);
    const before = s;
    s = commitHistory(s, 5, undefined, 1000);
    expect(s).toBe(before);
  });

  it('respects the history limit', () => {
    let s = createHistory(0);
    for (let i = 1; i <= 10; i++) s = commitHistory(s, i, undefined, i * 1000, 3);
    expect(s.past.length).toBeLessThanOrEqual(3);
    expect(s.present).toBe(10);
  });
});
