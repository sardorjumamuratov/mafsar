import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CancelledError, loginWithGoogle } from '../../src/auth';
import { clearLocalData } from '../../src/db';
import { runSync } from '../../src/sync';
import { useTheme } from '../../src/theme/useTheme';
import { Button, ErrorText } from '../../src/ui/components';

export default function WelcomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      const otherAccount = await loginWithGoogle();
      if (otherAccount) await clearLocalData();
      await runSync().catch(() => {});
      router.replace('/(tabs)/today');
    } catch (e: any) {
      if (!(e instanceof CancelledError)) setError(e?.message || 'Google sign-in failed.');
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: t.colors.bg, paddingBottom: insets.bottom + 32 }]}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={[styles.logo, { color: t.colors.ink }]}>
          Maf<Text style={{ color: t.colors.primary }}>sar</Text>
        </Text>
        <Text style={[styles.title, { color: t.colors.ink }]}>Review your cards anywhere.</Text>
        <Text style={[styles.subtitle, { color: t.colors.muted }]}>
          Sets you make with the Mafsar browser extension show up here. Reviews on your phone count toward the same streak.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <ErrorText>{error}</ErrorText>
        <Button title="Continue with Google" variant="ghost" onPress={google} loading={busy} />
        <Button title="Sign in with email" onPress={() => router.push('/(auth)/sign-in')} disabled={busy} />
        <Text style={{ color: t.colors.faint, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
          New to Mafsar? Create your account in the browser extension.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28 },
  logo: { fontSize: 34, fontWeight: '800', marginBottom: 28 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12, lineHeight: 34 },
  subtitle: { fontSize: 17, lineHeight: 25 },
});
