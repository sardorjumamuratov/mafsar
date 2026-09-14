import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/useTheme';
import { useState, useEffect } from 'react';
import { getReviewQueue, CardRow } from '../src/db/queries';
import { getDB } from '../src/db';
import { review, byDue } from '../../shared/srs.js';
import * as Haptics from 'expo-haptics';

export default function ReviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [queue, setQueue] = useState<CardRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReviewQueue().then(cards => {
      // Sort by due date (byDue handles nulls etc.)
      const sorted = cards.sort((a, b) => byDue({ dueDate: a.due_date }, { dueDate: b.due_date }));
      setQueue(sorted);
      setLoading(false);
    });
  }, []);

  if (loading) return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  if (idx >= queue.length || queue.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.colors.ink, fontSize: 22, fontWeight: 'bold' }}>{queue.length} cards reviewed</Text>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, marginTop: 24 }]} onPress={() => router.back()}>
          <Text style={{ color: theme.colors.surface, fontSize: 17, fontWeight: 'bold' }}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const card = queue[idx];

  const handleReveal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAnswer(true);
  };

  const handleGrade = async (grade: 0 | 3 | 4 | 5) => {
    if (grade >= 4) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (grade === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const now = Date.now();
    const prevInterval = card.interval || 0;
    
    // Calculate new schedule
    const c = { id: card.id, easiness: card.easiness, interval: card.interval, repetitions: card.repetitions, dueDate: card.due_date || 0 };
    const next = review(c, grade, now, null);
    
    const db = await getDB();
    const isoNow = new Date(now).toISOString();
    
    await db.withTransactionAsync(async () => {
      // Update card
      await db.runAsync(
        'UPDATE cards SET easiness = ?, interval = ?, repetitions = ?, due_date = ?, updated_at = ?, dirty = 1 WHERE id = ?',
        [next.easiness, next.interval, next.repetitions, next.dueDate, isoNow, card.id]
      );
      // Append review log
      const logId = Math.random().toString(36).slice(2);
      await db.runAsync(
        'INSERT INTO review_log (id, card_id, grade, prev_interval, new_interval, reviewed_at, dirty) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [logId, card.id, grade, prevInterval, next.interval, isoNow]
      );
    });

    // Relearn requeue
    let nextQueue = [...queue];
    if (grade < 3) {
      // insert 3 positions later
      const insertAt = Math.min(idx + 4, nextQueue.length);
      nextQueue.splice(insertAt, 0, card);
    }
    
    setQueue(nextQueue);
    setShowAnswer(false);
    setIdx(idx + 1);
  };

  // Preview intervals
  const c = { id: card.id, easiness: card.easiness, interval: card.interval, repetitions: card.repetitions, dueDate: card.due_date || 0 };
  const now = Date.now();
  const iAgain = Math.round(review(c, 0, now, null).interval);
  const iHard = Math.round(review(c, 3, now, null).interval);
  const iGood = Math.round(review(c, 4, now, null).interval);
  const iEasy = Math.round(review(c, 5, now, null).interval);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 16 }}>
          <Text style={{ color: theme.colors.muted, fontSize: 24 }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ color: theme.colors.muted, fontSize: 17, padding: 16 }}>{idx + 1} / {queue.length}</Text>
      </View>

      <TouchableOpacity activeOpacity={1} style={styles.cardArea} onPress={!showAnswer ? handleReveal : undefined}>
        <ScrollView style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={{ color: theme.colors.faint, fontSize: 13, fontWeight: 'bold', marginBottom: 12 }}>QUESTION</Text>
          <Text style={{ color: theme.colors.ink, fontSize: theme.typography.serif.sizes.card, fontFamily: theme.typography.serif.fontFamily, lineHeight: 32 }}>{card.front}</Text>
          
          {showAnswer && (
            <>
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 24 }} />
              <Text style={{ color: theme.colors.faint, fontSize: 13, fontWeight: 'bold', marginBottom: 12 }}>ANSWER</Text>
              <Text style={{ color: theme.colors.ink, fontSize: theme.typography.serif.sizes.card, fontFamily: theme.typography.serif.fontFamily, lineHeight: 32 }}>{card.back}</Text>
            </>
          )}
        </ScrollView>
      </TouchableOpacity>

      <View style={styles.footer}>
        {!showAnswer ? (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]} onPress={handleReveal}>
            <Text style={{ color: theme.colors.surface, fontSize: 17, fontWeight: 'bold' }}>Show answer</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.gradeRow}>
            <TouchableOpacity style={[styles.gradeBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => handleGrade(0)}>
              <Text style={{ color: theme.colors.danger, fontWeight: 'bold', fontSize: 17 }}>Again</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>{iAgain}d</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.gradeBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => handleGrade(3)}>
              <Text style={{ color: theme.colors.warm, fontWeight: 'bold', fontSize: 17 }}>Hard</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>{iHard}d</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.gradeBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => handleGrade(4)}>
              <Text style={{ color: theme.colors.success, fontWeight: 'bold', fontSize: 17 }}>Good</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>{iGood}d</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.gradeBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => handleGrade(5)}>
              <Text style={{ color: theme.colors.primary, fontWeight: 'bold', fontSize: 17 }}>Easy</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>{iEasy}d</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardArea: { flex: 1, padding: 16 },
  card: { flex: 1, padding: 24, borderRadius: 16, borderWidth: 1 },
  footer: { padding: 16 },
  primaryBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' }
});
