import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { initDB } from '../src/db';
import { View, Text } from 'react-native';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDB().then(() => setDbReady(true));
  }, []);

  if (!dbReady) {
    return <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}><Text>Loading...</Text></View>;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="sets/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="review" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="quiz" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}
