import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getUser, signOut, type AuthUser } from '../../src/auth';
import { getMeta } from '../../src/db';
import { getLibraryStats, getSets } from '../../src/db/queries';
import { runSync } from '../../src/sync';
import { useTheme, type ThemeMode } from '../../src/theme/useTheme';
import { Button, ErrorText, Panel, SectionLabel } from '../../src/ui/components';

export default function YouScreen() {
  const t = useTheme();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState({ streak: 0, total: 0, mastered: 0, sets: 0 });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, s, sets, at] = await Promise.all([getUser(), getLibraryStats(), getSets(), getMeta('lastSyncAt')]);
    setUser(u);
    setStats({ streak: s.streak, total: s.total, mastered: Math.round((s.masteredPct / 100) * s.total), sets: sets.length });
    setLastSyncAt(at);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      await runSync();
      await load();
    } catch (e: any) {
      setError(e?.message || "Couldn't sync. Check your connection.");
    } finally {
      setSyncing(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'Your sets stay on this phone. Reviews you haven\'t synced yet are sent next time you sign in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const modes: { mode: ThemeMode; label: string }[] = [
    { mode: 'system', label: 'System' },
    { mode: 'light', label: 'Light' },
    { mode: 'dark', label: 'Dark' },
  ];

  return (
    <ScrollView style={{ backgroundColor: t.colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Panel style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Text style={{ color: t.colors.warm, fontSize: 28, fontWeight: '700' }}>🔥 {stats.streak}</Text>
        <Text style={{ color: t.colors.muted, fontSize: 15, marginTop: 4 }}>day streak</Text>
      </Panel>

      <View style={styles.statsRow}>
        <Stat value={stats.mastered} label="Mastered" />
        <Stat value={stats.total} label="Cards" />
        <Stat value={stats.sets} label="Sets" />
      </View>

      <SectionLabel>Account</SectionLabel>
      <Panel>
        <Text style={{ color: t.colors.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{user?.email || 'Signed in'}</Text>
        <Text style={{ color: t.colors.muted, fontSize: 14, marginTop: 4 }}>
          {lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleString()}` : 'Not synced yet'}
        </Text>
        <ErrorText>{error}</ErrorText>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button title="Sync now" variant="ghost" loading={syncing} onPress={syncNow} style={{ flex: 1 }} />
          <Button title="Sign out" variant="ghost" onPress={confirmSignOut} style={{ flex: 1 }} />
        </View>
      </Panel>

      <View style={{ height: 24 }} />
      <SectionLabel>Appearance</SectionLabel>
      <View style={[styles.segment, { backgroundColor: t.colors.surface2 }]} accessibilityRole="radiogroup">
        {modes.map(({ mode, label }) => {
          const on = t.override === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => t.setThemeOverride(mode)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.segBtn, on && { backgroundColor: t.colors.surface }]}
            >
              <Text style={{ color: on ? t.colors.ink : t.colors.muted, fontWeight: on ? '600' : '400', fontSize: 15 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ height: 24 }} />
      <SectionLabel>Danger zone</SectionLabel>
      <Pressable
        onPress={() => router.push('/delete-account')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.settingRow, { backgroundColor: t.colors.surface, borderColor: t.colors.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.colors.ink, fontSize: 16, fontWeight: '600' }}>Delete account</Text>
          <Text style={{ color: t.colors.muted, fontSize: 13, marginTop: 2 }}>Permanently delete your account and data</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.colors.faint} />
      </Pressable>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const t = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      <Text style={{ color: t.colors.ink, fontSize: 22, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: t.colors.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  stat: { flex: 1, padding: 14, borderRadius: 16, borderWidth: 1 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 12 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1 },
});
