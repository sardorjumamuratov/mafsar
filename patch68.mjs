import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

const railOld = `function rail(architecture, amberIdx = -1) {
  return \`<div class="st-rail st-mt12" role="list" aria-label="Request flow, in order">\${architecture.map((comp, i) => {
    const { name, detail } = splitComponent(comp);
    const last = i === architecture.length - 1;
    return \`<div class="st-row\${last ? " last" : ""}" role="listitem">
        <div class="st-rail-col"><div class="st-dot sm\${i === amberIdx ? " amber" : ""}"></div>\${last ? "" : '<div class="st-line"></div>'}</div>
        <div class="st-cell sm">\${esc(name)}\${detail ? \`<span class="detail"> · \${esc(detail)}</span>\` : ""}</div>
      </div>\`;
  }).join("")}</div>\`;
}`;

const railNew = `function rail(architecture, amberIdx = -1, selectedIdx = -1, interactive = false) {
  return \`<div class="st-rail st-mt12" role="list" aria-label="Request flow, in order">\${architecture.map((comp, i) => {
    const { name, detail } = splitComponent(comp);
    const last = i === architecture.length - 1;
    const isSelected = i === selectedIdx;
    const isAmber = i === amberIdx;
    
    let colClass = "st-rail-col";
    let dotClass = "st-dot sm";
    let cellClass = "st-cell sm";
    let extra = "";
    
    if (isAmber) {
      dotClass += " amber";
    } else if (isSelected) {
      cellClass += " selected";
      dotClass += " teal";
      extra = \`<div style="font-size:12px;color:var(--status-mastered);margin-top:2px;font-weight:600">Possible bottleneck</div>\`;
    }
    
    const tag = interactive ? "button" : "div";
    const attrs = interactive ? \` type="button" data-action="bottleneck-rail-\${i}" aria-pressed="\${isSelected}"\` : "";
    
    return \`<\${tag} class="st-row\${last ? " last" : ""}\${interactive ? " interactive" : ""}\${isSelected ? " selected" : ""}" role="\${interactive ? "button" : "listitem"}"\${attrs} style="\${interactive ? "background:none;border:none;padding:0;text-align:left;width:100%;cursor:pointer" : ""}">
        <div class="\${colClass}"><div class="\${dotClass}"></div>\${last ? "" : '<div class="st-line"></div>'}</div>
        <div class="\${cellClass}" style="\${isSelected && !isAmber ? "border:1px solid var(--status-mastered);background:var(--status-mastered-bg);border-radius:6px;padding:4px 8px;margin:-4px -8px" : ""}"><div style="font-weight:500;color:var(--text-primary)">\${esc(name)}</div>\${detail ? \`<div class="detail">\${esc(detail)}</div>\` : ""}\${extra}</div>
      </\${tag}>\`;
  }).join("")}</div>
  \${interactive && selectedIdx !== -1 ? \`
    <button type="button" class="st-link st-mt12" data-action="bottleneck-rail-clear" style="font-size:13px">I think it is elsewhere</button>
  \` : ""}
  \`;
}`;

code = code.replace(railOld, railNew);

// Fix TS errors
code = code.replace(
  '  const s = bottleneckState;\n  if (!s) return;\n  if (action === "continue") {',
  '  if (action === "continue") {'
);

code = code.replace(
  'let parts = undefined;',
  'let parts = null;'
);

code = code.replace(
  'componentId: s.selectedComponentId, parts',
  'componentId: s.selectedComponentId, parts: parts || undefined'
);

fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
