import { XBTN, app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { isDue } from "../../../shared/srs.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import {
  STUCK_TEXT, canFinish, coverageCount, mergeCoverage, personaOptions, pickPersona, reviewGradeFor, selectTeachCards, PERSONAS, personaInfo,
} from "../../storage/teach.js";

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
    // The worried-patient persona is only offered on a Medicine set.
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

function progressBar() {
  const { covered, total } = coverageCount(teachState.coverage, teachState.cards);
  return `<div class="rev-top">${XBTN}<div class="bar"><i style="width:${esc(Math.round((covered / total) * 100))}%"></i></div>
    <span class="rev-count tnum">${esc(covered)} / ${esc(total)}</span></div>`;
}

export function paintTeachIntro() {
  const { topic, cards, persona } = teachState;
  const option = (id, label) =>
    `<button class="qlen${persona === id ? " on" : ""}" role="radio" aria-checked="${persona === id}" data-action="teach-persona" data-persona="${id}">${esc(label)}</button>`;
  setHTML(app, `
    ${progressBar()}
    <div class="rev-body teach">
      <div class="t-label">Teach it back</div>
      <p class="teach-lead">Explain <b>${esc(topic)}</b> to someone who has never heard of it. They'll ask questions, and if you get stuck, ask for a hint.</p>
      <div class="t-label" style="margin-top:14px">Ideas to get across</div>
      <ul class="teach-ideas">${cards.map((c) => `<li>${esc(c.front)}</li>`).join("")}</ul>
      <div class="t-label" style="margin-top:14px">Who are you teaching?</div>
      <div class="qlens" role="radiogroup" aria-label="Who are you teaching?">
        ${personaOptions(teachState.isMedicine).map((id) => option(id, PERSONAS[id].emoji + " " + PERSONAS[id].option)).join("")}
      </div>
      <textarea id="teachInput" class="sa-input" rows="6" placeholder="Start explaining in your own words…"></textarea>
      <button class="btn btn-primary btn-block" data-action="teach-send">Start teaching</button>
    </div>`);
  wireInput();
}

export function setTeachPersona(persona) {
  if (!teachState || teachState.messages.length) return;
  teachState.persona = pickPersona(persona, teachState.isMedicine);
  app.querySelectorAll('[data-action="teach-persona"]').forEach((el) => {
    const b = /** @type {HTMLElement} */ (el);
    const on = b.dataset.persona === teachState.persona;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  });
}

const bubble = (m) =>
  `<div class="bubble ${m.role === "learner" ? "learner" : "student"}${m.kind === "hint" ? " hint" : ""}">${
    m.kind === "hint" ? `<span class="bubble-tag">Hint</span>` : ""
  }${esc(m.text)}</div>`;

export function paintTeachChat() {
  const { topic, messages, busy, done, persona } = teachState;
  const off = busy ? " disabled" : "";
  const info = personaInfo(persona);
  const capitalizedShort = info.short.charAt(0).toUpperCase() + info.short.slice(1);
  setHTML(app, `
    ${progressBar()}
    <div class="rev-body teach">
      <div class="teach-head">
        <div class="t-label teach-topic">Teaching ${esc(topic)}</div>
        <span class="teach-persona-chip tag" role="note" aria-label="You're teaching ${esc(info.long)}" title="Chosen at the start. To teach someone else, finish and start again.">${info.emoji} ${esc(capitalizedShort)}</span>
      </div>
      <div class="teach-thread" id="teachThread" aria-live="polite">
        ${messages.map(bubble).join("")}
        ${busy ? `<div class="bubble student typing" aria-label="The ${esc(info.short)} is thinking"><span></span><span></span><span></span></div>` : ""}
      </div>
      <textarea id="teachInput" class="sa-input" rows="3" placeholder="Answer the ${esc(info.short)}, or keep explaining…"${off}></textarea>
      <div class="teach-actions">
        <button class="btn btn-ghost" data-action="teach-hint"${off}>I'm stuck</button>
        <button class="btn btn-primary" data-action="teach-send"${off}>Send</button>
      </div>
      <button class="btn btn-ghost btn-block" data-action="teach-finish"${busy || !(done || canFinish(messages)) ? " disabled" : ""}>Finish and see how I did</button>
    </div>`);
  const thread = document.getElementById("teachThread");
  if (thread) thread.scrollTop = thread.scrollHeight;
  wireInput();
}

/** Enter sends; Shift+Enter makes a new line. */
function wireInput() {
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("teachInput"));
  if (!box) return;
  box.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    sendTeach(false);
  });
  if (!box.disabled) box.focus();
}

export async function sendTeach(wantHint = false) {
  const s = teachState;
  if (!s || s.busy) return;
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("teachInput"));
  const typed = (box?.value || "").trim();
  const text = typed || (wantHint ? STUCK_TEXT : "");
  if (!text) return toast("Write something first.");

  s.messages.push({ role: "learner", text: text.slice(0, 2000) });
  s.busy = true;
  paintTeachChat();
  // A token per request: a slow reply must not paint over a session the learner
  // restarted or left.
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
    s.messages.pop(); // give them back what they wrote so they can resend it
    s.busy = false;
    if (s.messages.length) paintTeachChat();
    else paintTeachIntro();
    const again = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("teachInput"));
    if (again && text !== STUCK_TEXT) again.value = text;
    toast(e.message);
  }
}

export async function finishTeach() {
  const s = teachState;
  if (!s || s.busy) return;
  if (!s.done && !canFinish(s.messages)) return toast("Teach a little more first.");
  s.busy = true;
  setHTML(app, `
    ${progressBar()}
    <div class="rev-body teach">
      <div class="t-label">Teach it back</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>
        <span style="font-size:13px;color:var(--muted)">Looking at how you taught ${esc(s.topic)} to ${esc(personaInfo(s.persona).long)}…</span>
      </div>
    </div>`);
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
      // "teach" rows are practice evidence, not scheduled reviews: they must not
      // reschedule the card. Match the shape coding.js logs.
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
        <div style="font-size:12px;color:var(--muted);font-weight:normal">${esc(teachState.topic)} · to ${esc(personaInfo(teachState.persona).long)}</div>
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
