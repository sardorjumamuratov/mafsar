import { app, esc, setHTML, send, topOfView, toast } from "../core.js";
import { setNav, showChrome } from "../nav.js";
import { getAuth } from "../../sync/auth.js";
import { setSharedPreview } from "./teams.js";
import { paintSharePreview } from "./import.js";
import { confirmSheet } from "../confirm.js";

// Tab state
let currentTab = "for"; // for | top | new
let currentQ = "";
let currentCursor = 0;
let hasNext = true;
let isLoading = false;
let globalSets = [];
let observer = null;

// Offline cache
let offlineCache = null;

export function globalHeader(active) {
  return `
    <div class="ahd" style="margin-bottom:4px">
      <div class="seg" style="width:100%;max-width:240px;margin:0 auto">
        <button class="${active === 'discover' ? 'on' : ''}" data-action="global-seg-discover">Discover</button>
        <button class="${active === 'teams' ? 'on' : ''}" data-action="global-seg-teams">Teams</button>
      </div>
    </div>`;
}

function timeAgo(isoStr) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n;
}

export async function renderGlobal() {
  setNav("global");
  showChrome(true);
  
  const auth = await getAuth();
  if (!auth?.accessToken) {
    setHTML(app, `
      <div class="view">
        ${globalHeader("discover")}
        <div class="block" style="padding:16px;text-align:center;border-radius:var(--r-md);background:var(--bg-sheet);border:1px solid var(--border-card)">
          <div style="font-size:20px;font-weight:650;color:var(--text-primary);margin-bottom:4px">Sign in to discover sets</div>
          <div style="font-size:14px;color:var(--text-secondary);line-height:1.4">See sets other learners made, picked for what you study.</div>
          <button class="btn btn-outline" style="margin-top:16px" data-action="nav-you">Sign in</button>
        </div>
      </div>`);
    topOfView();
    return;
  }

  setHTML(app, `
    <div class="view">
      ${globalHeader("discover")}
      <div class="field" style="margin:0 0 12px 0">
        <input type="search" id="globalSearch" placeholder="Search sets..." autocomplete="off" value="${esc(currentQ)}" />
      </div>
      
      <div id="globalTabs" class="tag-row" style="margin-bottom:12px;display:flex;gap:6px;overflow-x:auto">
        <button class="tag ${currentTab === 'for' ? 'on' : ''}" data-action="global-tab" data-id="for">For you</button>
        <button class="tag ${currentTab === 'top' ? 'on' : ''}" data-action="global-tab" data-id="top">Top rated</button>
        <button class="tag ${currentTab === 'new' ? 'on' : ''}" data-action="global-tab" data-id="new">New</button>
      </div>

      <div id="globalSlot" style="display:flex;flex-direction:column;gap:8px;"></div>
      <div id="globalSentinel" style="height:1px;"></div>
    </div>`);
  
  if (globalSets.length > 0) {
    paintGlobal(globalSets, false);
    setupObserver();
  } else {
    currentCursor = 0;
    hasNext = true;
    globalSets = [];
    await loadMore(true);
  }
  
  const input = /** @type {HTMLInputElement} */ (document.getElementById("globalSearch"));
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      currentQ = input.value.trim();
      currentCursor = 0;
      hasNext = true;
      globalSets = [];
      loadMore(true);
    }
  });
}

export function filterGlobalTab(btn) {
  const t = btn.dataset.id;
  if (currentTab === t) return;
  currentTab = t;
  currentCursor = 0;
  hasNext = true;
  globalSets = [];
  renderGlobal();
}

async function loadMore(isFirstPage) {
  if (isLoading || !hasNext) return;
  isLoading = true;
  
  const slot = document.getElementById("globalSlot");
  if (!slot) return;
  
  // Show skeletons
  const skeletonHtml = `
    <div class="skeleton" style="height:76px;border-radius:var(--r-md)"></div>
    <div class="skeleton" style="height:76px;border-radius:var(--r-md)"></div>
    <div class="skeleton" style="height:76px;border-radius:var(--r-md)"></div>
  `;
  if (isFirstPage) {
    setHTML(slot, skeletonHtml);
  } else {
    slot.insertAdjacentHTML("beforeend", `<div id="globalLoading">${skeletonHtml}</div>`);
  }
  
  try {
    const res = await send({ type: "GLOBAL_LIST", tab: currentTab, q: currentQ, cursor: currentCursor });
    if (res.error && res.message) throw new Error(res.message);
    
    if (isFirstPage) offlineCache = { tab: currentTab, data: res.sets };
    
    globalSets.push(...res.sets);
    if (res.nextCursor !== null && res.nextCursor !== undefined) {
      currentCursor = res.nextCursor;
    } else {
      hasNext = false;
    }
    paintGlobal(globalSets, false);
    setupObserver();
  } catch (e) {
    if (isFirstPage) {
      if (offlineCache && offlineCache.tab === currentTab) {
        paintGlobal(offlineCache.data, true);
      } else {
        setHTML(slot, `<div class="empty" style="text-align:center;color:var(--text-muted);font-size:14px;margin-top:20px">Discover needs a connection.</div>`);
      }
    } else {
      const loader = document.getElementById("globalLoading");
      if (loader) loader.remove();
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
    if (entries[0].isIntersecting) {
      loadMore(false);
    }
  }, { rootMargin: "100px" });
  observer.observe(sentinel);
}

