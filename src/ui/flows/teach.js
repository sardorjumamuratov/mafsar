import { app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { isDue } from "../../../shared/srs.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import {
  STUCK_TEXT, canFinish, coverageCount, mergeCoverage, personaOptions, pickPersona, reviewGradeFor, selectTeachCards, PERSONAS, personaInfo,
} from "../../storage/teach.js";
import { paintShell } from "./shell.js";

// Teach it back (the Feynman technique). One sitting's state; goReturn() nulls it.
// { sessionId, topic, cards, persona, messages, coverage, busy, done, token, evaluation }
export let teachState = null;
export function setTeachState(v) { teachState = v; }

export async function startTeach(sessionId) {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = selectTeachCards(set?.flashcards, isDue);
  if (!cards.length) return toast("This set has no cards to teach from yet.");
  const session = sessions.find((s) => s.id === sessionId);
  teachState = {
    sessionId,
    isMedicine: (set?.mode || "") === "medicine",
    topic: String(session?.title || set?.title || "this topic").slice(0, 200),
    cards,
    persona: "child",
    messages: [],
    coverage: {},
    busy: false,
    done: false,
    token: null,
    evaluation: null,
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintTeachIntro();
}

export function paintTeachIntro() {
  const { topic, cards, persona } = teachState;
  
  const ideasHTML = cards.map(c => `<div style="height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--border-control);font-size:13px;color:var(--text-secondary);display:flex;align-items:center">${esc(c.front)}</div>`).join("");
  
  // No emoji
  const childLabel = "A curious 12-year-old";
  const beginnerLabel = "A complete beginner";
  
  const body = `
    <div style="margin-top:8px;font-size:15px;line-height:1.5;color:var(--text-muted)">They'll ask follow-up questions. Ask for a hint whenever you're stuck.</div>
    <div style="margin-top:24px;font-size:13px;font-weight:600;color:var(--text-muted)">Ideas to cover</div>
    <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${ideasHTML}</div>
    
    <div style="margin-top:24px;font-size:13px;font-weight:600;color:var(--text-muted)">Who are you teaching?</div>
    <div style="margin-top:10px;height:44px;padding:3px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card);display:flex;gap:3px">
      ${personaOptions(teachState.isMedicine).map(id => {
        const info = PERSONAS[id];
        const isSelected = persona === id;
        return \`<button data-action="teach-persona" data-persona="\${id}" style="flex:1;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;background:\${isSelected?'var(--bg-segment-active)':'transparent'};color:\${isSelected?'var(--text-primary)':'var(--text-faint)'}">\${esc(info.option)}</button>\`;
      }).join("")}
    </div>
    
    <textarea id="teachStartInput" style="margin-top:24px;min-height:120px;padding:12px 14px;border-radius:12px;border:0;background:var(--bg-surface);box-shadow:inset 0 0 0 1px var(--border-control);font-size:15px;line-height:1.5;resize:none;width:100%" placeholder="Start explaining in your own words" oninput="document.getElementById('teachStartBtn').disabled = !this.value.trim(); this.style.boxShadow = 'inset 0 0 0 1px var(--accent)'" onblur="this.style.boxShadow = 'inset 0 0 0 1px var(--border-control)'" onfocus="this.style.boxShadow = 'inset 0 0 0 1px var(--accent)'"></textarea>
  `;
  
  const dock = `
    <button id="teachStartBtn" data-action="teach-start-send" disabled style="width:100%;height:60px;border-radius:14px;background:var(--accent);color:var(--accent-on);font-size:16px;font-weight:650;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center">Start teaching</button>
  `;
  
  setHTML(app, paintShell({
    mode: "Teach it back",
    prompt: `Explain ${topic} to someone who's never heard of it`,
    progress: 33, // 2/6 example
    counter: "0 / 0", // wait, will override counter with ideas covered
    body,
    dock,
    promptClass: "prompt-teach"
  }));
}

export function setTeachPersona(persona) {
  if (!teachState || teachState.messages.length) return;
  teachState.persona = pickPersona(persona, teachState.isMedicine);
  paintTeachIntro(); // Repaint to show the selection
}

// Intercept "Start teaching" since we put the input in paintTeachIntro
export function teachStartSend() {
  const box = document.getElementById("teachStartInput");
  const val = /** @type {HTMLTextAreaElement} */ (box)?.value.trim();
  if (val) sendTeach(false, val);
}

function bubble(m, info) {
  if (m.role === "learner") {
    return `
      <div style="align-self:flex-start;max-width:85%">
        <div class="teach-persona-chip tag" role="note">${esc(info.short)}</div>
        <div style="padding:10px 14px;border-radius:14px 14px 14px 4px;background:var(--bg-surface);border:1px solid var(--border-card);color:var(--text-secondary);font-size:15px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.text)}</div>
      </div>
    `;
  } else {
    // Student (User)
    return `
      <div style="align-self:flex-end;max-width:85%;padding:10px 14px;border-radius:14px 14px 4px 14px;background:var(--bg-surface2);font-size:15px;line-height:1.5;color:var(--text-primary);white-space:pre-wrap;overflow-wrap:anywhere">
        ${esc(m.text)}
      </div>
    `;
  }
}

export function paintTeachChat() {
  const { topic, messages, busy, done, persona, cards, coverage } = teachState;
  const off = busy ? " disabled" : "";
  const info = personaInfo(persona);
  
  const { covered, total } = coverageCount(coverage, cards);
  
  const ideasStrip = cards.map(c => {
    const isCov = coverage[c.id];
    if (isCov) {
      return `<div style="height:28px;padding:0 9px;border-radius:8px;border:1px solid var(--accent-tint-border);background:var(--accent-tint-bg);color:var(--accent-text);font-size:13px;display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" stroke-width="3" style="stroke:currentColor;fill:none"><polyline points="20 6 9 17 4 12"></polyline></svg>${esc(c.front)}</div>`;
    }
    return `<div style="height:28px;padding:0 9px;border-radius:8px;border:1px solid var(--border-control);background:transparent;color:var(--text-muted);font-size:13px;display:flex;align-items:center">${esc(c.front)}</div>`;
  }).join("");
  
  // Custom shell rendering for the chat since it breaks the standard shell body
  setHTML(app, `
    <div style="background:var(--bg-app);display:flex;flex-direction:column;height:100%">
      <div style="height:56px;display:flex;align-items:center;gap:12px;padding:0 16px 0 8px;flex-shrink:0">
        <button data-action="return-focus" aria-label="End session" style="width:40px;height:40px;border-radius:12px;background:transparent;border:none;color:var(--text-muted);display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer"><svg style="width:20px;height:20px;stroke-width:2;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        <div style="flex:1;height:4px;border-radius:2px;background:var(--border-card);overflow:hidden"><div style="height:100%;background:var(--accent);width:${Math.max(2, Math.round((covered / total) * 100))}%"></div></div>
        <div style="min-width:44px;text-align:right;font-size:13px;font-weight:600;color:var(--text-muted);font-variant-numeric:tabular-nums">${covered} / ${total}</div>
      </div>
      
      <div style="padding:4px 24px 14px;border-bottom:1px solid var(--border-divider);display:flex;flex-wrap:wrap;gap:4px">
        ${ideasStrip}
      </div>
      
      <div id="teachThread" aria-live="polite" style="flex:1;padding:20px 24px;display:flex;flex-direction:column;gap:16px;overflow-y:auto">
        ${messages.map(m => bubble(m, info)).join("")}
        ${busy ? `<div style="align-self:flex-start;max-width:85%;padding:10px 14px;border-radius:14px 14px 14px 4px;background:var(--bg-surface);border:1px solid var(--border-card);color:var(--text-secondary);font-size:15px;line-height:1.5">Thinking…</div>` : ""}
      </div>
      
      <div style="flex-shrink:0;padding:12px 16px 24px;border-top:1px solid var(--border-divider);display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:flex-end;gap:8px">
          <textarea id="teachInput" style="flex:1;min-height:48px;padding:13px 14px;border-radius:12px;border:0;background:var(--bg-surface);box-shadow:inset 0 0 0 1px var(--border-control);font-size:15px;line-height:1.5;resize:none;overflow:hidden" placeholder="Reply"${off}></textarea>
          <button data-action="teach-send" style="width:48px;height:48px;border-radius:12px;background:var(--accent);color:var(--accent-on);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer"${off} aria-label="Send">
            <svg width="20" height="20" viewBox="0 0 24 24" style="stroke-width:2;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
          </button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <button data-action="teach-hint" style="height:32px;background:transparent;border:none;padding:0;display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--accent-text);cursor:pointer"${off}>
            <svg width="16" height="16" viewBox="0 0 24 24" style="stroke-width:2;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M12 2a7 7 0 0 0-7 7c0 2 1.5 4 3 5s1 3 1 3h6s0-2 1-3 3-3 3-5a7 7 0 0 0-7-7z"></path></svg>
            Get a hint
          </button>
          <button data-action="teach-finish" style="height:32px;background:transparent;border:none;padding:0;font-size:14px;font-weight:600;color:var(--text-muted);cursor:pointer"${busy || !(done || canFinish(messages)) ? " disabled" : ""}>
            Finish and review
          </button>
        </div>
      </div>
    </div>
  `);
  
  const thread = document.getElementById("teachThread");
  if (thread) thread.scrollTop = thread.scrollHeight;
  wireInput();
}

function wireInput() {
  const box = document.getElementById("teachInput");
  if (!box) return;
  box.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    sendTeach(false);
  });
  if (!(/** @type {HTMLTextAreaElement} */ (box)).disabled) box.focus();
}

