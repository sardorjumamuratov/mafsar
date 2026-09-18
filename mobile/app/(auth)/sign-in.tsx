import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loginWithEmail } from '../../src/auth';
import { clearLocalData } from '../../src/db';
import { runSync } from '../../src/sync';
import { useTheme } from '../../src/theme/useTheme';
import { Button, ErrorText } from '../../src/ui/components';

export default function SignInScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = /\S+@\S+\.\S+/.test(email.trim()) && password.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const otherAccount = await loginWithEmail(email, password);
      if (otherAccount) await clearLocalData();
      await runSync().catch(() => {});
      router.replace('/(tabs)/today');
    } catch (e: any) {
      setError(e?.message || "Couldn't sign in.");
      setBusy(false);
    }
  };

  const input = [styles.input, { backgroundColor: t.colors.surface, color: t.colors.ink, borderColor: t.colors.border }];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: t.colors.bg, paddingTop: insets.top + 12 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={{ color: t.colors.primary, fontSize: 17 }}>‹ Back</Text>
      </Pressable>
      <Text style={[styles.title, { color: t.colors.ink }]}>Sign in</Text>

      <TextInput
        style={input}
        placeholder="Email"
        placeholderTextColor={t.colors.faint}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        accessibilityLabel="Email"
      />
      <TextInput
        style={input}
        placeholder="Password"
        placeholderTextColor={t.colors.faint}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        accessibilityLabel="Password"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={submit} disabled={!ready} loading={busy} style={{ marginTop: 12 }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28 },
  title: { fontSize: 30, fontWeight: '700', marginTop: 24, marginBottom: 24 },
  input: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 14, fontSize: 17 },
});
