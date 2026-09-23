
export function tokenize(str) {
  return String(str).toLowerCase().match(/\w+/g) || [];
}

export function similarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length && !tb.length) return 1;
  if (!ta.length || !tb.length) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let intersect = 0;
  for (const w of setA) if (setB.has(w)) intersect++;
  return intersect / Math.max(setA.size, setB.size);
}

export function isSame(chain1, chain2, key, set) {
  const overrides = set.chainOverrides || {};
  const overrideKey1 = `${chain1.id}_${chain2.id}_${key}`;
  const overrideKey2 = `${chain2.id}_${chain1.id}_${key}`;
  if (overrides[overrideKey1]) return overrides[overrideKey1] === "same";
  if (overrides[overrideKey2]) return overrides[overrideKey2] === "same";
  
  const s1 = (chain1.steps || []).find(s => s.key === key && !s.deleted);
  const s2 = (chain2.steps || []).find(s => s.key === key && !s.deleted);
  
  if (!s1 || !s2) return false;
  return similarity(s1.statement, s2.statement) >= 0.5;
}

export function suggestPairs(chains) {
  const pairs = [];
  for (let i = 0; i < chains.length; i++) {
    for (let j = i + 1; j < chains.length; j++) {
      let shared = 0;
      const keys = ["cause", "mechanism", "physiological", "symptoms", "signs", "tests", "diagnosis", "treatment"];
      for (const k of keys) {
        const s1 = (chains[i].steps || []).find(s => s.key === k && !s.deleted);
        const s2 = (chains[j].steps || []).find(s => s.key === k && !s.deleted);
        if (s1 && s2 && similarity(s1.statement, s2.statement) >= 0.5) shared++;
      }
      pairs.push({ c1: chains[i], c2: chains[j], shared });
    }
  }
  return pairs.sort((a, b) => b.shared - a.shared);
}

export function buildForkCards(c1, c2, set, keys) {
  let newCards = 0;
  for (const { key, label } of keys) {
    const s1 = (c1.steps || []).find(st => st.key === key && !st.deleted);
    const s2 = (c2.steps || []).find(st => st.key === key && !st.deleted);
    
    // Fork cards are built only from filled steps in both chains.
    if (!s1 || !s2) continue;
    
    if (!isSame(c1, c2, key, set)) {
      const front = `What separates ${c1.title} from ${c2.title} on ${label}?`;
      const back = `${c1.title}: ${s1.statement}\n${c2.title}: ${s2.statement}`;
      
      const exists = (set.flashcards || []).find(c => c.front === front);
      if (!exists) {
        if (!set.flashcards) set.flashcards = [];
        set.flashcards.push({
          id: `fork:${c1.id}:${c2.id}:${key}`,
          front,
          back,
          created: Date.now()
        });
        newCards++;
      }
    }
  }
  return newCards;
}

