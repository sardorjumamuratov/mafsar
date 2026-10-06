import { bundle, esc, send, setFor, toast } from "../core.js";
import { isDue } from "../../../shared/srs.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import {
  STUCK_TEXT, canFinish, coverageCount, mergeCoverage, personaOptions, pickPersona, reviewGradeFor, selectTeachCards, personaInfo,
} from "../../storage/teach.js";
import { bindField, focusEnd, icon, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";

// Teach it back (the Feynman technique). One sitting's state; goReturn() nulls it.
// { sessionId, topic, cards, persona, messages, coverage, busy, done, token, evaluation, draft }
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
    draft: "",
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintTeachIntro();
}

export function paintTeachIntro() {
  const { topic, cards, persona, draft } = teachState;
  paintShell({
    mode: "Teach it back",
    prompt: `Explain ${topic} to someone who's never heard of it`,
    promptClass: "teach",
    progress: 0,
    counter: `0 / ${cards.length}`,
    body: `
      <div class="st-sub">They'll ask follow-up questions. Ask for a hint whenever you're stuck.</div>
      <div class="st-label st-mt24">Ideas to cover</div>
      <div class="st-chips st-mt10">${cards.map((c) => `<span class="st-chip">${esc(c.front)}</span>`).join("")}</div>
      <div class="st-label st-mt24">Who are you teaching?</div>
      <div class="st-seg st-mt10" role="group" aria-label="Who are you teaching?">
        ${personaOptions(teachState.isMedicine).map((id) => `<button type="button" data-action="teach-persona" data-persona="${id}" class="${persona === id ? "on" : ""}" aria-pressed="${persona === id}">${esc(personaInfo(id).option)}</button>`).join("")}
      </div>
      <textarea id="teachStartInput" class="st-field h120 st-mt24" placeholder="Start explaining in your own words" aria-label="Your explanation">${esc(draft)}</textarea>`,
    dock: primaryBtn("teach-start-send", "Start teaching", 'id="teachStartBtn" disabled'),
  });
  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("teachStartInput"));
  bindField(box, {
    btn: /** @type {HTMLButtonElement} */ (document.getElementById("teachStartBtn")),
    onChange: (v) => { teachState.draft = v; },
    onSubmit: () => teachStartSend(),
  });
}

export function setTeachPersona(persona) {
  if (!teachState || teachState.messages.length) return;
  teachState.persona = pickPersona(persona, teachState.isMedicine);
  paintTeachIntro(); // the draft is kept in state, so the repaint doesn't lose it
}

export function teachStartSend() {
  const box = document.getElementById("teachStartInput");
  const val = /** @type {HTMLTextAreaElement} */ (box)?.value.trim();
  if (val) sendTeach(false, val);
}

const who = (info) => `<div class="who" role="note">${esc(info.short.charAt(0).toUpperCase() + info.short.slice(1))}</div>`;

// "learner" is the person teaching (the user); "student" is the AI playing the audience.
function bubble(m, info) {
  if (m.role === "learner") return `<div class="st-msg me">${esc(m.text)}</div>`;
  return `<div class="st-msg them">${who(info)}<div class="bub">${esc(m.text)}</div></div>`;
}

export function paintTeachChat() {
  const { messages, busy, done, persona, cards, coverage } = teachState;
  const off = busy ? " disabled" : "";
  const info = personaInfo(persona);
  const { covered, total } = coverageCount(coverage, cards);

  const ideas = cards.map((c) => coverage[c.id] === "covered"
    ? `<span class="st-chip sm cov">${icon("check", 12, 3)}${esc(c.front)}</span>`
    : `<span class="st-chip sm">${esc(c.front)}</span>`).join("");

  paintShell({
    progress: total ? (covered / total) * 100 : 0,
    counter: `${covered} / ${total}`,
    hasProgress: true,
    strip: `<div class="st-ideas">${ideas}</div>`,
    thread: `${messages.map((m) => bubble(m, info)).join("")}${busy ? `<div class="st-msg them">${who(info)}<div class="bub" role="status" aria-label="The ${esc(info.short)} is replying">Thinking…</div></div>` : ""}`,
    dockClass: "col",
    dock: `
      <div class="st-compose">
        <textarea id="teachInput" class="st-field h48" rows="1" placeholder="Reply" aria-label="Your reply"${off}></textarea>
        <button type="button" class="st-send" data-action="teach-send" aria-label="Send"${off}>${icon("arrowUp", 20)}</button>
      </div>
      <div class="st-actions">
        <button type="button" class="st-link bar" data-action="teach-hint"${off}>${icon("bulb", 16)}Get a hint</button>
        <button type="button" class="st-link bar quiet" data-action="teach-finish"${busy || !(done || canFinish(messages)) ? " disabled" : ""}>Finish and review</button>
      </div>`,
  });

  const thread = document.getElementById("stThread");
  if (thread) thread.scrollTop = thread.scrollHeight;
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("teachInput"));
  if (!box) return;
  bindField(box);
  // Enter sends, Shift+Enter is a newline.
  box.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    sendTeach(false);
  });
  if (!box.disabled) focusEnd(box);
}

