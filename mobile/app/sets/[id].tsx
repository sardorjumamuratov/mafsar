import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isDue, masteryOf } from '../../../shared/srs.js';
import { dueLabel, getSet } from '../../src/db/queries';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Loading, Panel, ProgressBar } from '../../src/ui/components';

type SetDetail = NonNullable<Awaited<ReturnType<typeof getSet>>>;

export default function SetDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [set, setSet] = useState<SetDetail | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (id) getSet(String(id)).then(setSet);
    }, [id])
  );

  if (set === undefined) return <Loading />;
  if (set === null) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg, padding: 24, justifyContent: 'center' }}>
        <Text style={{ color: t.colors.ink, fontSize: 17, textAlign: 'center' }}>This set was deleted.</Text>
        <Button title="Back to sets" variant="ghost" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const now = Date.now();
  const due = set.cards.filter((c) => isDue(c, now)).length;
  const mastered = set.cards.filter((c) => masteryOf(c) === 'mastered').length;
  const pct = set.cards.length ? Math.round((mastered / set.cards.length) * 100) : 0;
  const daysToExam = set.examDate && set.examDate > now ? Math.ceil((set.examDate - now) / 86_400_000) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ title: '' }} />
      <FlatList
        data={set.cards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.title, { color: t.colors.ink }]} accessibilityRole="header">{set.title}</Text>
            {!!set.sourceLabel && <Text style={{ color: t.colors.primary, marginTop: 6, fontSize: 15 }}>{set.sourceLabel}</Text>}

            <Panel style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ color: t.colors.ink, fontWeight: '700', fontSize: 15 }}>{pct}% mastered</Text>
                <Text style={{ color: t.colors.muted, fontSize: 15 }}>{mastered} of {set.cards.length}</Text>
              </View>
              <ProgressBar pct={pct} />
              <View style={styles.stats}>
                <Stat label="Due now" value={due} color={due ? t.colors.warm : t.colors.ink} />
                <Stat label="Cards" value={set.cards.length} color={t.colors.ink} />
                <Stat label="Quiz" value={set.quizCount} color={t.colors.ink} />
              </View>
              {daysToExam !== null && (
                <Text style={{ color: t.colors.muted, marginTop: 12, fontSize: 14 }}>
                  🎯 Exam in {daysToExam} day{daysToExam === 1 ? '' : 's'}. Reviews are timed to land before it.
                </Text>
              )}
            </Panel>

            <Text style={[styles.section, { color: t.colors.faint }]}>FLASHCARDS</Text>
          </View>
        }
        ListEmptyComponent={<Text style={{ color: t.colors.muted, fontSize: 15 }}>This set has no flashcards.</Text>}
        renderItem={({ item, index }) => {
          const expanded = open === item.id;
          return (
            <Pressable
              onPress={() => setOpen(expanded ? null : item.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityHint="Shows the answer"
              style={[
                styles.cardRow,
                {
                  backgroundColor: t.colors.surface, borderColor: t.colors.border,
                  borderTopLeftRadius: index === 0 ? 16 : 0, borderTopRightRadius: index === 0 ? 16 : 0,
                  borderBottomLeftRadius: index === set.cards.length - 1 ? 16 : 0,
                  borderBottomRightRadius: index === set.cards.length - 1 ? 16 : 0,
                  borderTopWidth: index === 0 ? 1 : 0,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={[styles.dot, { backgroundColor: dotColor(masteryOf(item), t.colors) }]} />
                <Text style={{ color: t.colors.ink, fontSize: 16, flex: 1, lineHeight: 22 }}>{item.front}</Text>
                <Text style={{ color: isDue(item, now) ? t.colors.warm : t.colors.faint, fontSize: 13 }}>{dueLabel(item.dueDate, now)}</Text>
              </View>
              {expanded && <Text style={{ color: t.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginLeft: 18 }}>{item.back}</Text>}
            </Pressable>
          );
        }}
      />

      <View style={[styles.footer, { borderTopColor: t.colors.border, paddingBottom: 16 + insets.bottom }]}>
        {set.quizCount > 0 && (
          <Button title="Quiz" variant="ghost" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/quiz', params: { setId: set.id } })} />
        )}
        <Button
          title={due ? `Review ${due} due` : 'Nothing due'}
          disabled={!due}
          style={{ flex: 2 }}
          onPress={() => router.push({ pathname: '/review', params: { setId: set.id } })}
        />
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color, fontSize: 22, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: t.colors.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function dotColor(m: string, c: ReturnType<typeof useTheme>['colors']) {
  return m === 'mastered' ? c.success : m === 'learning' ? c.warm : c.faint;
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  stats: { flexDirection: 'row', marginTop: 16 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 24 },
  cardRow: { paddingHorizontal: 14, paddingVertical: 14, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
