import { app, appendHTML, bundle, esc, replaceHTML, setHTML, send, topOfView, toast } from "../core.js";
import { openSheet, closeSheet } from "../sheet.js";
import { syncNow } from "../../sync/sync.js";
import { setNav, showChrome } from "../nav.js";
import { getAuth } from "../../sync/auth.js";
import { confirmSheet } from "../confirm.js";
import { sourceTile, tileStyle, STAR_PATH } from "../set-row.js";
import { formatCount } from "../../../shared/format.js";
import { renderSetDetail } from "./set-detail.js";

// ================================================================ DISCOVER (04-discover.html)

let currentTab = "for"; // for | top | new
let currentQ = "";
let currentCursor = 0;
let hasNext = true;
let isLoading = false;
let globalSets = [];
let observer = null;
let searchTimer = null;
// The last first page, shown when the network is gone.
let offlineCache = null;

const TABS = [["for", "For you"], ["top", "Top rated"], ["new", "New"]];
const CHECK = (w, sw) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const star = (w, on, sw = 1.7) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="${on ? "var(--rating-star)" : "none"}" stroke="${on ? "var(--rating-star)" : "var(--rating-empty)"}" stroke-width="${sw}" stroke-linejoin="round" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;

/** Discover's header: just its title (Teams lives in You since redesign 00). */
export function globalHeader() {
  return `
    <div style="display:flex;flex-direction:column;gap:2px;padding:0 4px">
      <h1 style="margin:0;font-size:24px;font-weight:650;letter-spacing:-.02em">Discover</h1>
      <div style="font-size:13px;color:var(--text-muted)">Sets shared by other learners, picked for you</div>
    </div>`;
}

function daysAgo(isoStr) {
  if (!isoStr) return "";
  const days = Math.floor((Date.now() - new Date(isoStr).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function tabsHtml() {
  return TABS.map(([k, label]) => `<button type="button" role="tab" aria-selected="${currentTab === k}" data-action="global-tab" data-id="${k}" style="flex:1;height:36px;border:0;border-radius:9px;background:${currentTab === k ? "var(--bg-segment-active)" : "transparent"};color:${currentTab === k ? "var(--text-primary)" : "var(--text-faint)"};font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">${label}</button>`).join("");
}

export async function renderGlobal() {
  setNav("discover");
  showChrome(true);

  const auth = await getAuth();
  if (!auth?.accessToken) {
    setHTML(app, `
      <div class="screen" style="padding:18px 16px 24px;gap:14px">
        ${globalHeader()}
        <div style="padding:16px;border-radius:16px;background:var(--bg-surface);border:1px solid var(--border-card);display:flex;flex-direction:column;gap:12px">
          <div style="font-size:15px;font-weight:600">Sign in to discover sets</div>
          <div style="font-size:14px;line-height:1.45;color:var(--text-body2)">See sets other learners made, picked for what you study.</div>
          <button type="button" class="sheet-primary" data-action="nav-you">Sign in</button>
        </div>
      </div>`);
    topOfView();
    return;
  }

  setHTML(app, `
    <div class="screen" data-view="discover" style="padding:18px 16px 24px;gap:14px">
      ${globalHeader()}
      <label id="globalSearchLabel" style="display:flex;align-items:center;gap:10px;height:44px;padding:0 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card);color:var(--text-faint)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input type="search" id="globalSearch" placeholder="Search global sets" aria-label="Search global sets" autocomplete="off" value="${esc(currentQ)}" style="flex:1;min-width:0;background:transparent;border:0;outline:none;color:var(--text-primary);font-size:15px;font-family:inherit">
      </label>
      <div id="globalTabs" role="tablist" style="display:flex;padding:3px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card)">${tabsHtml()}</div>
      <div id="globalSlot" style="display:flex;flex-direction:column;gap:8px"></div>
      <div id="globalSentinel" style="height:1px"></div>
    </div>`);
  topOfView();

  if (globalSets.length > 0) {
    paintGlobal(globalSets, false);
    setupObserver();
  } else {
    resetList();
    await loadMore(true);
  }

  const input = /** @type {HTMLInputElement} */ (document.getElementById("globalSearch"));
  const label = /** @type {HTMLElement} */ (document.getElementById("globalSearchLabel"));
  input?.addEventListener("focus", () => { label.style.borderColor = "var(--border-hover)"; });
  input?.addEventListener("blur", () => { label.style.borderColor = "var(--border-card)"; });
  // Filters as you type (04's search), after a pause so a word is one request.
  input?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (input.value.trim() === currentQ) return;
      currentQ = input.value.trim();
      resetList();
      loadMore(true);
    }, 300);
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = ""; input.dispatchEvent(new Event("input")); }
  });
}

function resetList() {
  currentCursor = 0;
  hasNext = true;
  globalSets = [];
}

export function filterGlobalTab(btn) {
  const t = btn.dataset.id;
  if (currentTab === t) return;
  currentTab = t;
  resetList();
  const tabs = document.getElementById("globalTabs");
  if (tabs) setHTML(tabs, tabsHtml());
  loadMore(true);
}

