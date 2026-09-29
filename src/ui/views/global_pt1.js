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
