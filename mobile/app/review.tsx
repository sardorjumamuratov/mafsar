import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getReviewQueue, previewIntervals, recordReview, type ReviewItem } from '../src/db/queries';
import { syncQuietly } from '../src/sync';
import { useTheme } from '../src/theme/useTheme';
import { Button, Loading } from '../src/ui/components';

type Grade = 0 | 3 | 4 | 5;

export default function ReviewScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setId } = useLocalSearchParams<{ setId?: string }>();
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const reviewed = useRef(0);

  useEffect(() => {
    getReviewQueue(setId ? String(setId) : undefined).then(setQueue);
  }, [setId]);

  const finish = () => {
    if (reviewed.current) syncQuietly();
    router.back();
  };

  if (queue === null) return <Loading />;

  if (idx >= queue.length) {
    return (
      <View style={[styles.done, { backgroundColor: t.colors.bg, paddingBottom: insets.bottom + 24 }]}>
        <Text style={{ fontSize: 40 }}>{reviewed.current ? '🎉' : '✅'}</Text>
        <Text style={{ color: t.colors.ink, fontSize: 24, fontWeight: '700', marginTop: 12 }}>
          {reviewed.current ? 'Session complete' : 'Nothing is due'}
        </Text>
        <Text style={{ color: t.colors.muted, fontSize: 17, marginTop: 8, textAlign: 'center' }}>
          {reviewed.current
            ? `You reviewed ${reviewed.current} card${reviewed.current === 1 ? '' : 's'}. They'll come back when you're about to forget them.`
            : 'Come back later, or pick a set to study.'}
        </Text>
        <Button title="Done" onPress={finish} style={{ marginTop: 32, alignSelf: 'stretch' }} />
      </View>
    );
  }

  const item = queue[idx];
  const iv = previewIntervals(item);

  const reveal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowAnswer(true);
  };

  const grade = async (g: Grade) => {
    if (busy) return;
    setBusy(true);
    if (g >= 4) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else Haptics.impactAsync(g === 0 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const updated = await recordReview(item, g);
      reviewed.current++;
      const next = [...queue];
      // "Again" brings the card back later in this session, with its new state.
      if (g === 0) next.splice(Math.min(idx + 4, next.length), 0, { ...item, card: updated });
      setQueue(next);
      setShowAnswer(false);
      setIdx(idx + 1);
    } finally {
      setBusy(false);
    }
  };

  const days = (n: number) => (n <= 1 ? '1d' : n < 30 ? `${n}d` : `${Math.round(n / 30)}mo`);
  const grades: { g: Grade; label: string; color: string; hint: string }[] = [
    { g: 0, label: 'Again', color: t.colors.danger, hint: days(iv.again) },
    { g: 3, label: 'Hard', color: t.colors.warm, hint: days(iv.hard) },
    { g: 4, label: 'Good', color: t.colors.success, hint: days(iv.good) },
    { g: 5, label: 'Easy', color: t.colors.primary, hint: days(iv.easy) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close review" style={{ padding: 16 }}>
          <Text style={{ color: t.colors.muted, fontSize: 22 }}>✕</Text>
        </Pressable>
        <Text style={{ color: t.colors.muted, fontSize: 16, padding: 16 }}>{idx + 1} / {queue.length}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: t.colors.surface2 }]}>
        <View style={{ width: `${(idx / queue.length) * 100}%`, height: '100%', backgroundColor: t.colors.primary }} />
      </View>

      <Pressable style={{ flex: 1, padding: 16 }} onPress={showAnswer ? undefined : reveal} accessibilityHint={showAnswer ? undefined : 'Shows the answer'}>
        <ScrollView style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]} contentContainerStyle={{ padding: 24 }}>
          <Text style={[styles.label, { color: t.colors.faint }]}>QUESTION</Text>
          <Text style={[styles.cardText, { color: t.colors.ink, fontFamily: t.typography.serif.fontFamily }]}>{item.card.front}</Text>
          {showAnswer && (
            <>
              <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: 24 }} />
              <Text style={[styles.label, { color: t.colors.faint }]}>ANSWER</Text>
              <Text style={[styles.cardText, { color: t.colors.ink, fontFamily: t.typography.serif.fontFamily }]} accessibilityLiveRegion="polite">
                {item.card.back}
              </Text>
            </>
          )}
        </ScrollView>
      </Pressable>

      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom }}>
        {!showAnswer ? (
          <Button title="Show answer" onPress={reveal} />
        ) : (
          <View style={styles.gradeRow}>
            {grades.map(({ g, label, color, hint }) => (
              <Pressable
                key={g}
                onPress={() => grade(g)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${label}, next review in ${hint}`}
                style={({ pressed }) => [
                  styles.gradeBtn,
                  { backgroundColor: t.colors.surface, borderColor: t.colors.border, opacity: pressed || busy ? 0.6 : 1 },
                ]}
              >
                <Text style={{ color, fontWeight: '700', fontSize: 16 }}>{label}</Text>
                <Text style={{ color: t.colors.muted, fontSize: 13, marginTop: 2 }}>{hint}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 3, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  card: { flex: 1, borderRadius: 16, borderWidth: 1 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 12 },
  cardText: { fontSize: 22, lineHeight: 32 },
  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: { flex: 1, minHeight: 60, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
