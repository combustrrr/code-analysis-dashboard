import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Segmented } from 'antd';

export type Appearance = 'dark' | 'light';

type AppearanceContextValue = {
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);

function savedAppearance(): Appearance {
  try {
    return localStorage.getItem('analysis-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(savedAppearance);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    try {
      localStorage.setItem('analysis-theme', appearance);
    } catch {
      // Theme still applies for this page view when storage is unavailable.
    }
  }, [appearance]);

  return <AppearanceContext.Provider value={{ appearance, setAppearance }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('AppearanceProvider is required.');
  return value;
}

export function AppearanceToggle({ className = '' }: { className?: string }) {
  const { appearance, setAppearance } = useAppearance();
  return <Segmented
    className={className}
    aria-label="Color theme"
    value={appearance}
    options={[{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }]}
    onChange={value => setAppearance(value as Appearance)}
  />;
}
