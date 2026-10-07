export function normalizeFront(front) {
  return String(front || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\b(a|an|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const norm = normalizeFront(text);
  if (!norm) return new Set();
  return new Set(norm.split(" "));
}

export function jaccard(a, b) {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

export function isDuplicate(suggestedFront, existingFronts, threshold = 0.7) {
  for (const existing of existingFronts) {
    if (jaccard(suggestedFront, existing) >= threshold) return true;
  }
  return false;
}
