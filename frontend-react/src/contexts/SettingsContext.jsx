import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const STORAGE_KEY = 'pm-app-settings';
const SETTINGS_VERSION = 2;

const defaultSettings = {
  settingsVersion: SETTINGS_VERSION,
  /** @type {'sidebar' | 'top'} */
  navLayout: 'sidebar',
};

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    let navLayout = parsed.navLayout === 'top' ? 'top' : 'sidebar';
    // Sidebar is the app default; reset one-time for settings saved before v2
    if ((parsed.settingsVersion ?? 1) < SETTINGS_VERSION) {
      navLayout = 'sidebar';
    }
    return {
      ...defaultSettings,
      ...parsed,
      navLayout,
      settingsVersion: SETTINGS_VERSION,
    };
  } catch {
    return { ...defaultSettings };
  }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const setNavLayout = useCallback((navLayout) => {
    setSettings((s) => ({ ...s, navLayout }));
  }, []);

  const value = useMemo(
    () => ({
      navLayout: settings.navLayout,
      setNavLayout,
    }),
    [settings.navLayout, setNavLayout]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