export async function sendTeach(wantHint = false, initialText = "") {
  const s = teachState;
  if (!s || s.busy) return;
  const box = document.getElementById("teachInput");
  const typed = initialText || (/** @type {HTMLTextAreaElement} */ (box)?.value || "").trim();
  const text = typed || (wantHint ? STUCK_TEXT : "");
  if (!text) return toast("Write something first.");

  s.messages.push({ role: "learner", text: text.slice(0, 2000) });
  s.busy = true;
  paintTeachChat();
  
  const token = (s.token = {});
  try {
    const r = await send({ type: "TEACH_TURN", topic: s.topic, persona: s.persona, cards: s.cards, messages: s.messages, wantHint });
    if (teachState !== s || s.token !== token) return;
    const t = r.turn;
    s.messages.push({ role: "student", text: t.reply, kind: t.kind, focusCardId: t.focusCardId });
    s.coverage = mergeCoverage(s.coverage, t.coverage);
    s.busy = false;
    s.done = !!t.done;
    if (s.done) return finishTeach();
    paintTeachChat();
  } catch (e) {
    if (teachState !== s || s.token !== token) return;
    s.messages.pop(); 
    s.busy = false;
    if (s.messages.length) paintTeachChat();
    else paintTeachIntro();
    const again = document.getElementById(s.messages.length ? "teachInput" : "teachStartInput");
    if (again && text !== STUCK_TEXT) /** @type {HTMLTextAreaElement} */ (again).value = text;
    toast(e.message);
  }
}

