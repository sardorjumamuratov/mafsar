import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDB } from '../src/db';
import { syncQuietly } from '../src/sync';
import { useTheme } from '../src/theme/useTheme';
import { Loading } from '../src/ui/components';

export default function RootLayout() {
  const t = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDB()
      .then(() => {
        setReady(true);
        syncQuietly();
      })
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  // Pull the extension's latest sets and push offline reviews whenever the app
  // comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncQuietly();
    });
    return () => sub.remove();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: t.colors.bg }}>
        <Text style={{ color: t.colors.ink, fontSize: 17 }}>Mafsar couldn't open its local storage.</Text>
        <Text style={{ color: t.colors.muted, marginTop: 8 }}>{error}</Text>
      </View>
    );
  }
  if (!ready) return <Loading />;

  return (
    <SafeAreaProvider>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen
          name="sets/[id]"
          options={{ headerShown: true, title: '', headerStyle: { backgroundColor: t.colors.bg }, headerTintColor: t.colors.primary, headerShadowVisible: false }}
        />
        <Stack.Screen
          name="delete-account"
          options={{ headerShown: true, title: 'Delete account', headerStyle: { backgroundColor: t.colors.bg }, headerTintColor: t.colors.ink, headerShadowVisible: false }}
        />
        <Stack.Screen name="review" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="quiz" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
