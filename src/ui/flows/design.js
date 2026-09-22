
import { XBTN, app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { isDue } from "../../../shared/srs.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { assembleAnswer, MAX_DESIGN_CHARS, reviewGradeForDesign } from "../../storage/design.js";

export let designState = null; // { sessionId, topic, cards, brief, grading, curveball, curveballGrading, step, token,  sections }

export async function startDesignDrill(sessionId) {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");
  const session = sessions.find((s) => s.id === sessionId);
  
  designState = {
    sessionId,
    topic: String(session?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map(c => ({ front: c.front, back: c.back })),
    brief: null,
    grading: null,
    curveballCount: 0,
    curveballs: [],
    step: "generating_brief",
    sections: { requirements: "", estimates: "", api: "", dataModel: "", components: "", bottlenecks: "" }
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintDesignLoader("Writing a brief...");
  requestDesignBrief();
}

export function setDesignState(v) { designState = v; }

function paintDesignLoader(msg) {
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">System design drill</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>
        <span style="font-size:13px;color:var(--muted)">${esc(msg)}</span>
      </div>
    </div>`);
}

async function requestDesignBrief() {
  const s = designState;
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_TASK", concept: s.topic, reference: s.cards });
    if (designState !== s || s.token !== token) return;
    s.brief = res.brief;
    s.step = "answering_brief";
    paintDesignForm();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    (/** @type {HTMLElement} */ (document.querySelector(".rev-top .xbtn")))?.click();
  }
}

const SECTION_LABELS = {
  requirements: "Requirements", estimates: "Estimates", api: "API", 
  dataModel: "Data model", components: "Components & flow", bottlenecks: "Bottlenecks & trade-offs"
};

function paintDesignForm() {
  const s = designState;
  const chars = assembleAnswer(s.sections).length;
  
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">Design brief</div>
      <p class="teach-lead" style="margin-bottom:12px">${esc(s.brief)}</p>
      
      <div class="t-label" style="margin-top:20px;margin-bottom:8px">Your design</div>
      <div class="design-sections" style="display:flex;flex-direction:column;gap:8px">
        ${Object.keys(SECTION_LABELS).map(k => `
          <details class="design-section" style="background:var(--surface-2);border-radius:8px;padding:8px">
            <summary style="font-weight:600;font-size:14px;cursor:pointer;user-select:none;outline:none">${esc(SECTION_LABELS[k])}</summary>
            <textarea data-key="${k}" class="sa-input" rows="3" style="margin-top:8px;background:var(--surface);width:100%;box-sizing:border-box" placeholder="Optional">${esc(s.sections[k])}</textarea>
          </details>
        `).join("")}
      </div>
      <div style="font-size:12px;color:var(--muted);text-align:right;margin-top:8px" id="designCharCount">${chars} / ${MAX_DESIGN_CHARS}</div>
      <button class="btn btn-primary btn-block" data-action="design-submit" style="margin-top:16px">Submit design</button>
    </div>`);
    
  app.querySelectorAll("textarea").forEach(ta => {
    ta.addEventListener("input", (e) => {
      s.sections[ta.dataset.key] = ta.value;
      const len = assembleAnswer(s.sections).length;
      const count = document.getElementById("designCharCount");
      if (count) {
        count.textContent = `${len} / ${MAX_DESIGN_CHARS}`;
        count.style.color = len > MAX_DESIGN_CHARS ? "var(--no)" : "var(--muted)";
      }
    });
  });
}

export async function submitDesign() {
  const s = designState;
  const answer = assembleAnswer(s.sections);
  if (!answer) return toast("Write at least one section.");
  if (answer.length > MAX_DESIGN_CHARS) return toast("Your answer is too long.");
  
  s.step = "grading_brief";
  paintDesignLoader("Reviewing your design...");
  
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_GRADE", task: s.brief, answer });
    if (designState !== s || s.token !== token) return;
    s.grading = res;
    s.step = "feedback";
    await recordDesignActivity(s);
    paintDesignFeedback();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    s.step = "answering_brief";
    paintDesignForm();
  }
}

async function recordDesignActivity(s) {
  const writes = [bumpActivity(1)];
  writes.push(appendReviewLog({
    kind: "teach", stability: null, difficulty: null,
    id: uid(), cardId: "", sessionId: s.sessionId,
    grade: 3, prevInterval: 0, newInterval: 0, reviewedAt: new Date().toISOString(),
  }));
  await Promise.all(writes);
}

function paintDesignFeedback() {
  const s = designState;
  const g = s.curveballs.length ? s.curveballs[s.curveballs.length - 1].grading : s.grading;
  
  const statusColor = (st) => st === "covered" || st === "strong" ? "ok" : st === "partial" ? "warn" : "no";
  const statusLabel = (st) => st === "covered" ? "Covered" : st === "partial" ? "Partial" : "Missed";

  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="ahd"><div class="h-title">Feedback</div></div>
      
      <div class="listhd"><span class="t-label">Rubric</span></div>
      <div class="block" style="padding:6px 14px">
        ${g.rubric_evaluation.map(r => `
          <div class="idea-row">
            <div class="idea-top"><span class="name">${esc(r.point)}</span><span class="idea-chip ${statusColor(r.status)}">${esc(statusLabel(r.status))}</span></div>
            ${r.note ? `<div class="idea-note">${esc(r.note)}</div>` : ""}
          </div>
        `).join("")}
      </div>
      
      <div class="listhd"><span class="t-label">Next time</span></div>
      <div class="block tint"><div style="margin-top:6px">${esc(g.next_time)}</div></div>
      
      ${s.curveballCount < 2 ? `
        <button class="btn btn-ghost btn-block" data-action="design-curveball" style="margin-top:16px">Face a curveball</button>
      ` : ""}
      <button class="btn btn-primary btn-block" data-action="return-focus" style="margin-top:8px">Done</button>
    </div>`);
}

export async function requestDesignCurveball() {
  const s = designState;
  const answer = assembleAnswer(s.sections);
  s.step = "generating_curveball";
  paintDesignLoader("Throwing a curveball...");
  
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_CURVEBALL", task: s.brief, answer });
    if (designState !== s || s.token !== token) return;
    s.curveballs.push({ question: res.curveball, answer: "", grading: null });
    s.curveballCount++;
    s.step = "answering_curveball";
    paintDesignCurveballForm();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    s.step = "feedback";
    paintDesignFeedback();
  }
}

function paintDesignCurveballForm() {
  const s = designState;
  const current = s.curveballs[s.curveballs.length - 1];
  
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">Curveball</div>
      <p class="teach-lead" style="margin-bottom:12px">${esc(current.question)}</p>
      
      <textarea id="curveballInput" class="sa-input" rows="5" placeholder="How does your design adapt?" style="width:100%;box-sizing:border-box">${esc(current.answer)}</textarea>
      <button class="btn btn-primary btn-block" data-action="design-submit-curveball" style="margin-top:16px">Submit adaptation</button>
    </div>`);
}

export async function submitDesignCurveball() {
  const s = designState;
  const current = s.curveballs[s.curveballs.length - 1];
  const box = document.getElementById("curveballInput");
  const answer = ((/** @type {HTMLTextAreaElement|null} */ (box))?.value || "").trim();
  if (!answer) return toast("Write an adaptation first.");
  
  current.answer = answer;
  s.step = "grading_curveball";
  paintDesignLoader("Reviewing your adaptation...");
  
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_GRADE", task: current.question, answer: answer });
    if (designState !== s || s.token !== token) return;
    current.grading = res;
    s.step = "feedback";
    await recordDesignActivity(s);
    paintDesignFeedback();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    s.step = "answering_curveball";
    paintDesignCurveballForm();
  }
}

