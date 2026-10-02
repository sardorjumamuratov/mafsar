import { app, bundle, setHTML, esc, topOfView } from "../core.js";
import { setNav, showChrome } from "../nav.js";
import { SetRowHtml as SetRow, setViewModels } from "../set-row.js";
import { openSheet, closeSheet } from "../sheet.js";
import { cleanTitle } from "../../../shared/titles.js";
import { saveSettings } from "../../storage/store.js";
import { readRatings, refreshRatings } from "../../storage/ratings.js";

// ================================================================ SETS (02-sets.html)

let state = {
  query: "",
  filterShow: "all",
};

// Show and Sort options, in the reference's order. The stored sort keys are
// the old labels, so settings saved by earlier versions keep working.
const SHOW = [
  ["all", "All sets"],
  ["due", "Due now"],
  ["global", "Global"],
  ["private", "Private"],
];
const SORT = [
  ["Most due", "Most due"],
  ["Recently opened", "Recently opened"],
  ["A-Z", "A–Z"],
  ["Newest", "Newest"],
];

const CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

function normalize(s) {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function matchesSearch(s, query) {
  if (normalize(cleanTitle(s.title)).includes(query)) return true;
  for (const c of (s.flashcards || [])) {
    if (normalize(c.front).includes(query)) return true;
    if (normalize(c.back).includes(query)) return true;
  }
  return false;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function renderSets(opts = {}) {
  const b = await bundle();
  const sortKey = b.settings.sortOrder || "Most due";
  const ratings = await readRatings();

  // View models, not raw study sets: those have no id to open, no due count
  // and no source.
  const allSets = setViewModels(b.sessions, b.studySets);
  const totalDue = allSets.reduce((acc, s) => acc + s.due, 0);
  if (!opts.updateInPlace) refreshRatings(allSets.map(s => s.originSetId || s.id)).catch(() => {});
  const isGlobalSet = (s) => s.isGlobal || !!ratings[s.originSetId || s.id]?.isGlobal;
  const filters = {
    all: () => true,
    due: (s) => s.due > 0,
    global: isGlobalSet,
    private: (s) => !isGlobalSet(s),
  };
  const counts = Object.fromEntries(SHOW.map(([k]) => [k, allSets.filter(filters[k]).length]));

  let sets = allSets.filter(filters[state.filterShow] || filters.all);
  const q = normalize(state.query.trim());
  if (q) sets = sets.filter(s => matchesSearch(s, q));

  const byTitle = (a, b) => cleanTitle(a.title).localeCompare(cleanTitle(b.title), undefined, { sensitivity: "base" });
  const newest = (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  if (sortKey === "Recently opened") {
    const lastOpened = b.settings.lastOpened || {};
    sets.sort((a, b) => (lastOpened[b.id] || 0) - (lastOpened[a.id] || 0) || newest(a, b));
  } else if (sortKey === "A-Z") {
    sets.sort(byTitle);
  } else if (sortKey === "Newest") {
    sets.sort(newest);
  } else {
    sets.sort((a, b) => (b.due || 0) - (a.due || 0) || byTitle(a, b));
  }

  const filterActive = state.filterShow !== "all";
  const filterLabel = (SHOW.find(([k]) => k === state.filterShow) || SHOW[0])[1];
  const sortLabel = (SORT.find(([k]) => k === sortKey) || SORT[0])[1];

  const list = allSets.length === 0
    ? `<div class="empty">No sets yet. Capture a page or an AI answer with the buttons below.</div>`
    : sets.length === 0
      ? `<div class="empty">${q ? `No sets match “${esc(state.query)}”` : "No sets match this filter."}</div>`
      : sets.map(s => SetRow(s, ratings)).join("");

  const html = `
    <div class="screen" data-view="sets" style="padding:18px 16px 24px;gap:14px">
      <div style="display:flex;flex-direction:column;gap:2px;padding:0 4px">
        <h1 style="margin:0;font-size:24px;font-weight:650;letter-spacing:-.02em">Sets</h1>
        <div style="font-size:13px;color:var(--text-muted)">${plural(allSets.length, "set", "sets")} · ${plural(totalDue, "card due", "cards due")}</div>
      </div>
      <div style="display:flex;gap:8px">
        <label class="search-label" style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;height:44px;padding:0 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card);color:var(--text-faint)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input type="search" placeholder="Search sets and cards" aria-label="Search sets and cards" value="${esc(state.query)}" style="flex:1;min-width:0;background:transparent;border:0;outline:none;color:var(--text-primary);font-size:15px;font-family:inherit">
        </label>
        <button type="button" class="filter-btn" aria-label="Filter and sort" style="position:relative;width:44px;height:44px;border-radius:12px;border:1px solid ${filterActive ? "var(--border-hover)" : "var(--border-card)"};background:var(--bg-surface);color:${filterActive ? "var(--accent-text)" : "var(--text-secondary)"};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
          ${filterActive ? `<span style="position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:4px;background:var(--accent);box-shadow:0 0 0 2px var(--bg-surface)"></span>` : ""}
        </button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:30px;padding:0 4px;font-size:13px;color:var(--text-muted)">
        <span style="display:flex;align-items:center;gap:8px">
          <span aria-live="polite">${plural(sets.length, "set", "sets")}</span>
          ${filterActive ? `<button type="button" class="clear-filter-pill" aria-label="Clear filter: ${esc(filterLabel)}" style="height:28px;padding:0 6px 0 10px;border-radius:999px;border:1px solid var(--border-hover);background:var(--bg-surface2);color:var(--text-primary);font-family:inherit;font-size:13px;font-weight:600;display:flex;align-items:center;gap:4px;cursor:pointer">${esc(filterLabel)}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>` : ""}
        </span>
        <button type="button" class="filter-btn" style="height:30px;padding:0 4px;border:0;background:transparent;display:flex;align-items:center;gap:6px;color:var(--text-secondary);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>${esc(sortLabel)}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">${list}</div>
    </div>`;

  const main = opts.updateInPlace ? app.querySelector('.screen[data-view="sets"]') : null;
  // A late keystroke or sheet tap after leaving Sets repaints nothing.
  if (opts.updateInPlace && !main) return null;
  if (main) {
    // Repaint around the search field, so typing keeps its focus and caret.
    const tmp = document.createElement("div");
    setHTML(tmp, html);
    const [head, searchRow, countRow, listEl] = [...tmp.querySelector(".screen").children];
    main.children[0].replaceWith(head);
    main.querySelector(".filter-btn").replaceWith(searchRow.querySelector(".filter-btn"));
    main.children[2].replaceWith(countRow);
    main.children[3].replaceWith(listEl);
    bindEvents();
    return { count: sets.length, counts, sortKey };
  }

  setHTML(app, html);
  topOfView();
  setNav("sets");
  showChrome(true);
  bindEvents();
  return { count: sets.length, counts, sortKey };

  function bindEvents() {
    const input = /** @type {HTMLInputElement|null} */ (app.querySelector('input[type="search"]'));
    if (input && !input.dataset.wired) {
      input.dataset.wired = "1";
      input.addEventListener("input", () => {
        clearTimeout(window["_searchTimer"]);
        window["_searchTimer"] = setTimeout(() => {
          state.query = input.value;
          renderSets({ updateInPlace: true });
        }, 150);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && input.value) {
          e.preventDefault();
          state.query = "";
          input.value = "";
          renderSets({ updateInPlace: true });
        }
      });
      const label = /** @type {HTMLElement} */ (app.querySelector(".search-label"));
      input.addEventListener("focus", () => { label.style.borderColor = "var(--border-hover)"; });
      input.addEventListener("blur", () => { label.style.borderColor = "var(--border-card)"; });
    }
    app.querySelectorAll(".filter-btn").forEach((btn) => {
      if (/** @type {HTMLElement} */ (btn).dataset.wired) return;
      /** @type {HTMLElement} */ (btn).dataset.wired = "1";
      btn.addEventListener("click", () => openFilterSheet(counts, sets.length, sortKey));
    });
    app.querySelector(".clear-filter-pill")?.addEventListener("click", () => {
      state.filterShow = "all";
      renderSets({ updateInPlace: true });
    });
    // Rows open through the panel's data-action="open-set" router.
  }
}

/** Filter and sort (02-sets.html): choices apply at once; the button closes. */
function openFilterSheet(counts, matchCount, sortKey) {
  let sort = sortKey;
  const content = (n) => `
    <div style="display:flex;flex-direction:column;gap:4px" role="radiogroup" aria-labelledby="showLbl">
      <div class="sheet-label" id="showLbl">Show</div>
      ${SHOW.map(([k, label]) => `
        <button type="button" class="opt-row show-opt" role="radio" aria-checked="${state.filterShow === k}" data-opt="${k}">
          <span class="lbl">${esc(label)}</span><span class="count">${counts[k]}</span><span class="check">${state.filterShow === k ? CHECK : ""}</span>
        </button>`).join("")}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px" role="radiogroup" aria-labelledby="sortLbl">
      <div class="sheet-label" id="sortLbl">Sort by</div>
      ${SORT.map(([k, label]) => `
        <button type="button" class="opt-row sort-opt" role="radio" aria-checked="${sort === k}" data-opt="${esc(k)}">
          <span class="lbl">${esc(label)}</span><span class="check">${sort === k ? CHECK : ""}</span>
        </button>`).join("")}
    </div>
    <button type="button" class="sheet-primary" id="filter-apply">Show ${plural(n, "set", "sets")}</button>`;

  openSheet("Filter and sort", content(matchCount), false, null, { px: 16, pb: 24, gap: 14 });

  const repaint = async () => {
    const res = await renderSets({ updateInPlace: true });
    const box = document.querySelector("#sheet .sheet-content");
    if (!box || !res) return;
    setHTML(box, content(res.count));
    bind();
  };
  function bind() {
    const sheet = document.getElementById("sheet");
    sheet.querySelectorAll(".show-opt").forEach((el) => el.addEventListener("click", () => {
      state.filterShow = /** @type {HTMLElement} */ (el).dataset.opt;
      repaint();
    }));
    sheet.querySelectorAll(".sort-opt").forEach((el) => el.addEventListener("click", async () => {
      sort = /** @type {HTMLElement} */ (el).dataset.opt;
      await saveSettings({ sortOrder: sort });
      repaint();
    }));
    sheet.querySelector("#filter-apply")?.addEventListener("click", () => closeSheet());
  }
  bind();
}
