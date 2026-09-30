import { esc, sourceLabel, summarize } from "./core.js";
import { cleanTitle } from "../../shared/titles.js";
import { formatAvg, formatCount } from "../../shared/format.js";
import { ICONS } from "./icons.js";

// Source tiles (redesign 00). Only four sources have their own colours in the
// design; the rest use the neutral ChatGPT pair with their own label.
const TILE = {
  aistudio: ["AI", "ai"],
  youtube: ["YT", "yt"],
  chatgpt: ["GPT", "gpt"],
  quizlet: ["Q", "q"],
  claude: ["CL", "gpt"],
  gemini: ["GEM", "gpt"],
  pdf: ["PDF", "gpt"],
  web: ["WEB", "gpt"],
  generic: ["WEB", "gpt"],
  share: ["SH", "gpt"],
  shared: ["SH", "gpt"],
  text: ["TXT", "gpt"],
  manual: ["ME", "gpt"],
};

export function sourceTile(session) {
  const src = session?.source || "";
  // A paste import is stored as source "quizlet" with the label "Imported".
  if (src === "quizlet" && session?.sourceLabel === "Imported") return { label: "CSV", tone: "gpt" };
  const [label, tone] = TILE[src] || [(sourceLabel(session || {}) || "?").slice(0, 3).toUpperCase(), "gpt"];
  return { label, tone };
}

/**
 * One view model per set, joining the session (title, source, capture time)
 * with its study set (cards, schedule, exam, origin). Every list of sets —
 * Sets, Home's Continue — renders these, so a row always has an id to open,
 * a due count and a source tile. (Raw study sets have none of those.)
 */
export function setViewModels(sessions, studySets) {
  const bySession = new Map(studySets.map((st) => [st.sessionId, st]));
  const out = [];
  for (const se of sessions) {
    const st = bySession.get(se.id);
    if (!st || st.deleted) continue;
    const s = summarize(st);
    out.push({
      id: se.id,
      title: st.title || se.title || "",
      source: sourceLabel(se),
      tile: sourceTile(se),
      due: s.due,
      total: s.total,
      mastered: s.mastered,
      mastery: s.total ? s.mastered / s.total : 0,
      createdAt: st.createdAt ?? se.capturedAt ?? 0,
      examDate: st.examDate || null,
      originSetId: st.originSetId || null,
      isGlobal: !!(st.isGlobal || st.originSetId),
      flashcards: st.flashcards || [],
    });
  }
  return out;
}

export function SetRowHtml(set, ratings) {
  const r = ratings ? ratings[set.originSetId || set.id] : null;

  let ratingText = "";
  const avg = r ? (r.isGlobal ? r.ratingAvg : r.yourStars) : null;
  if (avg != null) {
    const suffix = r.isGlobal ? ` (${formatCount(r.ratingCount)})` : " yours";
    const star = ICONS.star.replace('fill="none" stroke="currentColor"', 'width="12" height="12" fill="var(--rating-star)" stroke="var(--rating-star)"');
    ratingText = `<span aria-hidden="true">·</span><span style="display:inline-flex;align-items:center;gap:3px;color:var(--text-secondary);font-weight:600">${star}${esc(formatAvg(avg))}</span><span>${esc(suffix)}</span>`;
  }

  const globalText = set.isGlobal || r?.isGlobal
    ? `<span aria-hidden="true">·</span><span style="display:inline-flex;align-items:center;gap:3px">${ICONS.globe.replace("<svg", '<svg width="12" height="12"')} Global</span>`
    : "";

  const mastery = set.mastery || 0;
  let dueText = "";
  if (set.due > 0) {
    dueText = `<div class="due-count">${set.due}</div><div class="due-label">due</div>`;
  } else if (mastery === 1) {
    dueText = `<svg viewBox="0 0 24 24" class="due-check" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`;
  }
  // Never a 0% bar.
  const progHtml = mastery > 0 ? `<div class="prog-bar"><div class="prog-fill" style="width:${Math.round(mastery * 100)}%"></div></div>` : "";
  const tile = set.tile || { label: "?", tone: "gpt" };
  // Spelled out so the static check can see every variable exists.
  const colors = {
    ai: "background:var(--src-ai-bg);color:var(--src-ai-fg)",
    yt: "background:var(--src-yt-bg);color:var(--src-yt-fg)",
    gpt: "background:var(--src-gpt-bg);color:var(--src-gpt-fg)",
    q: "background:var(--src-q-bg);color:var(--src-q-fg)",
  }[tile.tone] || "background:var(--src-gpt-bg);color:var(--src-gpt-fg)";
  const title = cleanTitle(set.title);
  const a11y = set.due > 0 ? `${title}, ${set.due} due` : mastery === 1 ? `${title}, all mastered` : title;

  return `<button type="button" class="set-row setrow" data-action="open-set" data-id="${esc(set.id)}" aria-label="${esc(a11y)}">
    <div class="sr-tile" style="${colors}" aria-hidden="true">${esc(tile.label)}</div>
    <div class="sr-mid">
      <div class="sr-title">${esc(title)}</div>
      <div class="sr-meta"><span>${esc(set.source || "")}</span>${ratingText}${globalText}</div>
      ${progHtml}
    </div>
    <div class="sr-right">${dueText}</div>
  </button>`;
}
