// Keeps "Turn gaps into review cards" from suggesting cards the set already has
// (docs/prompts/38 §6.1). Pure, so it's unit tested in tests/card-dedupe.test.mjs.

const ARTICLES = /\b(a|an|the)\b/g;

/** Lowercase, no punctuation, no English articles, single spaces. Letters in any script survive. */
export function normalizeFront(front) {
  return String(front || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(ARTICLES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text) {
  const norm = normalizeFront(text);
  return new Set(norm ? norm.split(" ") : []);
}

/** Token overlap, 0..1. Two empty texts share nothing: there is no evidence they match. */
export function jaccard(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

export function isDuplicate(front, existingFronts, threshold = 0.7) {
  const norm = normalizeFront(front);
  if (!norm) return false;
  return (existingFronts || []).some((e) => normalizeFront(e) === norm || jaccard(front, e) >= threshold);
}

/**
 * The suggestions worth showing: no near-copies of existing cards or of each
 * other, at most `max`. Returns the kept cards and how many were skipped.
 */
export function selectSuggestions(suggestions, existingFronts, max = 3) {
  const kept = [];
  let skipped = 0;
  for (const s of suggestions || []) {
    if (!s || !String(s.front || "").trim() || !String(s.back || "").trim()) continue;
    if (isDuplicate(s.front, existingFronts) || isDuplicate(s.front, kept.map((k) => k.front))) {
      skipped++;
      continue;
    }
    if (kept.length < max) kept.push(s);
  }
  return { kept, skipped };
}
