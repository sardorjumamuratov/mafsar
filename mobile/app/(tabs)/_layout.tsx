import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ColorValue } from 'react-native';
import { useTheme } from '../../src/theme/useTheme';

export default function TabLayout() {
  const t = useTheme();
  const icon = (name: keyof typeof Ionicons.glyphMap) =>
    ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.muted,
        tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border },
        headerStyle: { backgroundColor: t.colors.bg },
        headerTitleStyle: { color: t.colors.ink },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.colors.bg },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today', headerShown: false, tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="sets" options={{ title: 'Sets', tabBarIcon: icon('albums-outline') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
