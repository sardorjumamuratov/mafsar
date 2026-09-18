import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getSets, type SetSummary } from '../../src/db/queries';
import { runSync } from '../../src/sync';
import { useTheme } from '../../src/theme/useTheme';
import { ErrorText, ProgressBar } from '../../src/ui/components';

export default function SetsScreen() {
  const t = useTheme();
  const router = useRouter();
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setSets(await getSets()), []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await runSync();
    } catch (e: any) {
      setError(e?.message || "Couldn't sync. Check your connection.");
    }
    await load();
    setRefreshing(false);
  };

  const q = search.trim().toLowerCase();
  const filtered = (sets || []).filter((s) => !q || s.title.toLowerCase().includes(q));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
        <TextInput
          style={[styles.input, { backgroundColor: t.colors.surface, color: t.colors.ink, borderColor: t.colors.border }]}
          placeholder="Search sets"
          placeholderTextColor={t.colors.faint}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          accessibilityLabel="Search sets"
        />
        <ErrorText>{error}</ErrorText>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          sets === null ? null : (
            <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 24 }}>
              <Text style={{ color: t.colors.muted, fontSize: 17, textAlign: 'center', lineHeight: 24 }}>
                {q ? `No sets match "${search.trim()}".` : 'No sets yet. Sets you make in the browser extension appear here. Pull down to sync.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const pct = item.total ? Math.round((item.mastered / item.total) * 100) : 0;
          return (
            <Pressable
              onPress={() => router.push(`/sets/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${item.due} due, ${item.total} cards`}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: t.colors.surface, borderColor: t.colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={{ color: t.colors.ink, fontSize: 17, fontWeight: '600', flex: 1 }} numberOfLines={2}>{item.title}</Text>
                {item.due > 0 && (
                  <View style={[styles.pill, { backgroundColor: t.colors.surface2 }]}>
                    <Text style={{ color: t.colors.warm, fontSize: 13, fontWeight: '600' }}>{item.due} due</Text>
                  </View>
                )}
              </View>
              <View style={{ marginTop: 12 }}>
                <ProgressBar pct={pct} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: t.colors.muted, fontSize: 13 }}>{pct}% mastered · {item.total} cards</Text>
                {!!item.sourceLabel && <Text style={{ color: t.colors.faint, fontSize: 13 }}>{item.sourceLabel}</Text>}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, fontSize: 17 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
});