async function loadMore(isFirstPage) {
  if (isLoading || !hasNext) return;
  const slot = document.getElementById("globalSlot");
  if (!slot) return;
  isLoading = true;

  // Skeletons the height of a row, so swapping them out doesn't jump.
  const skeletonHtml = `<div class="sk" style="height:66px;border-radius:14px"></div>`.repeat(3);
  if (isFirstPage) setHTML(slot, skeletonHtml);
  else appendHTML(slot, `<div id="globalLoading" style="display:flex;flex-direction:column;gap:8px">${skeletonHtml}</div>`);

  try {
    const res = await send({ type: "GLOBAL_LIST", tab: currentTab, q: currentQ, cursor: currentCursor });
    if (res.error && res.message) throw new Error(res.message);
    if (isFirstPage && !currentQ) offlineCache = { tab: currentTab, data: res.sets };
    globalSets.push(...res.sets);
    if (res.nextCursor !== null && res.nextCursor !== undefined) currentCursor = res.nextCursor;
    else hasNext = false;
    paintGlobal(globalSets, false);
    setupObserver();
  } catch {
    if (isFirstPage) {
      if (offlineCache && offlineCache.tab === currentTab && !currentQ) {
        globalSets = [...offlineCache.data];
        hasNext = false;
        paintGlobal(globalSets, true);
      } else {
        setHTML(slot, `<div class="empty">Discover needs a connection.</div>`);
      }
    } else {
      document.getElementById("globalLoading")?.remove();
      toast("Connection lost");
    }
  } finally {
    isLoading = false;
  }
}

function setupObserver() {
  const sentinel = document.getElementById("globalSentinel");
  if (!sentinel) return;
  if (observer) observer.disconnect();
  if (!hasNext) return;
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMore(false);
  }, { root: app, rootMargin: "100px" });
  observer.observe(sentinel);
}

function rowHtml(s, idx) {
  const tile = sourceTile({ source: s.source, sourceLabel: s.sourceLabel });
  const meta = currentTab === "new"
    ? `by ${s.authorName} · ${daysAgo(s.published_at)}`
    : `by ${s.authorName} · ${s.cardCount} ${s.cardCount === 1 ? "card" : "cards"}`;
  let right;
  if (s.added) {
    right = `<span style="display:flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--accent-text)">${CHECK(14, 2.6)}Added</span>`;
  } else if (s.ratingCount > 0) {
    right = `<span style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
        <span style="display:flex;align-items:center;gap:4px;font-size:15px;font-weight:700">${star(13, true, 1.5)}${esc(Number(s.ratingAvg).toFixed(1))}</span>
        <span style="font-size:11px;color:var(--text-muted)">${esc(formatCount(s.ratingCount))}</span>
      </span>`;
  } else {
    right = `<span style="font-size:13px;font-weight:600;color:var(--text-muted)">New</span>`;
  }
  return `
    <button type="button" class="set-row" data-action="global-preview" data-idx="${idx}" aria-label="${esc(s.title)}, ${esc(meta)}">
      <span class="sr-tile" style="${tileStyle(tile.tone)}" aria-hidden="true">${esc(tile.label)}</span>
      <span class="sr-mid">
        <span class="sr-title">${esc(s.title)}</span>
        <span style="font-size:13px;color:var(--text-muted)">${esc(meta)}</span>
      </span>
      ${right}
    </button>`;
}

function paintGlobal(sets, isOffline) {
  const slot = document.getElementById("globalSlot");
  if (!slot) return;
  if (sets.length === 0) {
    setHTML(slot, currentQ
      ? `<div class="empty">No global sets match “${esc(currentQ)}”</div>`
      : `<div class="empty">No shared sets yet. Make one of yours global from its ⋯ menu.</div>`);
    return;
  }
  const note = isOffline ? `<div style="font-size:13px;color:var(--text-muted);padding:0 4px">You're offline. Showing sets from earlier.</div>` : "";
  setHTML(slot, note + sets.map((s, i) => rowHtml(s, i)).join(""));
}

function addedButtonHtml(id) {
  return `<button type="button" data-action="global-open-added" data-id="${esc(id)}" style="height:52px;border-radius:14px;border:1px solid var(--border-hover);background:var(--bg-surface2);color:var(--accent-text);font-family:inherit;font-size:16px;font-weight:650;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;width:100%">${CHECK(16, 2.6)}Added · Open set</button>`;
}

