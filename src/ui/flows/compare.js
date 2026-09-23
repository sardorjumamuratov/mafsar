
import { XBTN, app, bundle, esc, setFor, setHTML, toast } from "../core.js";
import { setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { liveChains, templateSteps, orderedSteps } from "../../storage/chains.js";
import { isSame, suggestPairs, buildForkCards } from "../../storage/compare.js";
import { saveStudySet } from "../../storage/store.js";

export let compareState = null;

export async function startCompare(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const chains = liveChains(set?.chains);
  if (chains.length < 2) return toast("Need at least two chains to compare.");
  compareState = { sessionId, set, chains, c1: null, c2: null };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintComparePicker();
}

function paintComparePicker() {
  const s = compareState;
  const pairs = suggestPairs(s.chains);
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body">
      <div class="t-label">Compare chains</div>
      <p class="help">Pick two conditions to compare side by side.</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${pairs.map(p => `
          <button class="btn btn-ghost" style="text-align:left" data-action="compare-select" data-id1="${esc(p.c1.id)}" data-id2="${esc(p.c2.id)}">
            <b>${esc(p.c1.title)}</b> vs <b>${esc(p.c2.title)}</b>
            <div class="help" style="margin:0">${p.shared} shared steps</div>
          </button>
        `).join("")}
      </div>
    </div>
  `);
}

export function selectComparePair(id1, id2) {
  const s = compareState;
  s.c1 = s.chains.find(c => c.id === id1);
  s.c2 = s.chains.find(c => c.id === id2);
  paintCompareView();
}

function paintCompareView() {
  const s = compareState;
  const keys = templateSteps(s.c1.template || "medicine-condition");
  
  let html = `<div class="rev-top">${XBTN}</div>
    <div class="rev-body">
      <div class="t-label">Comparing ${esc(s.c1.title)} and ${esc(s.c2.title)}</div>
      <div class="block" style="margin-bottom:16px;background:var(--bg)">
        <button class="btn btn-primary btn-block" data-action="compare-fork-cards">Make cards for the differences</button>
      </div>`;
      
  for (const { key, label } of keys) {
    const s1 = (s.c1.steps || []).find(st => st.key === key && !st.deleted);
    const s2 = (s.c2.steps || []).find(st => st.key === key && !st.deleted);
    const same = isSame(s.c1, s.c2, key, s.set);
    
    html += `<div class="block" style="margin-bottom:12px;border-left:4px solid ${same ? "transparent" : "var(--primary)"};opacity:${same ? 0.6 : 1}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div class="t-label" style="margin:0">${esc(label)}</div>
        <button class="btn btn-ghost btn-sm" data-action="compare-toggle" data-key="${esc(key)}">${same ? "Mark different" : "Mark same"}</button>
      </div>`;
      
    if (!s1 && !s2) {
      html += `<div class="help">Missing in both</div>`;
    } else {
      if (s1) html += `<div style="padding:8px;background:var(--surface-2);border-radius:6px;margin-bottom:4px"><b>${esc(s.c1.title)}:</b> ${esc(s1.statement)}</div>`;
      if (s2) html += `<div style="padding:8px;background:var(--surface-2);border-radius:6px"><b>${esc(s.c2.title)}:</b> ${esc(s2.statement)}</div>`;
    }
    
    html += `</div>`;
  }
  
  html += `</div>`;
  setHTML(app, html);
}

export async function toggleCompareSame(key) {
  const s = compareState;
  s.set.chainOverrides = s.set.chainOverrides || {};
  const ok1 = `${s.c1.id}_${s.c2.id}_${key}`;
  const ok2 = `${s.c2.id}_${s.c1.id}_${key}`;
  const currentlySame = isSame(s.c1, s.c2, key, s.set);
  s.set.chainOverrides[ok1] = currentlySame ? "diff" : "same";
  s.set.chainOverrides[ok2] = currentlySame ? "diff" : "same";
  await saveStudySet(s.set);
  paintCompareView();
}

export async function createForkCards() {
  const s = compareState;
  const keys = templateSteps(s.c1.template || "medicine-condition");
  const newCards = buildForkCards(s.c1, s.c2, s.set, keys);
  
  if (newCards > 0) {
    await saveStudySet(s.set);
    toast(`Created ${newCards} fork cards! They will appear in your review queue.`);
  } else {
    toast("No new differences to create cards for.");
  }
}

