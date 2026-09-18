import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const STORAGE_KEY = 'pm-app-settings';
const SETTINGS_VERSION = 3;

const defaultSettings = {
  settingsVersion: SETTINGS_VERSION,
  /** @type {'sidebar' | 'top'} */
  navLayout: 'sidebar',
  /** @type {'cards' | 'list'} */
  customersView: 'cards',
};

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    let navLayout = parsed.navLayout === 'top' ? 'top' : 'sidebar';
    if ((parsed.settingsVersion ?? 1) < 2) {
      navLayout = 'sidebar';
    }
    const customersView = parsed.customersView === 'list' ? 'list' : 'cards';
    return {
      ...defaultSettings,
      ...parsed,
      navLayout,
      customersView,
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

  const setCustomersView = useCallback((customersView) => {
    setSettings((s) => ({ ...s, customersView: customersView === 'list' ? 'list' : 'cards' }));
  }, []);

  const value = useMemo(
    () => ({
      navLayout: settings.navLayout,
      setNavLayout,
      customersView: settings.customersView,
      setCustomersView,
    }),
    [settings.navLayout, settings.customersView, setNavLayout, setCustomersView]
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
