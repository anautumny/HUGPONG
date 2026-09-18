import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'system',
  isDark: false,
  setTheme: () => {}
});

const STORAGE_KEY = 'hugpong_theme';

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      return 'system';
    }
  });

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    function applyTheme() {
      let activeIsDark = false;
      if (theme === 'dark') {
        activeIsDark = true;
      } else if (theme === 'light') {
        activeIsDark = false;
      } else {
        // System preference
        activeIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      setIsDark(activeIsDark);
      if (activeIsDark) {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
      }
    }

    applyTheme();

    if (theme === 'system' || theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const setTheme = newTheme => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch (e) {
      console.warn('[Theme] localStorage unavailable:', e);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
