const fs = require("fs");
const c = `import { app, bundle, setHTML, esc, topOfView } from "../core.js";
import { setNav, showChrome } from "../nav.js";
import { renderSetDetail } from "./set-detail.js";
import { ICONS } from "../icons.js";
import { SectionLabel, PrimaryButton, IconButton } from "../components.js";
import { SetRowHtml as SetRow } from "../set-row.js";
import { openSheet, closeSheet } from "../sheet.js";
import { cleanTitle } from "../../shared/titles.js";
import { saveSettings } from "../../storage/store.js";
import { parseShareCode } from "../share-link.js";

let state = {
  query: "",
  filterShow: "All sets",
};

function normalize(s) {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
}

function matchesSearch(s, query) {
  if (normalize(cleanTitle(s.title)).includes(query)) return true;
  for (const c of (s.flashcards || [])) {
    if (normalize(c.front).includes(query)) return true;
    if (normalize(c.back).includes(query)) return true;
  }
  return false;
}

export async function renderSets(opts = {}) {
  const b = await bundle();
  const sortOrder = b.settings.sortOrder || "Most due";
  
  let sets = [...b.studySets];
  
  const hasGlobal = sets.some(s => s.mode === "global");
  const showOptions = ["All sets", "Due now"];
  if (hasGlobal) {
    showOptions.push("Global");
    showOptions.push("Private");
  }

  if (state.filterShow === "Due now") {
    sets = sets.filter(s => s.due > 0);
  } else if (state.filterShow === "Global") {
    sets = sets.filter(s => s.mode === "global");
  } else if (state.filterShow === "Private") {
    sets = sets.filter(s => s.mode !== "global");
  }

  let q = normalize(state.query.trim());
  if (q) {
    sets = sets.filter(s => matchesSearch(s, q));
  }
  
  if (sortOrder === "Most due") {
    sets.sort((a, b) => {
      const dueDiff = (b.due || 0) - (a.due || 0);
      if (dueDiff !== 0) return dueDiff;
      return cleanTitle(a.title).localeCompare(cleanTitle(b.title), undefined, { sensitivity: "base" });
    });
  } else if (sortOrder === "Recently opened") {
    const lastOpened = b.settings.lastOpened || {};
    sets.sort((a, b) => {
      const aO = lastOpened[a.id] || 0;
      const bO = lastOpened[b.id] || 0;
      if (aO !== bO) return bO - aO;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  } else if (sortOrder === "A-Z") {
    sets.sort((a, b) => cleanTitle(a.title).localeCompare(cleanTitle(b.title), undefined, { sensitivity: "base" }));
  } else if (sortOrder === "Newest") {
    sets.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  let html = \`
    <div style="padding: 18px 16px 28px; display: flex; flex-direction: column; gap: 14px; padding-bottom: 28px">
      <div style="display: flex; flex-direction: column; gap: 2px; padding: 0 4px">
        <h1 style="font-size: 24px; font-weight: 650; letter-spacing: -0.02em; margin: 0">Sets</h1>
        <div style="font-size: 13px; color: var(--text-muted)">
          \${b.studySets.length === 1 ? "1 set" : \`\${b.studySets.length} sets\`} &middot; 
          \${b.studySets.reduce((acc, s) => acc + (s.due || 0), 0) === 1 ? "1 card due" : \`\${b.studySets.reduce((acc, s) => acc + (s.due || 0), 0)} cards due\`}
        </div>
      </div>
      
      <div style="display: flex; gap: 8px">
        <label style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; border-radius: 12px; background: var(--bg-surface); border: 1px solid var(--border-card); color: var(--text-faint)" tabindex="-1" class="search-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" placeholder="Search sets and cards" aria-label="Search sets and cards" value="\${esc(state.query)}" style="flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 15px; font-family: inherit">
        </label>
        
        <button class="filter-btn" aria-label="Filter and sort" style="width: 44px; height: 44px; border-radius: 12px; background: var(--bg-surface); flex-shrink: 0; display: flex; align-items: center; justify-content: center; position: relative; \${state.filterShow !== 'All sets' ? 'border: 1px solid var(--border-hover); color: var(--accent)' : 'border: 1px solid var(--border-card); color: var(--text-secondary)'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="4" x2="20" y1="9" y2="9"/><circle cx="15" cy="9" r="2" fill="var(--bg-surface)"/><line x1="4" x2="20" y1="15" y2="15"/><circle cx="9" cy="15" r="2" fill="var(--bg-surface)"/></svg>
          \${state.filterShow !== 'All sets' ? \`<div style="position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--bg-surface)"></div>\` : ''}
        </button>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 30px; padding: 0 4px; font-size: 13px">
        <div style="display: flex; gap: 8px; align-items: center">
          <div aria-live="polite" style="color: var(--text-muted)">\${sets.length === 1 ? "1 set" : \`\${sets.length} sets\`}</div>
          \${state.filterShow !== 'All sets' ? \`
            <button class="clear-filter-pill" aria-label="Clear filter" style="height: 28px; padding: 0 6px 0 10px; border-radius: 999px; border: 1px solid var(--border-hover); background: var(--bg-surface2); color: var(--text-primary); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 4px; cursor: pointer">
              \${esc(state.filterShow)}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          \` : ''}
        </div>
        
        <button class="filter-btn" style="height: 30px; padding: 0 4px; background: transparent; border: none; color: var(--text-secondary); font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>
          \${esc(sortOrder)}
        </button>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px">
        \${b.studySets.length === 0 ? \`
          <div style="text-align: center; padding: 28px 12px; font-size: 14px; color: var(--text-muted)">No sets yet. Capture a page or an AI answer with the buttons below.</div>
        \` : sets.length === 0 ? \`
          <div style="text-align: center; padding: 28px 12px; font-size: 14px; color: var(--text-muted)">\${q ? \`No sets match "\${esc(state.query)}"\` : \`No sets match this filter.\`}</div>
        \` : sets.map(s => SetRow(s)).join("")}
      </div>
    </div>
  \`;
  
  if (opts.updateInPlace) {
    const main = app.querySelector("div");
    setHTML(main, html);
    bindEvents();
    return;
  }
  
  setHTML(app, html);
  topOfView();
  setNav("sets");
  bindEvents();
  showChrome();
  
  function bindEvents() {
    app.querySelector('input[type="search"]')?.addEventListener("input", (e) => {
      clearTimeout(window["_searchTimer"]);
      window["_searchTimer"] = setTimeout(() => {
        state.query = e.target["value"];
        renderSets({ updateInPlace: true });
      }, 150);
    });
    
    app.querySelector('input[type="search"]')?.addEventListener("keydown", (e) => {
      if (e["key"] === "Escape") {
        e.preventDefault();
        state.query = "";
        e.target["value"] = "";
        renderSets({ updateInPlace: true });
      }
    });

    app.querySelector('.search-label')?.addEventListener("focusin", (e) => {
      e.currentTarget["style"].borderColor = "var(--border-hover)";
    });
    app.querySelector('.search-label')?.addEventListener("focusout", (e) => {
      e.currentTarget["style"].borderColor = "var(--border-card)";
    });
    
    app.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener("click", () => openFilterSheet(sortOrder, showOptions, sets.length));
    });
    
    app.querySelector('.clear-filter-pill')?.addEventListener("click", () => {
      state.filterShow = "All sets";
      renderSets({ updateInPlace: true });
    });
    
    app.querySelectorAll('.setrow').forEach(row => {
      row.addEventListener("click", (e) => {
        const id = e.currentTarget["dataset"].id;
        renderSetDetail(id);
      });
    });
  }
}

function openFilterSheet(sortOrder, showOptions, matchCount) {
  let tempShow = state.filterShow;
  let tempSort = sortOrder;
  
  const sortOptions = ["Most due", "Recently opened", "A-Z", "Newest"];
  
  function renderContent() {
    return \`
      <div style="display: flex; flex-direction: column; gap: 14px; padding-top: 14px">
        <div style="display: flex; flex-direction: column">
          \${SectionLabel("SHOW")}
          <div role="radiogroup" style="display: flex; flex-direction: column; gap: 4px; padding-top: 4px">
            \${showOptions.map(opt => \`
              <div role="radio" data-opt="\${esc(opt)}" class="show-opt" style="height: 48px; padding: 0 12px; border-radius: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; \${tempShow === opt ? 'background: var(--bg-surface2); border: 1px solid var(--border-hover)' : 'background: transparent; border: 1px solid transparent'}">
                <div style="flex: 1; font-size: 15px; font-weight: 600">\${esc(opt)}</div>
                \${tempShow === opt ? \`
                  <div style="width: 18px; display: flex; flex-direction: column">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                \` : ''}
              </div>
            \`).join('')}
          </div>
        </div>
        
        <div style="display: flex; flex-direction: column">
          \${SectionLabel("SORT BY")}
          <div role="radiogroup" style="display: flex; flex-direction: column; gap: 4px; padding-top: 4px">
            \${sortOptions.map(opt => \`
              <div role="radio" data-opt="\${esc(opt)}" class="sort-opt" style="height: 48px; padding: 0 12px; border-radius: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; \${tempSort === opt ? 'background: var(--bg-surface2); border: 1px solid var(--border-hover)' : 'background: transparent; border: 1px solid transparent'}">
                <div style="flex: 1; font-size: 15px; font-weight: 600">\${esc(opt)}</div>
                \${tempSort === opt ? \`
                  <div style="width: 18px; display: flex; flex-direction: column">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                \` : ''}
              </div>
            \`).join('')}
          </div>
        </div>
      </div>
      
      <div style="padding-top: 10px">
        \${PrimaryButton(\`Show \${matchCount === 1 ? '1 set' : \`\${matchCount} sets\`}\`, { id: "filter-apply", style: "height: 50px; border-radius: 12px; font-size: 15px; font-weight: 650; width: 100%" })}
      </div>
    \`;
  }
  
  function bindSheet(sheetDiv) {
    sheetDiv.querySelectorAll('.show-opt').forEach(opt => {
      opt.addEventListener("click", (e) => {
        tempShow = e.currentTarget.dataset.opt;
        state.filterShow = tempShow;
        renderSets({ updateInPlace: true }).then(() => {
          const newMatch = document.querySelectorAll('.setrow').length;
          const applyBtn = sheetDiv.querySelector('#filter-apply');
          if (applyBtn) {
            applyBtn.textContent = \`Show \${newMatch === 1 ? '1 set' : \`\${newMatch} sets\`}\`;
          }
        });
        const content = sheetDiv.querySelector('.sheet-content');
        if (content) {
            content.innerHTML = renderContent();
            bindSheet(sheetDiv);
        }
      });
    });
    
    sheetDiv.querySelectorAll('.sort-opt').forEach(opt => {
      opt.addEventListener("click", async (e) => {
        tempSort = e.currentTarget.dataset.opt;
        await saveSettings({ sortOrder: tempSort });
        renderSets({ updateInPlace: true });
        const content = sheetDiv.querySelector('.sheet-content');
        if (content) {
            content.innerHTML = renderContent();
            bindSheet(sheetDiv);
        }
      });
    });
    
    sheetDiv.querySelector('#filter-apply')?.addEventListener("click", () => {
      closeSheet();
    });
  }

  openSheet('<div style="font-size: 18px; font-weight: 650; padding: 0 6px">Filter and sort</div>', renderContent(), false);
  
  setTimeout(() => {
      const sheet = document.getElementById("sheet");
      if (sheet) bindSheet(sheet);
  }, 0);
}
`;
fs.writeFileSync("src/ui/views/sets.js", c);
