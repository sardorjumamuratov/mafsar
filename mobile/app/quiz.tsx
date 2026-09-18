import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shuffleQuiz } from '../../shared/quiz.js';
import { getQuiz, type QuizQuestion } from '../src/db/queries';
import { useTheme } from '../src/theme/useTheme';
import { Button, Loading } from '../src/ui/components';

export default function QuizScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setId } = useLocalSearchParams<{ setId?: string }>();
  const [queue, setQueue] = useState<QuizQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);

  useEffect(() => {
    // Shuffle options too: generated quizzes tend to park the answer in one slot.
    getQuiz(setId ? String(setId) : undefined).then((qs) => setQueue(shuffleQuiz(qs)));
  }, [setId]);

  if (queue === null) return <Loading />;

  if (queue.length === 0 || idx >= queue.length) {
    const pct = queue.length ? Math.round((score / queue.length) * 100) : 0;
    return (
      <View style={[styles.center, { backgroundColor: t.colors.bg, paddingBottom: insets.bottom + 24 }]}>
        {queue.length ? (
          <>
            <Text style={{ color: t.colors.ink, fontSize: 44, fontWeight: '700' }}>{score} / {queue.length}</Text>
            <Text style={{ color: t.colors.muted, fontSize: 17, marginTop: 8 }}>
              {pct >= 80 ? 'Great work.' : pct >= 50 ? 'Getting there.' : 'Worth another look at these cards.'}
            </Text>
          </>
        ) : (
          <Text style={{ color: t.colors.ink, fontSize: 18 }}>This set has no quiz questions.</Text>
        )}
        <Button title="Done" onPress={() => router.back()} style={{ marginTop: 32, alignSelf: 'stretch' }} />
      </View>
    );
  }

  const q = queue[idx];
  const choose = (i: number) => {
    if (answered !== null) return;
    setAnswered(i);
    if (i === q.answer) setScore(score + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close quiz" style={{ padding: 16 }}>
          <Text style={{ color: t.colors.muted, fontSize: 22 }}>✕</Text>
        </Pressable>
        <Text style={{ color: t.colors.muted, fontSize: 16, padding: 16 }}>{idx + 1} / {queue.length}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: t.colors.ink, fontSize: 21, fontWeight: '600', marginBottom: 24, lineHeight: 30 }}>{q.q}</Text>
        <View style={{ gap: 12 }}>
          {q.options.map((opt, i) => {
            const correct = answered !== null && i === q.answer;
            const wrong = answered === i && i !== q.answer;
            return (
              <Pressable
                key={i}
                onPress={() => choose(i)}
                disabled={answered !== null}
                accessibilityRole="button"
                accessibilityState={{ selected: answered === i }}
                accessibilityLabel={`${opt}${correct ? ', correct answer' : wrong ? ', wrong' : ''}`}
                style={[
                  styles.option,
                  {
                    backgroundColor: correct ? t.colors.success + '22' : wrong ? t.colors.danger + '22' : t.colors.surface,
                    borderColor: correct ? t.colors.success : wrong ? t.colors.danger : t.colors.border,
                  },
                ]}
              >
                <Text style={{ color: t.colors.ink, fontSize: 17, lineHeight: 24 }}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        {answered !== null && (
          <View style={{ marginTop: 24 }} accessibilityLiveRegion="polite">
            <Text style={{ color: answered === q.answer ? t.colors.success : t.colors.danger, fontWeight: '700', fontSize: 17, marginBottom: 6 }}>
              {answered === q.answer ? 'Correct' : 'Not quite'}
            </Text>
            {!!q.explain && <Text style={{ color: t.colors.ink, fontSize: 16, lineHeight: 23 }}>{q.explain}</Text>}
          </View>
        )}
      </ScrollView>

      {answered !== null && (
        <View style={{ padding: 16, paddingBottom: 16 + insets.bottom }}>
          <Button
            title={idx + 1 < queue.length ? 'Next' : 'See score'}
            onPress={() => {
              setAnswered(null);
              setIdx(idx + 1);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  option: { padding: 16, borderRadius: 12, borderWidth: 1.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
