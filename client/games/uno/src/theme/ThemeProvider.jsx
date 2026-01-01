import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'theme';
const VALID_THEMES = new Set(['light', 'dark']);

function getStoredTheme() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.has(t) ? t : null;
  } catch (e) {
    return null;
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Default is always light; only use dark if user explicitly stored it before.
  const [theme, setTheme] = useState(() => (getStoredTheme() === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    try {
      document.documentElement.dataset.theme = theme;
    } catch (e) {}
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }, [theme]);

  useEffect(() => {
    const onStorage = (e) => {
      if (!e || e.key !== STORAGE_KEY) return;
      const next = e.newValue === 'dark' ? 'dark' : 'light';
      if (next !== theme) setTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [theme]);

  const value = useMemo(() => {
    const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    return { theme, setTheme, toggleTheme };
  }, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