export async function sendTeach(wantHint = false, initialText = "") {
  const s = teachState;
  if (!s || s.busy) return;
  const box = document.getElementById("teachInput");
  const typed = initialText || (/** @type {HTMLTextAreaElement} */ (box)?.value || "").trim();
  const text = typed || (wantHint ? STUCK_TEXT : "");
  if (!text) return;

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
    if (again && text !== STUCK_TEXT) {
      /** @type {HTMLTextAreaElement} */ (again).value = text;
      again.dispatchEvent(new Event("input"));
    }
    toast(e.message);
  }
}

export async function finishTeach() {
  const s = teachState;
  if (!s || s.busy) return;
  if (!s.done && !canFinish(s.messages)) return toast("Teach a little more first.");
  s.busy = true;
  const { covered, total } = coverageCount(s.coverage, s.cards);
  paintShell({
    mode: "Teach it back",
    progress: total ? (covered / total) * 100 : 0,
    counter: `${covered} / ${total}`,
    body: waitRow(`Looking at how you taught ${s.topic} to ${personaInfo(s.persona).long}…`),
  });
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

// How an evaluated idea reads on the results screen: verdict kind and wording.
const STATUS = {
  taught: ["ok", "Taught"],
  taught_with_hints: ["part", "Taught with hints"],
  incorrect: ["no", "Needs fixing"],
  not_covered: ["skip", "Not covered"],
};

export function paintTeachResult() {
  const ev = teachState.evaluation;
  const info = personaInfo(teachState.persona);
  const { covered, total } = coverageCount(teachState.coverage, teachState.cards);
  const score = (name, value, note = "") => `<div class="st-li"><div class="st-labelrow"><span class="nm">${esc(name)}</span><span class="nm" style="font-variant-numeric:tabular-nums">${esc(value)}</span></div>${note ? `<div class="rs">${esc(note)}</div>` : ""}</div>`;
  const idea = (i) => {
    const [kind, label] = STATUS[i.status] || STATUS.not_covered;
    return `<div class="st-li roomy">${verdictRow(kind, i.front)}<div class="st-feedback">${esc(label)}${i.note ? ` · ${esc(i.note)}` : ""}</div></div>`;
  };
  paintShell({
    mode: "Teach it back",
    prompt: "How you taught",
    promptClass: "ask",
    progress: 100,
    counter: `${covered} / ${total}`,
    body: `
      <div class="st-sub">${esc(teachState.topic)}, to ${esc(info.long)}</div>
      <div class="st-label st-mt24">Scores</div>
      <div class="st-list">
        ${score("Understanding", ev.scores.understanding, ev.strengths)}
        ${score("Accuracy", ev.scores.accuracy)}
        ${score("Completeness", ev.scores.completeness)}
        ${score("Simplicity", ev.scores.simplicity)}
        ${teachState.persona === "patient" ? score("Reassurance", ev.scores.reassurance || 0) : ""}
      </div>
      <div class="st-label st-mt24">Ideas</div>
      <div class="st-list">${ev.ideas.map(idea).join("")}</div>
      ${ev.jargon.length ? `<div class="st-label st-mt24">Words to explain next time</div><div class="st-chips st-mt8">${ev.jargon.map((j) => `<span class="st-chip">${esc(j)}</span>`).join("")}</div>` : ""}
      ${ev.improve ? `<div class="st-label st-mt24">Next step</div><div class="st-text15 st-mt8">${esc(ev.improve)}</div>` : ""}
      ${ev.modelExplanation ? `<div class="st-label st-mt24">A simple way to say it</div><div class="st-text15 st-mt8">${esc(ev.modelExplanation)}</div>` : ""}`,
    dock: primaryBtn("return-focus", "Done"),
  });
}