export async function finishTeach() {
  const s = teachState;
  if (!s || s.busy) return;
  if (!s.done && !canFinish(s.messages)) return toast("Teach a little more first.");
  s.busy = true;
  // Use paintShell for loading
  setHTML(app, paintShell({
    mode: "Teach it back",
    prompt: "",
    progress: 100,
    counter: "",
    body: `
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border-control);border-top-color:var(--accent)"></span>
        <span style="font-size:13px;color:var(--text-muted)">Looking at how you taught ${esc(s.topic)} to ${esc(personaInfo(s.persona).long)}…</span>
      </div>
    `,
    dock: ""
  }));
  const token = (s.token = {});
  try {
    const r = await send({ type: "TEACH_EVALUATE", topic: s.topic, persona: s.persona, cards: s.cards, messages: s.messages });
    if (teachState !== s || s.token !== token) return;
    s.evaluation = r.evaluation;
    s.busy = false;
    await recordTeaching(s);
    paintTeachResult();
  } catch (e) {
    if (teachState !== s || s.token !== token) return;
    s.busy = false;
    paintTeachChat();
    toast(e.message);
  }
}

async function recordTeaching(s) {
  const reviewedAt = new Date().toISOString();
  const { studySets } = await bundle();
  const byId = new Map((setFor(s.sessionId, studySets)?.flashcards || []).map((c) => [c.id, c]));
  const writes = [bumpActivity(1)];
  for (const idea of s.evaluation.ideas) {
    const grade = reviewGradeFor(idea.status);
    if (grade === null) continue;
    const card = byId.get(idea.cardId);
    writes.push(appendReviewLog({
      kind: "teach", stability: card?.stability, difficulty: card?.difficulty,
      id: uid(), cardId: idea.cardId, sessionId: s.sessionId,
      grade, prevInterval: 0, newInterval: 0, reviewedAt,
    }));
  }
  await Promise.all(writes);
}

