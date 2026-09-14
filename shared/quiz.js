/** Default quiz length: ~10% of a big set, the whole thing for a small one. */
export function quickQuizLen(studySet) {
  const total = studySet.flashcards?.length || 0;
  const available = studySet.quiz?.length || 0;
  if (total < 20) return available;
  return Math.max(1, Math.min(available, Math.round(total * 0.1)));
}

/** Fisher-Yates on a copy. */
export function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Randomize question order AND option order for one sitting. The stored quiz is
 * untouched — models tend to park the correct answer in the same slot, so
 * without this the answer key is learnable instead of the material.
 */
export function shuffleQuiz(questions) {
  return shuffled(questions).map((q) => {
    const order = shuffled(q.options.map((_, i) => i));
    return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  });
}
