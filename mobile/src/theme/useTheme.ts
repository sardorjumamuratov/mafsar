import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';
import { palette, radii, space, typography } from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

export function useTheme() {
  const systemColorScheme = useColorScheme();
  const [override, setOverride] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('themeOverride').then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setOverride(val as ThemeMode);
      }
      setIsLoaded(true);
    });
  }, []);

  const setThemeOverride = async (mode: ThemeMode) => {
    setOverride(mode);
    await AsyncStorage.setItem('themeOverride', mode);
  };

  const activeMode = (override === 'system' ? (systemColorScheme || 'light') : override) as 'light' | 'dark';
  const colors = palette[activeMode];

  return {
    mode: activeMode,
    isLoaded,
    override,
    setThemeOverride,
    colors,
    radii,
    space,
    typography,
  };
}
