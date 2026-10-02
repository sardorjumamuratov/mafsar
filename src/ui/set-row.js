import { esc, sourceLabel, summarize } from "./core.js";
import { cleanTitle } from "../../shared/titles.js";
import { formatAvg, formatCount } from "../../shared/format.js";

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

/** The tile's colours, spelled out so the static check can see each variable. */
export function tileStyle(tone) {
  return {
    ai: "background:var(--src-ai-bg);color:var(--src-ai-fg)",
    yt: "background:var(--src-yt-bg);color:var(--src-yt-fg)",
    gpt: "background:var(--src-gpt-bg);color:var(--src-gpt-fg)",
    q: "background:var(--src-q-bg);color:var(--src-q-fg)",
  }[tone] || "background:var(--src-gpt-bg);color:var(--src-gpt-fg)";
}

// docs/design: the 12px filled star and the globe in a row's meta line.
export const STAR_PATH = "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z";
export const GLOBE_PATHS = '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>';
const META_STAR = `<svg width="12" height="12" viewBox="0 0 24 24" fill="var(--rating-star)" stroke="var(--rating-star)" stroke-width="1.5" stroke-linejoin="round" style="margin-left:3px" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
const META_GLOBE = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-left:2px" aria-hidden="true">${GLOBE_PATHS}</svg>`;

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

/** A set row: 02-sets.html, also Home's "Continue". */
export function SetRowHtml(set, ratings) {
  const r = ratings ? ratings[set.originSetId || set.id] : null;
  const isGlobal = !!(set.isGlobal || r?.isGlobal);

  // "· ★ 4.8 (212)" for a global set, "· ★ 4 yours" for your own rating.
  let ratingText = "";
  const avg = r ? (r.isGlobal ? r.ratingAvg : r.yourStars) : null;
  if (avg) {
    const suffix = r.isGlobal ? (r.ratingCount ? ` (${formatCount(r.ratingCount)})` : "") : " yours";
    ratingText = `<span class="sr-rating"><span aria-hidden="true">·</span>${META_STAR}<span class="sr-avg">${esc(formatAvg(avg))}</span>${esc(suffix)}</span>`;
  }
  const globalText = isGlobal ? `<span class="sr-global"><span aria-hidden="true">·</span>${META_GLOBE}Global</span>` : "";

  const mastery = set.mastery || 0;
  let right = "";
  if (set.due > 0) right = `<span class="due-count">${set.due}</span><span class="due-label">due</span>`;
  else if (mastery === 1) right = `<svg viewBox="0 0 24 24" class="due-check" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`;
  // A bar only once there's progress (02's note 2): never a 0% bar.
  const progHtml = mastery > 0 && mastery < 1 ? `<span class="prog-bar"><span class="prog-fill" style="display:block;width:${Math.round(mastery * 100)}%"></span></span>` : "";
  const tile = set.tile || { label: "?", tone: "gpt" };
  const title = cleanTitle(set.title);
  const a11y = set.due > 0 ? `${title}, ${set.due} due` : mastery === 1 ? `${title}, all mastered` : title;

  return `<button type="button" class="set-row" data-action="open-set" data-id="${esc(set.id)}" aria-label="${esc(a11y)}">
    <span class="sr-tile" style="${tileStyle(tile.tone)}" aria-hidden="true">${esc(tile.label)}</span>
    <span class="sr-mid">
      <span class="sr-title">${esc(title)}</span>
      <span class="sr-meta"><span>${esc(set.source || "")}</span>${ratingText}${globalText}</span>
      ${progHtml}
    </span>
    <span class="sr-right">${right}</span>
  </button>`;
}
