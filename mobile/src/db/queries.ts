import { getDB } from './index';
import { byDue, isDue, masteryOf, review } from '../../../shared/srs.js';
import { computeStreak, dayKey, weekActivity } from '../../../shared/streak.js';
import { toMs } from '../sync/map';

// Everything the screens read and write. Scheduling and streak rules come from
// shared/ so the phone and the extension always agree on what's due.

export interface Card {
  id: string; setId: string; front: string; back: string;
  easiness: number; interval: number; repetitions: number; dueDate: number | null;
  stability?: number; difficulty?: number; state?: string; lapses: number; lastReview?: number;
}

export interface SetSummary {
  id: string; title: string; sourceLabel: string | null; examDate: number | null;
  total: number; due: number; mastered: number; quizCount: number;
}

// Cards of deleted sets are hidden along with the set.
const LIVE_CARDS = `SELECT c.* FROM cards c JOIN sets s ON s.id = c.set_id
                    WHERE c.deleted = 0 AND s.deleted = 0`;

export function cardFromRow(r: any): Card {
  return {
    id: r.id,
    setId: r.set_id,
    front: r.front,
    back: r.back,
    easiness: r.easiness ?? 2.5,
    interval: r.interval ?? 0,
    repetitions: r.repetitions ?? 0,
    dueDate: toMs(r.due_date),
    stability: r.stability ?? undefined,
    difficulty: r.difficulty ?? undefined,
    state: r.state ?? undefined,
    lapses: r.lapses ?? 0,
    lastReview: toMs(r.last_review) ?? undefined,
  };
}

export async function getActivity(): Promise<Record<string, number>> {
  const db = await getDB();
  const rows = await db.getAllAsync<{ day: string; count: number }>('SELECT day, count FROM activity');
  return Object.fromEntries(rows.map((r) => [r.day, r.count]));
}

export async function getLibraryStats() {
  const db = await getDB();
  const cards = (await db.getAllAsync<any>(LIVE_CARDS)).map(cardFromRow);
  const activity = await getActivity();
  const now = Date.now();
  const due = cards.filter((c) => isDue(c, now)).length;
  const mastered = cards.filter((c) => masteryOf(c) === 'mastered').length;
  return {
    due,
    total: cards.length,
    masteredPct: cards.length ? Math.round((mastered / cards.length) * 100) : 0,
    streak: computeStreak(activity),
    week: weekActivity(activity) as { key: string; label: string; count: number; isToday: boolean }[],
    reviewedToday: activity[dayKey()] || 0,
  };
}

export async function getSets(): Promise<SetSummary[]> {
  const db = await getDB();
  const sets = await db.getAllAsync<any>('SELECT * FROM sets WHERE deleted = 0');
  const cards = (await db.getAllAsync<any>(LIVE_CARDS)).map(cardFromRow);
  const quiz = await db.getAllAsync<{ set_id: string; n: number }>(
    'SELECT set_id, COUNT(*) AS n FROM quiz WHERE deleted = 0 GROUP BY set_id'
  );
  const quizBySet = new Map(quiz.map((q) => [q.set_id, q.n]));
  const now = Date.now();
  const bySet = new Map<string, { total: number; due: number; mastered: number }>();
  for (const c of cards) {
    const s = bySet.get(c.setId) || { total: 0, due: 0, mastered: 0 };
    s.total++;
    if (isDue(c, now)) s.due++;
    if (masteryOf(c) === 'mastered') s.mastered++;
    bySet.set(c.setId, s);
  }
  return sets
    .map((s) => ({
      id: s.id,
      title: s.title,
      sourceLabel: s.source_label,
      examDate: toMs(s.exam_date),
      ...(bySet.get(s.id) || { total: 0, due: 0, mastered: 0 }),
      quizCount: quizBySet.get(s.id) || 0,
    }))
    // Placeholder rows created for cards whose set hasn't synced yet.
    .filter((s) => s.title !== '(pending set)' || s.total > 0)
    .sort((a, b) => b.due - a.due || a.title.localeCompare(b.title));
}

export async function getSet(id: string) {
  const db = await getDB();
  const set = await db.getFirstAsync<any>('SELECT * FROM sets WHERE id = ? AND deleted = 0', [id]);
  if (!set) return null;
  const cards = (await db.getAllAsync<any>('SELECT * FROM cards WHERE set_id = ? AND deleted = 0', [id]))
    .map(cardFromRow)
    .sort(byDue);
  const quiz = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM quiz WHERE set_id = ? AND deleted = 0', [id]);
  return {
    id: set.id as string,
    title: set.title as string,
    sourceLabel: set.source_label as string | null,
    examDate: toMs(set.exam_date),
    cards,
    quizCount: quiz?.n || 0,
  };
}