function paintGlobal(sets, isOffline) {
  const slot = document.getElementById("globalSlot");
  if (!slot) return;
  
  if (sets.length === 0) {
    if (currentQ) {
      setHTML(slot, `<div style="text-align:center;font-size:14px;color:var(--text-muted);margin-top:20px">No global sets match "${esc(currentQ)}".</div>`);
    } else {
      setHTML(slot, `<div style="text-align:center;font-size:14px;color:var(--text-muted);margin-top:20px">No shared sets yet. Make one of yours global from its \u2022\u2022\u2022 menu.</div>`);
    }
    return;
  }
  
  let html = isOffline ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">You're offline. Showing sets from earlier.</div>` : "";
  
  html += sets.map(s => {
    let meta = `by ${esc(s.authorName)} \u2022 ${s.cardCount} cards`;
    if (currentTab === "new") {
      meta = `by ${esc(s.authorName)} \u2022 ${timeAgo(s.published_at)}`;
    }
    
    let rightCol = "";
    if (s.added) {
      rightCol = `
        <div style="display:flex;align-items:center;gap:4px;color:var(--accent-text);font-size:14px">
          <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor"><path d="M20 6L9 17l-5-5"/></svg>
          <span style="font-weight:600;font-size:13px">Added</span>
        </div>`;
    } else if (s.ratingCount > 0) {
      const avgStr = s.ratingAvg.toFixed(1);
      rightCol = `
        <div style="display:flex;flex-direction:column;align-items:flex-end">
          <div style="display:flex;align-items:center;gap:4px;color:var(--text-primary);font-size:15px;font-weight:700">
            <svg class="ic" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;width:13px;height:13px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${avgStr}
          </div>
          <div style="font-size:11px;color:var(--text-muted)">${fmtNum(s.ratingCount)}</div>
        </div>`;
    } else {
      rightCol = `<div style="font-size:13px;font-weight:600;color:var(--text-muted)">New</div>`;
    }
    
    return `
      <div class="block interactive" data-action="global-preview" data-idx="${sets.indexOf(s)}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="font-weight:650;color:var(--text-primary);font-size:16px">${esc(s.title)}</div>
          <div style="font-size:13px;color:var(--text-muted)">${meta}</div>
        </div>
        ${rightCol}
      </div>`;
  }).join("");
  
  setHTML(slot, html);
}

// ... preview sheet goes here ...
import { presentSheet, closeSheet } from "../sheet.js";
import { renderSetDetail } from "./set-detail.js";

