import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const STORAGE_KEY = 'pm-app-settings';

const defaultSettings = {
  /** @type {'sidebar' | 'top'} */
  navLayout: 'sidebar',
};

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      navLayout: parsed.navLayout === 'top' ? 'top' : 'sidebar',
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
