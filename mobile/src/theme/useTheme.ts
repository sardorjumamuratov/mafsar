import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { palette, radii, space, typography } from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

// One app-wide preference. Kept outside React so changing it on the You tab
// re-renders every screen, not just the one that changed it.
let override: ThemeMode = 'system';
const listeners = new Set<() => void>();

AsyncStorage.getItem('themeOverride')
  .then((val) => {
    if (val === 'light' || val === 'dark' || val === 'system') setOverride(val);
  })
  .catch(() => {});

function setOverride(mode: ThemeMode) {
  override = mode;
  listeners.forEach((l) => l());
}

export async function setThemeOverride(mode: ThemeMode) {
  setOverride(mode);
  await AsyncStorage.setItem('themeOverride', mode).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const system = useColorScheme();
  const mode = useSyncExternalStore(subscribe, () => override);
  const active: 'light' | 'dark' = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  return {
    mode: active,
    override: mode,
    setThemeOverride,
    colors: palette[active],
    radii,
    space,
    typography,
  };
}

export type Theme = ReturnType<typeof useTheme>;
