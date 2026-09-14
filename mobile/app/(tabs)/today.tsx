import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../src/theme/useTheme';
import { useState, useEffect, useCallback } from 'react';
import { getLibraryStats, getSetsWithDueCards } from '../../src/db/queries';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
// import { examReadiness } from '../../../shared/readiness.js'; // etc.

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [stats, setStats] = useState({ dueCount: 0, masteryPct: 0, totalCards: 0 });
  const [dueSets, setDueSets] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getLibraryStats(), getSetsWithDueCards()]).then(([s, d]) => {
        setStats(s);
        setDueSets(d);
      });
    }, [])
  );

  const mins = Math.max(1, Math.round(stats.dueCount * 0.4));

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.ink, fontSize: 28, fontWeight: 'bold' }}>Good evening</Text>
          <View style={{ backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radii.sm }}>
            <Text style={{ color: theme.colors.warm, fontWeight: 'bold' }}>🔥 12</Text>
          </View>
        </View>
        
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={{ color: theme.colors.ink, fontSize: 48, fontWeight: '700' }}>{stats.dueCount}</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 17 }}>cards due · ~{mins} min</Text>
          
          <View style={{ marginTop: 16, height: 8, backgroundColor: theme.colors.surface2, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${stats.masteryPct}%`, height: '100%', backgroundColor: theme.colors.primary }} />
          </View>
          <Text style={{ color: theme.colors.faint, marginTop: 8, fontSize: 13 }}>{stats.masteryPct}% mastered</Text>
        </View>

        {dueSets.length > 0 && (
          <View style={{ marginTop: 32 }}>
            <Text style={{ color: theme.colors.ink, fontSize: 22, fontWeight: 'bold', marginBottom: 12 }}>Continue</Text>
            {dueSets.slice(0, 3).map(s => (
              <TouchableOpacity key={s.id} onPress={() => router.push(`/sets/${s.id}`)} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
                <Text style={{ color: theme.colors.ink, fontSize: 17, flex: 1 }}>{s.title}</Text>
                <Text style={{ color: theme.colors.muted, fontSize: 15 }}>{s.dueCount} due  ›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
      
      {/* Pinned Button */}
      <View style={[styles.footer, { backgroundColor: theme.colors.bg, borderTopColor: theme.colors.border }]}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.primary }]} onPress={() => router.push('/review')}>
          <Text style={{ color: theme.colors.surface, fontSize: 17, fontWeight: 'bold' }}>Review {stats.dueCount} cards</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { marginTop: 24, padding: 24, borderRadius: 16, borderWidth: 1 },
  row: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1 },
  footer: { padding: 16, borderTopWidth: 1 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' }
});
