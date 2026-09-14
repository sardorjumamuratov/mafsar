import { getDB } from './index';

export interface SetRow {
  id: string; title: string; source: string | null; mode: string | null; exam_date: number | null;
}
export interface CardRow {
  id: string; set_id: string; front: string; back: string; due_date: number | null;
  easiness: number; interval: number; repetitions: number; deleted: number;
}

export async function getLibraryStats() {
  const db = await getDB();
  const now = Date.now();
  const allCards = await db.getAllAsync<CardRow>('SELECT * FROM cards WHERE deleted = 0');
  
  let dueCount = 0;
  let masteredCount = 0;
  
  for (const c of allCards) {
    if (!c.due_date || c.due_date <= now) dueCount++;
    if (c.interval >= 21) masteredCount++; // Assuming 21 days is mastery, per SM-2 in Mafsar
  }
  
  const masteryPct = allCards.length ? Math.round((masteredCount / allCards.length) * 100) : 0;
  
  return { dueCount, masteryPct, totalCards: allCards.length };
}

export async function getSetsWithDueCards() {
  const db = await getDB();
  const sets = await db.getAllAsync<SetRow>('SELECT * FROM sets WHERE deleted = 0');
  const cards = await db.getAllAsync<CardRow>('SELECT set_id, due_date FROM cards WHERE deleted = 0');
  
  const now = Date.now();
  const setDueCounts = new Map<string, number>();
  for (const c of cards) {
    if (!c.due_date || c.due_date <= now) {
      setDueCounts.set(c.set_id, (setDueCounts.get(c.set_id) || 0) + 1);
    }
  }
  
  return sets
    .map(s => ({ ...s, dueCount: setDueCounts.get(s.id) || 0 }))
    .filter(s => s.dueCount > 0)
    .sort((a, b) => b.dueCount - a.dueCount);
}

export async function getReviewQueue() {
  const db = await getDB();
  const now = Date.now();
  // We should actually use byDue from shared/srs.js, so we fetch all non-deleted cards
  const cards = await db.getAllAsync<CardRow>('SELECT * FROM cards WHERE deleted = 0');
  return cards; // we will sort them in the UI with byDue
}
