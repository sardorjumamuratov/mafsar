import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

const start = code.indexOf("export function paintBottleneckQuestion() {");
const end = code.indexOf("export function bottleneckAction(action) {");

const newFunc = `export function paintBottleneckQuestion() {
  const s = bottleneckState;
  if (!s) return;
  s.step = "answering";
  
  const isSim = s.task.practiceStyle === "simulation";
  
  let hintHtml = "";
  if (isSim) {
    hintHtml = s.hintLevel >= 1
      ? \`<button type="button" class="st-link" disabled>\${icon("bulb", 16)}Hint used</button>\`
      : \`<button type="button" class="st-link" data-action="bottleneck-hint">\${icon("bulb", 16)}Hint<span class="dim"> −½ pt</span></button>\`;
  } else {
    hintHtml = s.hintLevel >= 3
      ? \`<button type="button" class="st-link" disabled>\${icon("bulb", 16)}Hints used</button>\`
      : \`<button type="button" class="st-link" data-action="bottleneck-hint">\${icon("bulb", 16)}Get a hint</button>\`;
  }

  const archHtml = rail(s.task.architecture || s.task.components || [], -1, s.selectedComponentIdx, true);
  
  const hintBlocks = s.hints.filter(Boolean).map(h => \`<div class="st-feedback st-mt8">\${esc(h)}</div>\`).join("");
  
  let fieldsHtml = "";
  let dockHtml = "";
  
  if (isSim) {
    fieldsHtml = \`
      <div class="st-qrow"><span class="st-label">What breaks, and why?</span>\${hintHtml}</div>
      \${hintBlocks}
      <textarea id="bottleneckAnswer" class="st-field h140 st-mt8" placeholder="What fails, under what load or failure, and how you'd fix it" aria-label="What breaks, and why">\${esc(s.draft)}</textarea>\`;
    dockHtml = primaryBtn("bottleneck-submit", "Submit", 'id="bottleneckSubmit" disabled');
  } else {
    // Guided: 3 fields
    const f1 = \`
      <div class="st-label st-mt24">What breaks?</div>
      <textarea id="bottleneckDraft1" class="st-field h80 st-mt8" placeholder="Name the component or behavior that fails.">\${esc(s.draft)}</textarea>
    \`;
    const f2 = \`
      <div class="st-label st-mt24">Why does it fail?</div>
      <textarea id="bottleneckDraft2" class="st-field h80 st-mt8" placeholder="Describe the load, failure condition, or chain reaction.">\${esc(s.draft2)}</textarea>
    \`;
    const f3 = \`
      <div class="st-label st-mt24">What would you change?</div>
      <textarea id="bottleneckDraft3" class="st-field h80 st-mt8" placeholder="Propose a fix and name one trade-off.">\${esc(s.draft3)}</textarea>
    \`;
    
    fieldsHtml = \`<div class="st-qrow"><span class="st-label">Diagnosis</span>\${hintHtml}</div>\${hintBlocks}\` + f1;
    if (s.guidedStep >= 2) fieldsHtml += f2;
    if (s.guidedStep >= 3) fieldsHtml += f3;
    
    if (s.guidedStep < 3) {
      dockHtml = primaryBtn("bottleneck-continue", "Continue", 'id="bottleneckContinue" disabled');
    } else {
      dockHtml = primaryBtn("bottleneck-submit", "Submit", 'id="bottleneckSubmit" disabled');
    }
  }

  paintShell({
    mode: "What breaks",
    prompt: s.task.narrative,
    promptClass: "text",
    progress: 0,
    counter: "0 / 1",
    body: \`
      <div class="st-label st-mt20">Architecture</div>
      \${archHtml}
      <div class="st-mt24">\${fieldsHtml}</div>\`,
    dock: dockHtml,
  });

  if (isSim) {
    const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckAnswer"));
    bindField(box, {
      btn: /** @type {HTMLButtonElement} */ (document.getElementById("bottleneckSubmit")),
      onChange: (v) => { s.draft = v; },
      onSubmit: () => submitBottleneck(),
    });
    if (!s.hints.length) focusEnd(box);
  } else {
    const b1 = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckDraft1"));
    const b2 = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckDraft2"));
    const b3 = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckDraft3"));
    
    const contBtn = /** @type {HTMLButtonElement} */ (document.getElementById("bottleneckContinue"));
    const subBtn = /** @type {HTMLButtonElement} */ (document.getElementById("bottleneckSubmit"));
    
    const checkStep = () => {
      if (s.guidedStep === 1) {
        if (s.draft.length >= 12 && contBtn) contBtn.disabled = false;
        else if (contBtn) contBtn.disabled = true;
      } else if (s.guidedStep === 2) {
        if (s.draft2.length >= 12 && contBtn) contBtn.disabled = false;
        else if (contBtn) contBtn.disabled = true;
      } else {
        if (s.draft.trim() && s.draft2.trim() && s.draft3.trim() && subBtn) subBtn.disabled = false;
        else if (subBtn) subBtn.disabled = true;
      }
    };
    
    if (b1) {
      b1.addEventListener("input", () => { s.draft = b1.value; checkStep(); });
      b1.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (s.guidedStep === 1 && !contBtn?.disabled) contBtn?.click();
          else if (s.guidedStep === 3 && !subBtn?.disabled) subBtn?.click();
        }
      });
    }
    if (b2) {
      b2.addEventListener("input", () => { s.draft2 = b2.value; checkStep(); });
      b2.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (s.guidedStep === 2 && !contBtn?.disabled) contBtn?.click();
          else if (s.guidedStep === 3 && !subBtn?.disabled) subBtn?.click();
        }
      });
    }
    if (b3) {
      b3.addEventListener("input", () => { s.draft3 = b3.value; checkStep(); });
      b3.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (!subBtn?.disabled) subBtn?.click();
        }
      });
    }
    
    checkStep();
    if (!s.hints.length) {
      if (s.guidedStep === 1 && b1) focusEnd(b1);
      else if (s.guidedStep === 2 && b2) focusEnd(b2);
      else if (s.guidedStep === 3 && b3) focusEnd(b3);
    }
  }
}

`;

code = code.substring(0, start) + newFunc + code.substring(end);
fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
