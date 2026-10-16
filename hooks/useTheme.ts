import { useEffect } from 'react';
import { ThemeId } from '../services/settings/store';

/** The `<meta name="theme-color">` value per theme — matches the token backgrounds. */
const THEME_COLOR: Record<ThemeId, string> = {
  light: '#F5F4F0',
  dark: '#171717',
};

/**
 * Keep the document in step with the persisted theme.
 *
 * Light Studio is the default, so only the dark class is added. `color-scheme`
 * and the theme-color meta are updated too, which keeps native widgets
 * (scrollbars, file pickers) and mobile browser chrome consistent with the app.
 *
 * The same theme is also applied pre-paint by an inline script in index.html so
 * a Dark Studio reload never flashes the light background first.
 */
export function useTheme(theme: ThemeId): void {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
}
