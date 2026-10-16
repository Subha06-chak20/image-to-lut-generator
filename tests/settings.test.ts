import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = 'schak-studio.settings.v1';

/** Minimal in-memory localStorage stand-in. */
function makeStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(KEY, initial);
  return {
    map,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

/** The store caches at module scope, so each case gets a fresh module. */
async function load(initial?: string) {
  const storage = makeStorage(initial);
  vi.resetModules();
  (globalThis as Record<string, unknown>).window = { localStorage: storage };
  const mod = await import('../services/settings/store');
  return { mod, storage };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe('settings store', () => {
  it('defaults to GPU acceleration ON', async () => {
    const { mod } = await load();
    expect(mod.getSettings()).toEqual({ gpuAcceleration: true });
    expect(mod.DEFAULT_SETTINGS.gpuAcceleration).toBe(true);
  });

  it('restores a persisted value', async () => {
    const { mod } = await load(JSON.stringify({ gpuAcceleration: false }));
    expect(mod.getSettings().gpuAcceleration).toBe(false);
  });

  it('survives a corrupt payload', async () => {
    const { mod } = await load('{not json at all');
    expect(mod.getSettings()).toEqual({ gpuAcceleration: true });
  });

  it('rejects a non-boolean field instead of letting it poison the app', async () => {
    const { mod } = await load(JSON.stringify({ gpuAcceleration: 'yes' }));
    expect(mod.getSettings().gpuAcceleration).toBe(true);
  });

  it('ignores unknown keys', async () => {
    const { mod } = await load(JSON.stringify({ gpuAcceleration: false, evil: 1 }));
    expect(mod.getSettings()).toEqual({ gpuAcceleration: false });
  });

  it('writes through to storage and returns the merged value', async () => {
    const { mod, storage } = await load();
    const next = mod.updateSettings({ gpuAcceleration: false });
    expect(next.gpuAcceleration).toBe(false);
    expect(storage.map.get(KEY)).toBe(JSON.stringify({ gpuAcceleration: false }));
    expect(mod.getSettings().gpuAcceleration).toBe(false);
  });

  it('notifies subscribers and unsubscribes cleanly', async () => {
    const { mod } = await load();
    const seen: boolean[] = [];
    const off = mod.subscribeSettings((s) => seen.push(s.gpuAcceleration));

    mod.updateSettings({ gpuAcceleration: false });
    mod.updateSettings({ gpuAcceleration: true });
    expect(seen).toEqual([false, true]);

    off();
    mod.updateSettings({ gpuAcceleration: false });
    expect(seen).toEqual([false, true]);
  });

  it('keeps working when storage throws (private mode)', async () => {
    vi.resetModules();
    (globalThis as Record<string, unknown>).window = {
      get localStorage(): never {
        throw new Error('denied');
      },
    };
    const mod = await import('../services/settings/store');
    expect(mod.getSettings().gpuAcceleration).toBe(true);
    expect(() => mod.updateSettings({ gpuAcceleration: false })).not.toThrow();
    expect(mod.getSettings().gpuAcceleration).toBe(false);
  });

  it('keeps working with no window at all (SSR / node)', async () => {
    vi.resetModules();
    const mod = await import('../services/settings/store');
    expect(mod.getSettings().gpuAcceleration).toBe(true);
    expect(() => mod.updateSettings({ gpuAcceleration: false })).not.toThrow();
  });
});
