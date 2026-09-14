import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/useTheme';
import { useState, useEffect } from 'react';
import { getDB } from '../src/db';
import { shuffleQuiz } from '../../shared/quiz.js';

export default function QuizScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [queue, setQueue] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);

  useEffect(() => {
    getDB().then(async db => {
      const raw = await db.getAllAsync<any>('SELECT * FROM quiz WHERE deleted = 0 LIMIT 10');
      const questions = raw.map(q => ({
        id: q.id,
        q: q.question,
        options: JSON.parse(q.options_json),
        answer: q.answer,
        explain: q.explain
      }));
      setQueue(shuffleQuiz(questions));
    });
  }, []);

  if (queue.length === 0) return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  if (idx >= queue.length) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.colors.ink, fontSize: 32, fontWeight: 'bold' }}>{score} / {queue.length}</Text>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, marginTop: 24, paddingHorizontal: 32 }]} onPress={() => router.back()}>
          <Text style={{ color: theme.colors.surface, fontSize: 17, fontWeight: 'bold' }}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = queue[idx];

  const handleOption = (i: number) => {
    if (answered !== null) return;
    setAnswered(i);
    if (i === q.answer) setScore(score + 1);
  };

  const handleNext = () => {
    setAnswered(null);
    setIdx(idx + 1);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 16 }}>
          <Text style={{ color: theme.colors.muted, fontSize: 24 }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ color: theme.colors.muted, fontSize: 17, padding: 16 }}>{idx + 1} / {queue.length}</Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: theme.colors.ink, fontSize: 22, fontWeight: '600', marginBottom: 24, lineHeight: 32 }}>{q.q}</Text>
        
        <View style={{ gap: 12 }}>
          {q.options.map((opt: string, i: number) => {
            const isCorrect = answered !== null && i === q.answer;
            const isWrong = answered === i && i !== q.answer;
            let bgColor = theme.colors.surface;
            let borderColor = theme.colors.border;
            
            if (isCorrect) {
              bgColor = theme.colors.success + '20';
              borderColor = theme.colors.success;
            } else if (isWrong) {
              bgColor = theme.colors.danger + '20';
              borderColor = theme.colors.danger;
            }

            return (
              <TouchableOpacity 
                key={i} 
                onPress={() => handleOption(i)} 
                activeOpacity={answered !== null ? 1 : 0.7}
                style={[styles.optBtn, { backgroundColor: bgColor, borderColor }]}
              >
                <Text style={{ color: theme.colors.ink, fontSize: 17 }}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {answered !== null && (
          <View style={{ marginTop: 32 }}>
            <Text style={{ color: answered === q.answer ? theme.colors.success : theme.colors.danger, fontWeight: 'bold', fontSize: 17, marginBottom: 8 }}>
              {answered === q.answer ? 'Correct' : 'Not quite'}
            </Text>
            {q.explain && <Text style={{ color: theme.colors.ink, fontSize: 17, lineHeight: 24 }}>{q.explain}</Text>}
          </View>
        )}
      </ScrollView>

      {answered !== null && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]} onPress={handleNext}>
            <Text style={{ color: theme.colors.surface, fontSize: 17, fontWeight: 'bold' }}>Next</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { padding: 16 },
  primaryBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  optBtn: { padding: 16, borderRadius: 12, borderWidth: 1 }
});
