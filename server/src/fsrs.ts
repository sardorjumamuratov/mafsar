// Server-side FSRS implementation. Matches client src/storage/srs.js
export const FSRS_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542
];

const DAY_MS = 24 * 60 * 60 * 1000;
const DECAY = -FSRS_WEIGHTS[20];
const FACTOR = Math.exp((1 / DECAY) * Math.log(0.9)) - 1;

export function retrievability(
  card: { stability?: number | null; state?: string | null; interval?: number; dueDate?: string | number | null; lastReview?: string | number | null; repetitions?: number },
  now = Date.now()
): number | null {
  let stability = card.stability;
  if (stability == null && (card.repetitions || 0) > 0) {
    stability = Math.max(1, card.interval || 1);
  }
  if (!stability || card.state === "new") return null;

  let t = 0;
  if (card.lastReview != null) {
    const lr = typeof card.lastReview === "string" ? Date.parse(card.lastReview) : card.lastReview;
    t = Math.max(0, (now - lr) / DAY_MS);
  } else if (card.dueDate != null && card.interval) {
    const dd = typeof card.dueDate === "string" ? Date.parse(card.dueDate) : card.dueDate;
    t = Math.max(0, (now - (dd - card.interval * DAY_MS)) / DAY_MS);
  }
  
  return Math.pow(1 + (FACTOR * t) / stability, DECAY);
}

export function forgetBy(
  card: { stability?: number | null; state?: string | null; interval?: number; dueDate?: string | number | null; lastReview?: string | number | null; repetitions?: number },
  now = Date.now()
): number | null {
  let stability = card.stability;
  if (stability == null && (card.repetitions || 0) > 0) {
    stability = Math.max(1, card.interval || 1);
  }
  if (!stability || card.state === "new") return null;

  const targetT = (stability / FACTOR) * (Math.pow(0.8, 1 / DECAY) - 1);
  
  let lastReview = card.lastReview ? (typeof card.lastReview === "string" ? Date.parse(card.lastReview) : card.lastReview) : undefined;
  if (lastReview === undefined) {
    if (card.dueDate != null && card.interval) {
      const dd = typeof card.dueDate === "string" ? Date.parse(card.dueDate) : card.dueDate;
      lastReview = dd - card.interval * DAY_MS;
    } else {
      lastReview = now;
    }
  }
  return Math.round(lastReview + targetT * DAY_MS);
}