export async function openGlobalPreview(btn) {
  const idx = parseInt(btn.dataset.idx, 10);
  const s = globalSets[idx];
  if (!s) return;
  
  const srcLbl = (s.sourceLabel || "User").substring(0,2).toUpperCase();
  const title = esc(s.title);
  const author = esc(s.authorName);
  
  const avgStr = s.ratingCount > 0 ? s.ratingAvg.toFixed(1) : "";
  const starsHtml = Array.from({length: 5}).map((_, i) => {
    const fill = s.ratingCount > 0 && i < Math.round(s.ratingAvg) ? "currentColor" : "none";
    const stroke = fill === "none" ? "currentColor" : "none";
    return `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:${fill};stroke:${stroke};color:var(--text-muted)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  }).join("");
  
  let ratingRow = `<div style="display:flex;align-items:center;gap:8px">
    <div style="display:flex;gap:2px">${starsHtml}</div>
    ${s.ratingCount > 0 ? `<div style="font-size:14px;font-weight:600">${avgStr}</div><div style="font-size:13px;color:var(--text-muted)">\u2022 ${s.ratingCount.toLocaleString()} ratings</div>` : `<div style="font-size:13px;color:var(--text-muted)">No ratings yet</div>`}
  </div>`;
  
  let reasonCallout = "";
  if (s.reasonSetTitle) {
    reasonCallout = `<div style="padding:12px 14px;border-radius:12px;background:var(--bg-surface2);font-size:14px;color:var(--text-secondary)">Picked because you study <b>${esc(s.reasonSetTitle)}</b></div>`;
  }
  
  let btnHtml = s.added ? 
    `<button class="btn" style="height:52px;border-radius:14px;background:var(--bg-surface2);border:1px solid var(--border-hover);color:var(--accent-text);font-size:16px;font-weight:650;width:100%" data-action="global-open-added" data-id="${s.id}">
      <svg class="ic" viewBox="0 0 24 24" style="stroke:currentColor"><path d="M20 6L9 17l-5-5"/></svg> Added - Open set
    </button>` :
    `<button class="btn btn-primary" style="height:52px;border-radius:14px;font-size:16px;font-weight:650;width:100%" data-action="global-add-set" data-id="${s.id}" data-idx="${idx}">
      Add to my sets
    </button>`;

  const html = `
    <div style="padding:10px 20px 24px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${srcLbl}</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="font-size:20px;font-weight:650;line-height:1.2">${title}</div>
          <div style="font-size:13px;color:var(--text-muted)">by ${author} \u2022 ${s.cardCount} cards</div>
        </div>
      </div>
      
      ${ratingRow}
      ${reasonCallout}
      
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px">SAMPLE CARDS</div>
      <div id="globalSampleCards"><div class="skeleton" style="height:40px"></div></div>
      
      ${btnHtml}
      
      <button class="btn btn-text" style="font-size:13px;color:var(--text-muted);height:32px;margin:0 auto" data-action="global-report" data-id="${s.id}">Report this set</button>
    </div>
  `;
  
  presentSheet(html, { maxHeight: "86%" });
  
  // Fetch sample cards
  try {
    const res = await send({ type: "GLOBAL_FETCH", id: s.id });
    const slot = document.getElementById("globalSampleCards");
    if (slot && res.cards) {
      const cards = res.cards.slice(0,3).map(c => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border-divider);display:flex;align-items:center;gap:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--status-new)"></div>
          <div style="font-size:15px">${esc(c.front)}</div>
        </div>
      `).join("");
      setHTML(slot, cards || `<div class="empty">No cards</div>`);
    }
  } catch(e) {}
}

export async function addGlobalSet(btn) {
  const id = btn.dataset.id;
  const idx = parseInt(btn.dataset.idx, 10);
  btn.textContent = "Adding...";
  btn.disabled = true;
  try {
    const res = await send({ type: "SYNC_PULL_SET", id }); // Or similar add logic
    // Actually we need to copy the set. We'll use SHARE_IMPORT logic or dedicated GLOBAL_ADD.
    // The prompt says: "Add: a server-side copy with origin ids, idempotent, New schedules."
    // If prompt 35 has it, let's use GLOBAL_ADD.
    const addRes = await send({ type: "GLOBAL_ADD", id });
    toast("Added to your sets");
    
    globalSets[idx].added = true;
    const s = globalSets[idx];
    const newBtn = `<button class="btn" style="height:52px;border-radius:14px;background:var(--bg-surface2);border:1px solid var(--border-hover);color:var(--accent-text);font-size:16px;font-weight:650;width:100%" data-action="global-open-added" data-id="${addRes.id || s.id}">
      <svg class="ic" viewBox="0 0 24 24" style="stroke:currentColor"><path d="M20 6L9 17l-5-5"/></svg> Added - Open set
    </button>`;
    btn.outerHTML = newBtn;
    paintGlobal(globalSets, false); // refresh list behind the sheet
  } catch(e) {
    btn.textContent = "Add to my sets";
    btn.disabled = false;
    toast(e.message);
  }
}

export function openAddedSet(btn) {
  closeSheet();
  renderSetDetail(btn.dataset.id, "cards");
}

export async function reportGlobal(btn) {
  const id = btn.dataset.id;
  const ok = await confirmSheet({
    title: "Report set",
    body: "Report this set as spam, harmful, or containing personal info? It will be hidden if multiple people report it.",
    confirmLabel: "Report",
    destructive: true
  });
  if (!ok) return;
  try {
    await send({ type: "GLOBAL_REPORT", id, reason: "Spam" });
    toast("Thanks, we'll take a look");
    closeSheet();
  } catch(e) {
    toast(e.message);
  }
}
