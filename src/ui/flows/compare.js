import { XBTN, app, bundle, esc, setFor, setHTML, toast } from "../core.js";
import { setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { liveChains, templateSteps } from "../../storage/chains.js";
import { buildForkCards, isSame, overrideKey, suggestPairs } from "../../storage/compare.js";
import { saveStudySet } from "../../storage/store.js";

// Compare two conditions step by step (Medicine mode). Shared steps are muted,
// the forks are what's left. { sessionId, set, chains, c1, c2 }; goReturn() nulls it.
export let compareState = null;
export function setCompareState(v) { compareState = v; }

/** Pairs offered on the picker. Every pair is n², so only the likeliest show. */
const MAX_PAIRS = 8;

export async function startCompare(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const chains = liveChains(set?.chains);
  if (chains.length < 2) return toast("Compare needs two chains in this set.");
  compareState = { sessionId, set, chains, c1: null, c2: null };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintComparePicker();
}

function paintComparePicker() {
  const s = compareState;
  const pairs = suggestPairs(s.chains, s.set).slice(0, MAX_PAIRS);
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body">
      <div class="t-label">Compare conditions</div>
      <p class="help">Two conditions side by side, so you can see where they split. Closest pairs first.</p>
      ${pairs.map((p) => `
        <button class="btn btn-ghost btn-block cmp-pair" data-action="compare-select" data-id1="${esc(p.c1.id)}" data-id2="${esc(p.c2.id)}">
          <span class="cmp-pair-title">${esc(p.c1.title)} vs ${esc(p.c2.title)}</span>
          <span class="help">${esc(p.shared)} steps look the same</span>
        </button>`).join("")}
    </div>`);
}

export function selectComparePair(id1, id2) {
  const s = compareState;
  if (!s) return;
  s.c1 = s.chains.find((c) => c.id === id1) || null;
  s.c2 = s.chains.find((c) => c.id === id2) || null;
  if (!s.c1 || !s.c2) return paintComparePicker();
  paintCompareView();
}

function paintCompareView() {
  const s = compareState;
  const rows = templateSteps(s.c1.template).map(({ key, label }) => {
    const s1 = (s.c1.steps || []).find((st) => st.key === key);
    const s2 = (s.c2.steps || []).find((st) => st.key === key);
    const same = isSame(s.c1, s.c2, key, s.set);
    const both = s1 && s2;
    const side = (chain, step) => `<div class="cmp-side"><b>${esc(chain.title)}</b> ${esc(step.statement)}</div>`;
    const body = !s1 && !s2
      ? `<div class="cmp-gap">Neither chain has this step yet.</div>`
      : `${s1 ? side(s.c1, s1) : `<div class="cmp-gap">${esc(s.c1.title)}: not in your source</div>`}
         ${s2 ? side(s.c2, s2) : `<div class="cmp-gap">${esc(s.c2.title)}: not in your source</div>`}`;
    // Only a step both chains fill can be judged same or different.
    const toggle = both
      ? `<button class="linkbtn" data-action="compare-toggle" data-key="${esc(key)}">${same ? "Mark different" : "Mark same"}</button>`
      : "";
    return `<div class="block cmp-row${same ? " same" : ""}">
        <div class="cmp-head"><span class="chain-label">${esc(label)}</span>${toggle}</div>
        ${body}
      </div>`;
  }).join("");

  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body">
      <div class="t-label">${esc(s.c1.title)} vs ${esc(s.c2.title)}</div>
      <p class="help">Muted steps read the same in both. The rest is where they fork.</p>
      ${rows}
      <button class="btn btn-primary btn-block" data-action="compare-fork-cards">Make cards for the differences</button>
      <div class="chain-note">Study aid built from your notes. Not medical advice.</div>
    </div>`);
}

/** The learner's call beats the word-overlap guess, and is stored on the set. */
export async function toggleCompareSame(key) {
  const s = compareState;
  if (!s?.c1 || !s?.c2) return;
  const wasSame = isSame(s.c1, s.c2, key, s.set);
  s.set.chainOverrides = { ...(s.set.chainOverrides || {}), [overrideKey(s.c1.id, s.c2.id, key)]: wasSame ? "diff" : "same" };
  await saveStudySet(s.set);
  paintCompareView();
}

export async function createForkCards() {
  const s = compareState;
  if (!s?.c1 || !s?.c2) return;
  const added = buildForkCards(s.c1, s.c2, s.set, templateSteps(s.c1.template));
  if (!added) return toast("No new differences to make cards from.");
  await saveStudySet(s.set);
  toast(added === 1 ? "1 card added to your review." : `${added} cards added to your review.`);
}