export interface ReviewItem { card: Card; examDate: number | null }

/** Due cards, most overdue first; one set, or the whole library. */
export async function getReviewQueue(setId?: string): Promise<ReviewItem[]> {
  const db = await getDB();
  const rows = setId
    ? await db.getAllAsync<any>(`${LIVE_CARDS} AND c.set_id = ?`, [setId])
    : await db.getAllAsync<any>(LIVE_CARDS);
  const sets = await db.getAllAsync<{ id: string; exam_date: unknown }>('SELECT id, exam_date FROM sets');
  const exam = new Map(sets.map((s) => [s.id, toMs(s.exam_date)]));
  const now = Date.now();
  return rows
    .map(cardFromRow)
    .filter((c) => isDue(c, now))
    .sort(byDue)
    .map((card) => ({ card, examDate: exam.get(card.setId) ?? null }));
}

/** Days until the card comes back for each grade, for the grade buttons. */
export function previewIntervals(item: ReviewItem, now = Date.now()) {
  return {
    again: review(item.card, 0, now, item.examDate).interval,
    hard: review(item.card, 3, now, item.examDate).interval,
    good: review(item.card, 4, now, item.examDate).interval,
    easy: review(item.card, 5, now, item.examDate).interval,
  };
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Grade a card: reschedule it, log the review, and count it toward the streak. */
export async function recordReview(item: ReviewItem, grade: 0 | 3 | 4 | 5): Promise<Card> {
  const now = Date.now();
  const next = review(item.card, grade, now, item.examDate);
  const iso = new Date(now).toISOString();
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE cards SET easiness = ?, interval = ?, repetitions = ?, due_date = ?, stability = ?, difficulty = ?,
         state = ?, lapses = ?, last_review = ?, updated_at = ?, dirty = 1 WHERE id = ?`,
      [next.easiness, next.interval, next.repetitions, next.dueDate, next.stability, next.difficulty,
       next.state, next.lapses, next.lastReview, iso, item.card.id]
    );
    await db.runAsync(
      `INSERT INTO review_log (id, card_id, grade, prev_interval, new_interval, reviewed_at, kind, stability, difficulty, dirty)
       VALUES (?, ?, ?, ?, ?, ?, 'flashcard', ?, ?, 1)`,
      [uid(), item.card.id, grade, item.card.interval || 0, next.interval, iso, next.stability, next.difficulty]
    );
    await db.runAsync(
      `INSERT INTO activity (day, count, dirty) VALUES (?, 1, 1)
       ON CONFLICT(day) DO UPDATE SET count = count + 1, dirty = 1`,
      [dayKey(new Date(now))]
    );
  });
  return { ...item.card, ...next, lastReview: next.lastReview };
}

export interface QuizQuestion { id: string; q: string; options: string[]; answer: number; explain: string | null }

export async function getQuiz(setId?: string, limit = 10): Promise<QuizQuestion[]> {
  const db = await getDB();
  const rows = setId
    ? await db.getAllAsync<any>('SELECT * FROM quiz WHERE deleted = 0 AND set_id = ?', [setId])
    : await db.getAllAsync<any>('SELECT q.* FROM quiz q JOIN sets s ON s.id = q.set_id WHERE q.deleted = 0 AND s.deleted = 0');
  const questions = rows.map((q) => ({
    id: q.id,
    q: q.question,
    options: JSON.parse(q.options_json || '[]'),
    answer: q.answer,
    explain: q.explain,
  }));
  // Random sample so a long set doesn't always quiz the first ten.
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return questions.slice(0, limit);
}

/** "Due now", "in 3 days", "in 2 months". */
export function dueLabel(dueDate: number | null, now = Date.now()): string {
  if (dueDate == null || dueDate <= now) return 'Due now';
  const days = Math.round((dueDate - now) / 86_400_000);
  if (days < 1) return 'Later today';
  if (days === 1) return 'Tomorrow';
  if (days < 30) return `In ${days} days`;
  const months = Math.round(days / 30);
  return months === 1 ? 'In a month' : `In ${months} months`;
}