const STATUS = {
  taught: ["Taught", "ok"],
  taught_with_hints: ["Taught with hints", "warn"],
  incorrect: ["Needs fixing", "no"],
  not_covered: ["Not covered", ""],
};

export function paintTeachResult() {
  const ev = teachState.evaluation;
  const u = ev.scores.understanding;
  const row = (i) => {
    const [label, cls] = STATUS[i.status] || STATUS.not_covered;
    return `<div class="idea-row"><div class="idea-top"><span class="name">${esc(i.front)}</span><span class="idea-chip ${cls}">${esc(label)}</span></div>${
      i.note ? `<div class="idea-note">${esc(i.note)}</div>` : ""
    }</div>`;
  };
  setHTML(app, `
    <div class="view teach-result">
      <div class="ahd">
        <div class="h-title" style="margin-bottom:2px">How you taught</div>
        <div style="font-size:12px;color:var(--text-muted);font-weight:normal">${esc(teachState.topic)} — to ${esc(personaInfo(teachState.persona).long)}</div>
      </div>
      <div class="block teach-score">
        <div class="score tnum ${u >= 70 ? "ok" : "no"}">${esc(u)}</div>
        <div><b>Understanding</b><div class="feedback">${esc(ev.strengths)}</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="v tnum">${esc(ev.scores.accuracy)}</div><div class="k">Accuracy</div></div>
        <div class="stat"><div class="v tnum">${esc(ev.scores.completeness)}</div><div class="k">Completeness</div></div>
        <div class="stat"><div class="v tnum">${esc(ev.scores.simplicity)}</div><div class="k">Simplicity</div></div>
          ${teachState.persona === "patient" ? `<div class="stat"><div class="v tnum">${esc(ev.scores.reassurance || 0)}</div><div class="k">Reassurance</div></div>` : ""}
      </div>
      <div class="listhd"><span class="t-label">Ideas</span></div>
      <div class="block" style="padding:6px 14px">${ev.ideas.map(row).join("")}</div>
      ${ev.jargon.length ? `<div class="listhd"><span class="t-label">Words to explain next time</span></div>
        <div class="teach-jargon">${ev.jargon.map((j) => `<span class="tag">${esc(j)}</span>`).join("")}</div>` : ""}
      ${ev.improve ? `<div class="block tint"><div class="t-label">Next step</div><div style="margin-top:6px">${esc(ev.improve)}</div></div>` : ""}
      ${ev.modelExplanation ? `<div class="block"><div class="t-label">A simple way to say it</div><div class="teach-model">${esc(ev.modelExplanation)}</div></div>` : ""}
      <button class="btn btn-primary btn-block" data-action="return-focus">Done</button>
    </div>`);
}

// aria-label="End session" needed for tests
