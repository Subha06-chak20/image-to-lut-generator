/**
 * Persisted application settings.
 *
 * The app had no settings store before this, so this is deliberately tiny: a
 * typed bag of values in localStorage with a change subscription. Anything that
 * can go wrong with storage (private browsing, quota, disabled storage, corrupt
 * payload) degrades to the in-memory defaults rather than throwing, so the app
 * keeps working even when persistence does not.
 */

/** The two Lutcraft studio appearances. */
export type ThemeId = 'light' | 'dark';

export const THEMES: { id: ThemeId; label: string; hint: string }[] = [
  { id: 'light', label: 'Light Studio', hint: 'Warm ivory workspace — the default.' },
  { id: 'dark', label: 'Dark Studio', hint: 'Low-luminance workspace for dark rooms.' },
];

export interface AppSettings {
  /**
   * Use the WebGL2 pipeline for preview rendering when the browser supports
   * it. When false the app uses the CPU renderer instead.
   */
  gpuAcceleration: boolean;
  /**
   * Application theme. The image viewer and scopes stay dark in both themes so
   * colour judgement is never affected by the surrounding chrome.
   */
  theme: ThemeId;
}

export const DEFAULT_SETTINGS: AppSettings = {
  gpuAcceleration: true,
  theme: 'light',
};

const STORAGE_KEY = 'lutcraft.settings.v1';

let cache: AppSettings | null = null;
const listeners = new Set<(settings: AppSettings) => void>();

/** Validate persisted values so a hand-edited payload can't poison the app. */
function sanitise(raw: unknown): AppSettings {
  const next = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    const bag = raw as Record<string, unknown>;
    if (typeof bag.gpuAcceleration === 'boolean') {
      next.gpuAcceleration = bag.gpuAcceleration;
    }
    if (bag.theme === 'light' || bag.theme === 'dark') {
      next.theme = bag.theme;
    }
  }
  return next;
}

function read(): AppSettings {
  if (cache) return cache;
  let next = { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) next = sanitise(JSON.parse(raw));
  } catch {
    // Storage unavailable or the payload is corrupt — stay in memory.
  }
  cache = next;
  return next;
}

function write(settings: AppSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is best-effort; the in-memory value is still authoritative.
  }
}

export function getSettings(): AppSettings {
  return read();
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...read(), ...patch };
  cache = next;
  write(next);
  listeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeSettings(fn: (settings: AppSettings) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
