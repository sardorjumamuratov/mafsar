// Pure local <-> server mapping for sync. No chrome.* here so it's testable
// with plain node.
//
// Model: one server *set* = one local studySet joined with its session
// (session.id === studySet.sessionId). session.id is the server set id and the
// setId of every card/quiz. Local timestamps are epoch ms + ISO updatedAt
// strings; the server speaks ISO strings everywhere.

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const ms = (isoStr) => (isoStr == null ? null : Date.parse(isoStr));

/** Local → server push payload. Only rows changed after `lastSync` are sent. */
export function toServer({ sessions, studySets, activity, reviewLog }, lastSync) {
  const since = lastSync || "";
  const sessionById = new Map(sessions.map((se) => [se.id, se]));
  const sets = [];
  const cards = [];
  const quiz = [];

  for (const st of studySets) {
    const se = sessionById.get(st.sessionId);
    if (!se) continue; // orphan set without a session row can't be mapped
    if ((st.updatedAt || "") > since) {
      sets.push({
        id: se.id,
        title: st.title ?? se.title,
        source: se.source ?? null,
        sourceLabel: se.sourceLabel ?? null,
        mode: st.mode ?? "general",
        examDate: st.examDate ? iso(st.examDate) : null,
        createdAt: iso(st.createdAt ?? se.capturedAt ?? Date.now()),
        updatedAt: st.updatedAt,
        deleted: !!st.deleted,
      });
    }
    for (const c of st.flashcards || []) {
      if ((c.updatedAt || "") > since) {
        cards.push({
          id: c.id,
          setId: se.id,
          front: c.front,
          back: c.back,
          easiness: c.easiness ?? 2.5,
          interval: c.interval ?? 0,
          repetitions: c.repetitions ?? 0,
          dueDate: c.dueDate != null ? iso(c.dueDate) : null,
          updatedAt: c.updatedAt,
          deleted: !!c.deleted,
        });
      }
    }
    for (const q of st.quiz || []) {
      if ((q.updatedAt || "") > since) {
        quiz.push({
          id: q.id,
          setId: se.id,
          q: q.q,
          options: q.options,
          answer: q.answer,
          explain: q.explain ?? null,
          updatedAt: q.updatedAt,
          deleted: !!q.deleted,
        });
      }
    }
  }

  // Activity has no per-entry timestamp; the server max-merges per day, so
  // sending the whole map is cheap and idempotent.
  const activityOut = Object.entries(activity || {}).map(([day, count]) => ({ day, count }));
  const reviews = (reviewLog || []).filter((r) => (r.reviewedAt || "") > since);

  return { sets, cards, quiz, activity: activityOut, reviews };
}

/** Find or create the local studySet shell a server row belongs to. */
function ensureSet(state, sessionId) {
  let st = state.studySets.find((s) => s.sessionId === sessionId);
  if (!st) {
    st = { sessionId, id: sessionId, title: sessionId, flashcards: [], quiz: [] };
    state.studySets.push(st);
  }
  return st;
}

/**
 * Server → local. Applies a /v1/sync response to a raw local state object and
 * returns the merged state ({ sessions, studySets, activity, reviewLog }).
 * Last-write-wins by updatedAt; tombstones are kept as deleted:true rows.
 * `uid` is injected so this module stays dependency-free for tests.
 */
export function applyServer(resp, local, uid = () => Math.random().toString(36).slice(2)) {
  const state = {
    sessions: [...(local.sessions || [])],
    studySets: [...(local.studySets || [])].map((s) => ({ ...s })),
    activity: { ...(local.activity || {}) },
    reviewLog: [...(local.reviewLog || [])],
  };
  const sessionById = new Map(state.sessions.map((se) => [se.id, se]));

  for (const set of resp.sets || []) {
    const existing = state.studySets.find((s) => s.sessionId === set.id);
    if (existing && (set.updatedAt || "") <= (existing.updatedAt || "")) continue; // LWW

    // Upsert the session (keep the captured transcript if we already have it).
    const se = sessionById.get(set.id) || {
      id: set.id,
      capturedAt: ms(set.createdAt) || Date.now(),
      messages: [],
    };
    se.source = set.source ?? se.source;
    se.sourceLabel = set.sourceLabel ?? se.sourceLabel;
    se.title = set.title ?? se.title;
    if (!sessionById.has(set.id)) state.sessions.push(se);

    const st = ensureSet(state, set.id);
    st.title = set.title ?? st.title;
    st.mode = set.mode ?? st.mode;
    st.examDate = set.examDate ? ms(set.examDate) : null;
    st.createdAt = ms(set.createdAt) || st.createdAt;
    st.updatedAt = set.updatedAt;
    st.deleted = !!set.deleted;
    st.id = st.id === st.sessionId ? st.id : st.id || uid();
  }

  for (const card of resp.cards || []) {
    const st = ensureSet(state, card.setId);
    const existing = st.flashcards.find((c) => c.id === card.id);
    if (existing && (card.updatedAt || "") <= (existing.updatedAt || "")) continue;
    const mapped = {
      id: card.id,
      front: card.front,
      back: card.back,
      easiness: card.easiness ?? 2.5,
      interval: card.interval ?? 0,
      repetitions: card.repetitions ?? 0,
      dueDate: card.dueDate != null ? ms(card.dueDate) : null,
      updatedAt: card.updatedAt,
      deleted: !!card.deleted,
    };
    if (existing) Object.assign(existing, mapped);
    else st.flashcards.push(mapped);
  }

  for (const q of resp.quiz || []) {
    const st = ensureSet(state, q.setId);
    const existing = st.quiz.find((x) => x.id === q.id);
    const mapped = {
      id: q.id,
      q: q.q,
      options: q.options,
      answer: q.answer,
      explain: q.explain ?? "",
      updatedAt: q.updatedAt,
      deleted: !!q.deleted,
    };
    if (existing && (q.updatedAt || "") <= (existing.updatedAt || "")) continue;
    if (existing) Object.assign(existing, mapped);
    else st.quiz.push(mapped);
  }

  for (const a of resp.activity || []) {
    state.activity[a.day] = Math.max(state.activity[a.day] || 0, a.count || 0);
  }

  const knownIds = new Set(state.reviewLog.map((r) => r.id));
  for (const r of resp.reviews || []) {
    if (!knownIds.has(r.id)) state.reviewLog.push(r);
  }

  return state;
}
