import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibraryStats, getSets, type SetSummary } from '../../src/db/queries';
import { runSync } from '../../src/sync';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Panel, ProgressBar, SectionLabel } from '../../src/ui/components';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

type Stats = Awaited<ReturnType<typeof getLibraryStats>>;

export default function TodayScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [s, all] = await Promise.all([getLibraryStats(), getSets()]);
    setStats(s);
    setSets(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await runSync();
    } catch {
      /* offline: show what we have */
    }
    await load();
    setRefreshing(false);
  };

  const due = stats?.due ?? 0;
  const mins = Math.max(1, Math.round(due * 0.4));
  const dueSets = sets.filter((s) => s.due > 0);
  const empty = stats !== null && stats.total === 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={{ color: t.colors.muted, fontSize: 15 }}>{greeting()}</Text>
            <Text style={[styles.title, { color: t.colors.ink }]}>Today</Text>
          </View>
          {!!stats && (
            <View
              style={[styles.streak, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}
              accessibilityLabel={`${stats.streak} day streak`}
            >
              <Text style={{ color: t.colors.warm, fontWeight: '700', fontSize: 15 }}>🔥 {stats.streak}</Text>
            </View>
          )}
        </View>

        {empty ? (
          <Panel style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 28 }}>📚</Text>
            <Text style={[styles.h2, { color: t.colors.ink, marginTop: 8 }]}>No sets yet</Text>
            <Text style={[styles.body, { color: t.colors.muted, textAlign: 'center' }]}>
              Make a set with the Mafsar browser extension, then pull down here to sync it.
            </Text>
          </Panel>
        ) : (
          <Panel style={{ marginTop: 20 }}>
            {due > 0 ? (
              <>
                <Text style={{ color: t.colors.ink, fontSize: 48, fontWeight: '700' }}>{due}</Text>
                <Text style={{ color: t.colors.muted, fontSize: 17 }}>
                  card{due === 1 ? '' : 's'} due · about {mins} min
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.h2, { color: t.colors.ink }]}>You're all caught up ✅</Text>
                <Text style={[styles.body, { color: t.colors.muted }]}>
                  {stats?.reviewedToday ? `${stats.reviewedToday} reviewed today. ` : ''}Nothing else is due right now.
                </Text>
              </>
            )}
            <View style={{ marginTop: 16 }}>
              <ProgressBar pct={stats?.masteredPct ?? 0} />
              <Text style={{ color: t.colors.faint, marginTop: 8, fontSize: 13 }}>{stats?.masteredPct ?? 0}% mastered</Text>
            </View>
          </Panel>
        )}

        {!!stats && !empty && (
          <View style={{ marginTop: 24 }}>
            <SectionLabel>This week</SectionLabel>
            <View style={styles.week}>
              {stats.week.map((d) => (
                <View key={d.key} style={{ alignItems: 'center', flex: 1 }}>
                  <View
                    style={[
                      styles.dayDot,
                      { backgroundColor: d.count ? t.colors.primary : t.colors.surface2, borderColor: d.isToday ? t.colors.primary : 'transparent' },
                    ]}
                    accessibilityLabel={`${d.label}: ${d.count} reviews`}
                  />
                  <Text style={{ color: t.colors.faint, fontSize: 12, marginTop: 4 }}>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {dueSets.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <SectionLabel>Continue</SectionLabel>
            <Panel style={{ paddingVertical: 4 }}>
              {dueSets.slice(0, 5).map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push(`/sets/${s.id}`)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    { borderTopColor: t.colors.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={{ color: t.colors.ink, fontSize: 17, flex: 1 }} numberOfLines={1}>{s.title}</Text>
                  <Text style={{ color: t.colors.warm, fontSize: 15 }}>{s.due} due ›</Text>
                </Pressable>
              ))}
            </Panel>
          </View>
        )}
      </ScrollView>

      {due > 0 && (
        <View style={[styles.footer, { borderTopColor: t.colors.border, backgroundColor: t.colors.bg }]}>
          <Button title={`Review ${due} card${due === 1 ? '' : 's'}`} onPress={() => router.push('/review')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '700' },
  streak: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  h2: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  week: { flexDirection: 'row' },
  dayDot: { width: 28, height: 28, borderRadius: 8, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
