import type React from 'react';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { deleteAccount, fetchMe, forgetAccount, getUser } from '../src/auth';
import { clearLocalData } from '../src/db';
import { useTheme } from '../src/theme/useTheme';
import { Button, ErrorText, Panel, SectionLabel } from '../src/ui/components';

const CONFIRM_WORD = 'DELETE';

export default function DeleteAccountScreen() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  // Assume a password is needed until the server says otherwise: a failed
  // lookup can only make the form stricter.
  const [hasPassword, setHasPassword] = useState(true);
  const [plan, setPlan] = useState('free');
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUser().then((u) => setEmail(u?.email || ''));
    fetchMe()
      .then((me) => {
        if (!me) return;
        setHasPassword(me.hasPassword);
        setPlan(me.plan);
      })
      .catch(() => {});
  }, []);

  const ready = typed.trim() === CONFIRM_WORD && (!hasPassword || password.length > 0);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(hasPassword ? password : undefined);
      await clearLocalData();
      await forgetAccount();
      router.replace('/(auth)/welcome');
    } catch (e: any) {
      setError(e?.message || "Couldn't delete your account. Try again.");
      setBusy(false);
    }
  };

  const input = [styles.input, { backgroundColor: t.colors.surface, color: t.colors.ink, borderColor: t.colors.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.lead, { color: t.colors.ink }]}>
          Deleting your account permanently removes it and everything in it. This can't be undone.
        </Text>

        <SectionLabel>What gets deleted</SectionLabel>
        <View style={{ marginBottom: 20, gap: 6 }}>
          <Bullet>Your study sets, flashcards, quizzes and review history</Bullet>
          <Bullet>Teams you created. Members lose access, and you leave teams you joined.</Bullet>
          {(plan === 'plus' || plan === 'pro') && (
            <Bullet>Your {plan === 'pro' ? 'Pro' : 'Plus'} subscription, cancelled right away with no further charges</Bullet>
          )}
          <Bullet>Everything Mafsar stored on this phone</Bullet>
        </View>

        <Panel style={{ marginBottom: 20 }}>
          <Text style={{ color: t.colors.ink, fontWeight: '600', fontSize: 15 }}>Want a copy first?</Text>
          <Text style={{ color: t.colors.muted, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
            Export your data from the Mafsar browser extension (You tab, then Export) before deleting.
          </Text>
        </Panel>

        {!!email && <Text style={{ color: t.colors.muted, fontSize: 14, marginBottom: 12 }}>Signed in as {email}</Text>}

        {hasPassword ? (
          <>
            <Text style={[styles.fieldLabel, { color: t.colors.muted }]}>Enter your password to continue</Text>
            <TextInput
              style={input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel="Password"
            />
          </>
        ) : (
          <Text style={{ color: t.colors.muted, fontSize: 14, marginBottom: 12 }}>You signed in with Google, so no password is needed.</Text>
        )}

        <Text style={[styles.fieldLabel, { color: t.colors.muted }]}>To confirm, type {CONFIRM_WORD}</Text>
        <TextInput
          style={input}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
        />

        <ErrorText>{error}</ErrorText>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
          <Button title="Delete account" variant="danger" onPress={submit} disabled={!ready} loading={busy} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ color: t.colors.muted, fontSize: 15 }}>•</Text>
      <Text style={{ color: t.colors.muted, fontSize: 15, lineHeight: 21, flex: 1 }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 16, lineHeight: 23, marginBottom: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 17, marginBottom: 14 },
});
