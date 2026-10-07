import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

const start = code.indexOf("export async function requestBottleneckHint() {");
const end = code.indexOf("export async function submitBottleneck() {", start);

const newFunc = `export async function requestBottleneckHint() {
  const s = bottleneckState;
  if (!s || s.step !== "answering") return;
  const isSim = s.task.practiceStyle === "simulation";
  if (isSim && s.hintLevel >= 1) return;
  if (!isSim && s.hintLevel >= 3) return;

  if (isSim) {
    s.draft = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckAnswer"))?.value || s.draft;
  } else {
    s.draft = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckDraft1"))?.value || s.draft;
    s.draft2 = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckDraft2"))?.value || s.draft2;
    s.draft3 = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckDraft3"))?.value || s.draft3;
  }
  
  const btn = /** @type {HTMLButtonElement|null} */ (app.querySelector('[data-action="bottleneck-hint"]'));
  if (btn) btn.disabled = true;
  
  const token = (s.token = {});
  try {
    const res = await send({ type: "BOTTLENECK_HINT", state: s.task.state });
    if (bottleneckState !== s || s.token !== token) return;
    s.hints[res.level - 1] = res.hint;
    s.hintLevel = res.level;
    s.task.state = res.state;
    if (isSim) s.usedHint = true;
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
  }
  paintBottleneckQuestion();
}

`;

code = code.substring(0, start) + newFunc + code.substring(end);
fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
