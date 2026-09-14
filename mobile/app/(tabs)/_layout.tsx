import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme/useTheme';

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.muted,
      tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      headerStyle: { backgroundColor: theme.colors.surface },
      headerTintColor: theme.colors.ink
    }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="sets" options={{ title: 'Sets' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
