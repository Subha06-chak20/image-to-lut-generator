import { useCallback, useEffect, useState } from 'react';
import { AppSettings, getSettings, subscribeSettings, updateSettings } from '../services/settings/store';

/**
 * Subscribe a component to the persisted application settings.
 *
 * Returns the current settings plus a setter that writes through to storage and
 * notifies every subscriber, so several components can read the same value
 * (the header badge, the settings panel, the preview) without prop drilling.
 */
export function useSettings(): [AppSettings, (patch: Partial<AppSettings>) => void] {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  useEffect(() => subscribeSettings(setSettings), []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    updateSettings(patch);
  }, []);

  return [settings, update];
}
