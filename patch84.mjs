import fs from "fs";
let code = fs.readFileSync("src/ui/flows/design.js", "utf8");

const startIdx = code.indexOf("const filledCount = (s) =>");
const endIdx = code.indexOf("export function designAction(action) {");

const newCode = `const filledCount = (s) => {
  const activeSections = s.practiceStyle === "guided" ? GUIDED_SECTIONS : SECTIONS;
  return activeSections.filter((sec) => s.sections[sec.key] && s.sections[sec.key].trim().length > 0).length;
};

const briefHtml = (s) => \`<div class="st-prompt text st-clamp l4" id="briefText">\${esc(s.brief)}</div>\`;
const briefToggle = \`<button type="button" class="st-link st-mt6" id="briefBtn" data-action="design-toggle-brief">Show full brief</button>\`;

export function paintDesignForm() {
  const s = designState;
  if (!s) return;
  const isGuided = s.practiceStyle === "guided";
  
  if (isGuided && s.activeSectionKey === "outline") {
    return paintDesignOutline();
  }
  
  const activeSections = isGuided ? GUIDED_SECTIONS : SECTIONS;
  const idx = activeSections.findIndex((sec) => sec.key === s.activeSectionKey);
  const sec = activeSections[idx];
  const next = activeSections[idx + 1];
  const filled = filledCount(s);
  const len = (s.sections[sec.key] || "").length;

  const tabs = activeSections.map((x) => {
    const cur = x.key === s.activeSectionKey;
    const has = (s.sections[x.key] || "").trim().length > 0;
    return \`<button type="button" class="st-tab\${cur ? " cur" : has ? " done" : ""}" data-action="design-nav" data-key="\${x.key}" data-chip="\${x.key}"\${cur ? ' aria-current="true"' : ""}>\${!cur && has ? icon("check", 12, 3) : ""}\${esc(CHIP[x.key])}</button>\`;
  }).join("");

  // Constraint anchor
  let constraintsHtml = "";
  if (s.constraints && s.constraints.length > 0) {
    constraintsHtml = \`<div class="st-pillrow st-mt8" style="position:sticky;top:0;background:var(--bg-primary);padding-top:4px;padding-bottom:4px;z-index:2;cursor:pointer" data-action="design-toggle-brief">\${s.constraints.map(c => \`<span class="st-pill dim">\${esc(c)}</span>\`).join("")}</div>\`;
  }

  let bodyHtml = "";
  if (isGuided) {
    let chipsHtml = "";
    if (sec.chips) {
      chipsHtml = \`
        <div class="st-mt12" style="display:flex;flex-wrap:wrap;gap:8px">
          \${sec.chips.map(c => \`<button type="button" class="st-pill \${s.conceptChipExpanded === c ? "active" : ""}" data-action="design-chip" data-key="\${esc(c)}">\${esc(c)}</button>\`).join("")}
        </div>
      \`;
      if (s.conceptChipExpanded) {
        let text = "";
        if (s.conceptChipExpanded === "Cache") text = "What would you cache, and when does it go stale?";
        else text = \`How would \${s.conceptChipExpanded} apply here?\`; // Fallback
        chipsHtml += \`<div class="st-note st-mt8">\${esc(text)}</div>\`;
      }
    }
    
    let hintHtml = "";
    if (s.dontKnowLevel >= 1) hintHtml += \`<div class="st-feedback st-mt8">\${esc(sec.hint)}</div>\`;
    if (s.dontKnowLevel >= 2) hintHtml += \`<div class="st-feedback st-mt8">Think about: \${esc(sec.chips.slice(0,2).join(" or "))}.</div>\`;
    if (s.dontKnowLevel >= 3 && s.constraints) hintHtml += \`<div class="st-feedback st-mt8">Hint: \${esc(s.constraints[0] || "")}</div>\`;
    
    bodyHtml = \`
      \${constraintsHtml || briefToggle}
      <div class="st-tabs" id="designChips" role="tablist" aria-label="Design sections">\${tabs}</div>
      <div class="st-labelrow st-mt24">
        <div style="font-size:17px;font-weight:650">\${esc(sec.question)}</div>
        <span class="st-count-hint" id="designCount"\${len > SHOW_COUNT_AT ? "" : " hidden"}>\${len.toLocaleString()} / \${LIMIT.toLocaleString()}</span>
      </div>
      <div class="st-sub" style="margin-top:4px;font-size:14px;color:var(--text-secondary)">\${esc(sec.hint)}</div>
      \${chipsHtml}
      \${hintHtml}
      \${s.checkpoint ? \`<div class="st-feedback st-mt12">\${esc(s.checkpoint)}</div>\` : ""}
      <textarea id="designAnswer" class="st-field st-mt12" style="min-height:96px" maxlength="\${LIMIT}" placeholder="\${esc(EXAMPLE[sec.key] || "")}" aria-label="\${esc(sec.title)}">\${esc(s.sections[sec.key] || "")}</textarea>\`;
  } else {
    bodyHtml = \`
      \${constraintsHtml || briefToggle}
      <div class="st-tabs" id="designChips" role="tablist" aria-label="Design sections">\${tabs}</div>
      <div class="st-labelrow st-mt24">
        <div style="font-size:17px;font-weight:650">\${esc(sec.title)}</div>
        <span class="st-count-hint" id="designCount"\${len > SHOW_COUNT_AT ? "" : " hidden"}>\${len.toLocaleString()} / \${LIMIT.toLocaleString()}</span>
      </div>
      <div class="st-sub" style="margin-top:4px;font-size:14px;color:var(--text-secondary)">\${esc(sec.hint)}</div>
      <textarea id="designAnswer" class="st-field h180 st-mt12" maxlength="\${LIMIT}" placeholder="\${esc(EXAMPLE[sec.key] || "")}" aria-label="\${esc(sec.title)}">\${esc(s.sections[sec.key] || "")}</textarea>\`;
  }

  let dockHtml = "";
  if (isGuided) {
    if (s.checkpoint) {
      dockHtml = \`\${secondaryBtn("design-improve", "Improve this")}\${primaryBtn("design-nav", "Continue", \`data-key="\${next ? next.key : "outline"}"\`)}\`;
    } else {
      dockHtml = \`\${secondaryBtn("design-dontknow", "I'm not sure")}\${s.sections[sec.key]?.trim() ? primaryBtn("design-check", "Check my thinking") : primaryBtn("design-nav", "Continue", \`data-key="\${next ? next.key : "outline"}"\`)}\`;
    }
  } else {
    dockHtml = next
      ? \`\${secondaryBtn("design-submit", "Finish early")}\${primaryBtn("design-nav", \`Next: \${CHIP[next.key]}\`, \`data-key="\${next.key}"\`)}\`
      : primaryBtn("design-submit", "Submit design");
  }

  paintShell({
    mode: isGuided ? "Design brief · Learn concepts" : "Design brief · Interview simulation",
    promptHtml: briefHtml(s),
    progress: (filled / activeSections.length) * 100,
    counter: isGuided ? \`Step \${idx + 1}/\${activeSections.length}\` : \`\${filled} of \${activeSections.length} sections written\`,
    hasProgress: filled > 0,
    body: bodyHtml,
    dock: dockHtml,
  });

  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("designAnswer"));
  bindField(box, {
    onChange: (v) => {
      s.sections[sec.key] = v;
      if (isGuided && !s.checkpoint) {
        const btnCheck = document.querySelector('[data-action="design-check"]');
        const btnNav = document.querySelector('[data-action="design-nav"]');
        if (v.trim()) {
           if (!btnCheck && btnNav) btnNav.outerHTML = primaryBtn("design-check", "Check my thinking");
        } else {
           if (btnCheck) btnCheck.outerHTML = primaryBtn("design-nav", "Continue", \`data-key="\${next ? next.key : "outline"}"\`);
        }
      }
      
      const hint = document.getElementById("designCount");
      if (hint) {
        hint.hidden = v.length <= SHOW_COUNT_AT;
        hint.textContent = \`\${v.length.toLocaleString()} / \${LIMIT.toLocaleString()}\`;
      }
      const n = filledCount(s);
      const count = app.querySelector(".st-count");
      const fill = /** @type {HTMLElement|null} */ (app.querySelector(".st-fill"));
      if (count) {
        count.textContent = isGuided ? \`Step \${idx + 1}/\${activeSections.length}\` : \`\${n} of \${activeSections.length} sections written\`;
      }
      if (fill) fill.style.width = \`\${(n / activeSections.length) * 100}%\`;
    },
  });
  if (!s.checkpoint) focusEnd(box);

  // Bring the active chip into view
  const row = document.getElementById("designChips");
  const chip = row?.querySelector(\`[data-chip="\${s.activeSectionKey}"]\`);
  if (row && chip) {
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    if (c.left < r.left || c.right > r.right) row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
  }
}

function paintDesignOutline() {
  const s = designState;
  const activeSections = s.practiceStyle === "guided" ? GUIDED_SECTIONS : SECTIONS;
  const anyEmpty = activeSections.some(sec => !s.sections[sec.key]?.trim());
  
  const outlineHtml = activeSections.map(sec => {
    const val = s.sections[sec.key]?.trim();
    return \`
      <div class="st-mt16">
        <div style="font-weight:600;font-size:15px;display:flex;justify-content:space-between">
          <span>\${esc(sec.title)}</span>
          <button type="button" class="st-link" data-action="design-nav" data-key="\${sec.key}" style="font-size:13px;font-weight:normal">Edit</button>
        </div>
        <div class="st-mt8 st-text15" style="white-space:pre-wrap">\${val ? esc(val) : \`<span class="dim">Skipped</span>\`}</div>
      </div>
    \`;
  }).join("");
  
  paintShell({
    mode: "Design brief · Learn concepts",
    progress: 100,
    counter: "Outline",
    hasProgress: true,
    body: \`
      <div class="st-labelrow st-mt24"><div style="font-size:17px;font-weight:650">Your design outline</div></div>
      \${outlineHtml}
      \${anyEmpty ? \`<div class="st-note st-mt16">Unanswered areas will be marked as skipped.</div>\` : ""}
    \`,
    dock: \`\${secondaryBtn("design-submit", "Finish early")}\${primaryBtn("design-submit", "Submit design")}\`
  });
}

`;

code = code.substring(0, startIdx) + newCode + code.substring(endIdx);
fs.writeFileSync("src/ui/flows/design.js", code, "utf8");
