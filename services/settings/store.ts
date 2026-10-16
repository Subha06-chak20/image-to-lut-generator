/**
 * Persisted application settings.
 *
 * The app had no settings store before this, so this is deliberately tiny: a
 * typed bag of values in localStorage with a change subscription. Anything that
 * can go wrong with storage (private browsing, quota, disabled storage, corrupt
 * payload) degrades to the in-memory defaults rather than throwing, so the app
 * keeps working even when persistence does not.
 */

export interface AppSettings {
  /**
   * Use the WebGL2 pipeline for preview rendering when the browser supports
   * it. When false the app uses the CPU renderer instead.
   */
  gpuAcceleration: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  gpuAcceleration: true,
};

const STORAGE_KEY = 'schak-studio.settings.v1';

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
