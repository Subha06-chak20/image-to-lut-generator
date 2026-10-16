import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = 'lutcraft.settings.v1';

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
  it('defaults to GPU acceleration ON and Light Studio', async () => {
    const { mod } = await load();
    expect(mod.getSettings()).toEqual({ gpuAcceleration: true, theme: 'light' });
    expect(mod.DEFAULT_SETTINGS.gpuAcceleration).toBe(true);
    expect(mod.DEFAULT_SETTINGS.theme).toBe('light');
  });

  it('offers exactly the two documented themes', async () => {
    const { mod } = await load();
    expect(mod.THEMES.map((t) => t.id)).toEqual(['light', 'dark']);
  });

  it('restores persisted values', async () => {
    const { mod } = await load(JSON.stringify({ gpuAcceleration: false, theme: 'dark' }));
    expect(mod.getSettings().gpuAcceleration).toBe(false);
    expect(mod.getSettings().theme).toBe('dark');
  });

  it('survives a corrupt payload', async () => {
    const { mod } = await load('{not json at all');
    expect(mod.getSettings()).toEqual({ gpuAcceleration: true, theme: 'light' });
  });

  it('rejects invalid fields instead of letting them poison the app', async () => {
    const { mod } = await load(JSON.stringify({ gpuAcceleration: 'yes', theme: 'neon' }));
    expect(mod.getSettings()).toEqual({ gpuAcceleration: true, theme: 'light' });
  });

  it('ignores unknown keys', async () => {
    const { mod } = await load(JSON.stringify({ gpuAcceleration: false, evil: 1 }));
    expect(mod.getSettings()).toEqual({ gpuAcceleration: false, theme: 'light' });
  });

  it('writes through to storage and returns the merged value', async () => {
    const { mod, storage } = await load();
    const next = mod.updateSettings({ gpuAcceleration: false });
    expect(next.gpuAcceleration).toBe(false);
    expect(storage.map.get(KEY)).toBe(
      JSON.stringify({ gpuAcceleration: false, theme: 'light' }),
    );
    expect(mod.getSettings().gpuAcceleration).toBe(false);
  });

  it('persists a theme switch', async () => {
    const { mod, storage } = await load();
    mod.updateSettings({ theme: 'dark' });
    expect(mod.getSettings().theme).toBe('dark');
    expect(JSON.parse(storage.map.get(KEY) as string).theme).toBe('dark');
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
