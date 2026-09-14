import { View, Text, FlatList, TextInput, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useTheme } from '../../src/theme/useTheme';
import { useState, useCallback } from 'react';
import { getSetsWithDueCards } from '../../src/db/queries';
import { useFocusEffect, useRouter } from 'expo-router';
import { runSync } from '../../src/sync';

export default function SetsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [sets, setSets] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadSets = async () => {
    const data = await getSetsWithDueCards();
    setSets(data);
  };

  useFocusEffect(
    useCallback(() => {
      loadSets();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await runSync();
      await loadSets();
    } catch (e) {
      console.warn(e);
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = sets.filter(s => s.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <View style={{ padding: 16 }}>
        <TextInput 
          style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.ink, borderColor: theme.colors.border }]}
          placeholder="Search sets..."
          placeholderTextColor={theme.colors.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      
      <FlatList 
        data={filtered}
        keyExtractor={s => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <Text style={{ color: theme.colors.muted, fontSize: 17, textAlign: 'center' }}>
              No sets found. Sets you make in the extension will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/sets/${item.id}`)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.ink, fontSize: 17, fontWeight: 'bold' }}>{item.title}</Text>
            {item.source_label && <Text style={{ color: theme.colors.faint, fontSize: 13, marginTop: 4 }}>{item.source_label}</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>{item.dueCount} due</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  input: { padding: 12, borderRadius: 8, borderWidth: 1, fontSize: 17 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 }
});