/** The preview sheet (04): who made it, its rating, why it was picked, samples. */
export async function openGlobalPreview(btn) {
  const idx = parseInt(btn.dataset.idx, 10);
  const s = globalSets[idx];
  if (!s) return;
  const tile = sourceTile({ source: s.source, sourceLabel: s.sourceLabel });
  const rated = s.ratingCount > 0;
  const stars = Array.from({ length: 5 }, (_, i) => star(18, rated && i < Math.round(s.ratingAvg))).join("");
  const ratingRow = `
    <div style="display:flex;align-items:center;gap:8px">
      <div style="display:flex;gap:2px">${stars}</div>
      ${rated
        ? `<span style="font-size:14px;font-weight:600">${esc(Number(s.ratingAvg).toFixed(1))}</span><span style="font-size:13px;color:var(--text-muted)">· ${esc(Number(s.ratingCount).toLocaleString("en-US"))} ${s.ratingCount === 1 ? "rating" : "ratings"}</span>`
        : `<span style="font-size:13px;color:var(--text-muted)">No ratings yet</span>`}
    </div>`;
  const reason = s.reasonSetTitle
    ? `<div class="sheet-tip">Picked because you study <b style="font-weight:600">${esc(s.reasonSetTitle)}</b></div>`
    : "";
  const action = s.added
    ? addedButtonHtml(s.id)
    : `<button type="button" data-action="global-add-set" data-id="${esc(s.id)}" data-idx="${idx}" style="height:52px;border-radius:14px;border:0;background:var(--accent);color:var(--accent-on);font-family:inherit;font-size:16px;font-weight:650;cursor:pointer;width:100%">Add to my sets</button>`;

  openSheet("", `
    <div style="display:flex;gap:14px;align-items:flex-start">
      <span style="width:48px;height:48px;border-radius:12px;${tileStyle(tile.tone)};font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0" aria-hidden="true">${esc(tile.label)}</span>
      <div style="flex:1;display:flex;flex-direction:column;gap:4px">
        <div id="previewTitle" style="font-size:20px;line-height:1.2;font-weight:650;letter-spacing:-.01em">${esc(s.title)}</div>
        <div style="font-size:13px;color:var(--text-muted)">by ${esc(s.authorName)} · ${esc(s.cardCount)} ${s.cardCount === 1 ? "card" : "cards"}</div>
      </div>
    </div>
    ${ratingRow}
    ${reason}
    <div style="display:flex;flex-direction:column;gap:4px">
      <div style="font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted);padding-bottom:4px">Sample cards</div>
      <div id="globalSampleCards" style="display:flex;flex-direction:column"><div class="sk" style="height:40px;border-radius:10px"></div></div>
    </div>
    <div id="globalAction">${action}</div>
    <button type="button" data-action="global-report" data-id="${esc(s.id)}" style="align-self:center;height:32px;padding:0 8px;border:0;background:transparent;color:var(--text-muted);font-family:inherit;font-size:13px;cursor:pointer">Report this set</button>`,
    false, null, { px: 20, pb: 24, gap: 16, maxHeight: "86%", labelledBy: "previewTitle" });

  try {
    const res = await send({ type: "GLOBAL_FETCH", id: s.id });
    const slot = document.getElementById("globalSampleCards");
    if (slot && res.cards) {
      const rows = res.cards.slice(0, 3).map((c) => `
        <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-divider)">
          <span style="width:8px;height:8px;border-radius:4px;background:var(--status-new);margin-top:7px;flex-shrink:0"></span>
          <span style="font-size:15px;line-height:1.4">${esc(c.front)}</span>
        </div>`).join("");
      setHTML(slot, rows || `<div class="empty">No cards</div>`);
    }
  } catch {
    const slot = document.getElementById("globalSampleCards");
    if (slot) setHTML(slot, `<div style="font-size:13px;color:var(--text-muted)">Couldn't load sample cards.</div>`);
  }
}

export async function addGlobalSet(btn) {
  const id = btn.dataset.id;
  const idx = parseInt(btn.dataset.idx, 10);
  btn.textContent = "Adding…";
  btn.disabled = true;
  try {
    // The server makes the copy; a sync brings it into local storage so
    // "Open set" has something to open.
    const addRes = await send({ type: "GLOBAL_ADD", id });
    await syncNow().catch(() => {});
    toast("Added to your sets");
    if (globalSets[idx]) globalSets[idx].added = true;
    replaceHTML(btn, addedButtonHtml(addRes.id || id));
    paintGlobal(globalSets, false); // refresh the list behind the sheet
  } catch (e) {
    btn.textContent = "Add to my sets";
    btn.disabled = false;
    toast(e.message);
  }
}

/** "Added · Open set": open the learner's copy, found by its origin. */
export async function openAddedSet(btn) {
  const id = btn.dataset.id;
  closeSheet();
  const { studySets } = await bundle();
  const copy = studySets.find((st) => !st.deleted && (st.sessionId === id || st.originSetId === id));
  if (!copy) return toast("Your copy arrives with the next sync");
  renderSetDetail(copy.sessionId, "cards");
}

export async function reportGlobal(btn) {
  const id = btn.dataset.id;
  const ok = await confirmSheet({
    title: "Report this set?",
    body: "Report it as spam, harmful, or containing personal info. It's hidden once several people report it.",
    confirmLabel: "Report",
    destructive: true,
  });
  if (!ok) return;
  try {
    await send({ type: "GLOBAL_REPORT", id, reason: "Spam" });
    toast("Thanks, we'll take a look");
  } catch (e) {
    toast(e.message);
  }
}
