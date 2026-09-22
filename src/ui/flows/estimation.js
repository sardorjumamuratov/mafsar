
import { XBTN, app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { isDue } from "../../../shared/srs.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { parseEstimation, gradeEstimation } from "../../storage/estimation.js";

export let estimationState = null; // { sessionId, topic, cards, task, idx, results, step, token }

export async function startEstimationDrill(sessionId) {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");
  const session = sessions.find((s) => s.id === sessionId);
  
  estimationState = {
    sessionId,
    topic: String(session?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map(c => ({ front: c.front, back: c.back })),
    task: null,
    idx: 0,
    results: [],
    step: "generating",
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintEstimationLoader("Writing questions...");
  requestEstimationTask();
}

export function setEstimationState(v) { estimationState = v; }

function paintEstimationLoader(msg) {
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">Estimation drill</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>
        <span style="font-size:13px;color:var(--muted)">${esc(msg)}</span>
      </div>
    </div>`);
}

async function requestEstimationTask() {
  const s = estimationState;
  const token = (s.token = {});
  try {
    const res = await send({ type: "ESTIMATION_TASK", concept: s.topic, reference: s.cards });
    if (estimationState !== s || s.token !== token) return;
    s.task = res;
    s.step = "answering";
    paintEstimationQuestion();
  } catch (e) {
    if (estimationState !== s || s.token !== token) return;
    toast(e.message);
    (/** @type {HTMLElement} */ (document.querySelector(".rev-top .xbtn")))?.click();
  }
}

export function paintEstimationQuestion() {
  const s = estimationState;
  if (s.idx >= s.task.questions.length) return finishEstimation();
  
  const q = s.task.questions[s.idx];
  
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${esc(((s.idx) / s.task.questions.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${esc(s.idx + 1)} / ${esc(s.task.questions.length)}</span>
    </div>
    <div class="rev-body teach">
      <div class="t-label">Question ${esc(s.idx + 1)}</div>
      <p class="teach-lead" style="margin-bottom:12px;font-size:18px">${esc(q.question)}</p>
      
      <div style="display:flex;flex-direction:column;gap:8px">
        <input type="text" id="estimationValue" class="sa-input" inputmode="text" placeholder="e.g. 1.5 million QPS" style="font-size:18px;padding:12px" autofocus />
      </div>
      <button class="btn btn-primary btn-block" data-action="estimation-submit" style="margin-top:16px">Check</button>
    </div>`);
    
  // Allow enter to submit
  const input = document.getElementById("estimationValue");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitEstimation();
    });
  }
}

export function submitEstimation() {
  const s = estimationState;
  const box = document.getElementById("estimationValue");
  const raw = (/** @type {HTMLInputElement} */ (box))?.value.trim();
  if (!raw) return toast("Enter an estimate.");
  
  const parsed = parseEstimation(raw);
  if (!parsed) return toast("Couldn't understand that number.");
  
  const q = s.task.questions[s.idx];
  const parsedRef = parseEstimation(q.reference_value + " " + q.reference_unit);
  
  const grade = gradeEstimation(parsedRef, parsed);
  s.results.push({ question: q, answer: parsed, grade });
  
  paintEstimationGrade();
}

function paintEstimationGrade() {
  const s = estimationState;
  const r = s.results[s.idx];
  const q = r.question;
  
  const colors = { spot_on: "ok", ballpark: "warn", off: "no" };
  const labels = { spot_on: "Spot on (< 2x)", ballpark: "Ballpark (< 10x)", off: "Off" };
  const cl = colors[r.grade];
  const label = labels[r.grade];
  
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${esc(((s.idx + 1) / s.task.questions.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${esc(s.idx + 1)} / ${esc(s.task.questions.length)}</span>
    </div>
    <div class="rev-body teach">
      <div class="t-label">Question ${esc(s.idx + 1)}</div>
      <p class="teach-lead" style="margin-bottom:12px;font-size:18px">${esc(q.question)}</p>
      
      <div style="background:var(--surface-2);border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:600">Your answer</span>
          <span class="idea-chip ${cl}">${esc(label)}</span>
        </div>
        <div style="font-size:20px;font-weight:700">${esc(r.answer.original)}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">Target: ${esc(q.reference_value)} ${esc(q.reference_unit)}</div>
      </div>
      
      <div class="t-label">Solution</div>
      <div class="block tint" style="font-size:14px;line-height:1.5">${esc(q.worked_solution)}</div>
      
      <button class="btn btn-primary btn-block" data-action="estimation-next" style="margin-top:16px">Next</button>
    </div>`);
}

export function estimationNext() {
  estimationState.idx++;
  paintEstimationQuestion();
}

async function finishEstimation() {
  const s = estimationState;
  s.step = "summarizing";
  paintEstimationLoader("Writing a summary...");
  
  const token = (s.token = {});
  try {
    const res = await send({ type: "ESTIMATION_SUMMARY", results: s.results.map(r => ({
      question: r.question.question,
      expected: r.question.reference_value + " " + r.question.reference_unit,
      answer: r.answer.original,
      grade: r.grade
    })) });
    
    if (estimationState !== s || s.token !== token) return;
    
    const writes = [bumpActivity(1)];
    writes.push(appendReviewLog({
      kind: "teach", stability: null, difficulty: null,
      id: uid(), cardId: "", sessionId: s.sessionId,
      grade: 3, prevInterval: 0, newInterval: 0, reviewedAt: new Date().toISOString(),
    }));
    await Promise.all(writes);
    
    paintEstimationSummary(res);
  } catch (e) {
    if (estimationState !== s || s.token !== token) return;
    toast(e.message);
    (/** @type {HTMLElement} */ (document.querySelector(".rev-top .xbtn")))?.click();
  }
}

function paintEstimationSummary(summary) {
  const s = estimationState;
  const spotOn = s.results.filter(r => r.grade === "spot_on").length;
  const ballpark = s.results.filter(r => r.grade === "ballpark").length;
  const off = s.results.filter(r => r.grade === "off").length;
  
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="ahd"><div class="h-title">Drill complete</div></div>
      
      <div style="display:flex;gap:8px;margin-bottom:16px;text-align:center">
        <div style="flex:1;background:var(--surface-2);border-radius:8px;padding:12px">
          <div style="font-size:24px;font-weight:700;color:var(--ok)">${spotOn}</div>
          <div style="font-size:12px;color:var(--muted)">Spot on</div>
        </div>
        <div style="flex:1;background:var(--surface-2);border-radius:8px;padding:12px">
          <div style="font-size:24px;font-weight:700;color:var(--warn)">${ballpark}</div>
          <div style="font-size:12px;color:var(--muted)">Ballpark</div>
        </div>
        <div style="flex:1;background:var(--surface-2);border-radius:8px;padding:12px">
          <div style="font-size:24px;font-weight:700;color:var(--no)">${off}</div>
          <div style="font-size:12px;color:var(--muted)">Off</div>
        </div>
      </div>
      
      <div class="listhd"><span class="t-label">Habit to fix</span></div>
      <div class="block tint"><div style="margin-top:6px">${esc(summary.habit_to_fix)}</div></div>
      
      <button class="btn btn-primary btn-block" data-action="return-focus" style="margin-top:16px">Done</button>
    </div>`);
}

