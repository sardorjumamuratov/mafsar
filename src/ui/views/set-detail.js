import { showChrome } from "../nav.js";
import { app, bundle, esc, insertHTMLBefore, nav, send, setFor, setHTML, sourceLabel, summarize, timeUntil, toast, topOfView } from "../core.js";
import { renderHome, shareOpenFor } from "../views/home.js";
import { examReadiness } from "../../storage/readiness.js";
import { isDue, masteryOf, review } from "../../storage/srs.js";
import { quizLengths } from ".././quiz-lengths.js";
import { shuffled, startQuiz } from "../flows/quiz.js";
import { shareBlockHtml } from "../share.js";
import { syncNow } from "../../sync/sync.js";
import { addCard, updateCard } from "../../storage/store.js";

// ================================================================ SET DETAIL
export let detail = null; // { session, studySet, summary, tab }
export let editingCardId = null;

export async function renderSetDetail(sessionId, tab = "cards") {
  showChrome(true);
  const { sessions, studySets } = await bundle();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return renderHome();
  const studySet = setFor(sessionId, studySets);
  detail = { session, studySet, tab };
  paintDetail();
  topOfView(); // new view (also covers tab switches); paintDetail repaints must not reset
}

export function paintDetail() {
  const { session, studySet, tab } = detail;
  const s = summarize(studySet);

  let body = "";
  if (!studySet) {
    body = `<div class="empty">
        <div class="big">✨</div>Flashcards are usually generated automatically when you save a chat.
        <div style="font-size:12.5px;color:var(--muted);margin-top:4px">If generation failed (offline, or you weren't signed in yet), try again:</div>
        <div style="margin-top:14px"><button class="btn btn-primary" data-action="make-set" data-id="${esc(session.id)}">Retry generation</button></div>
      </div>`;
  } else if (tab === "cards") {
    const exam = studySet.examDate
      ? examReadiness({ examDate: studySet.examDate, total: s.total, mastered: s.mastered, due: s.due })
      : null;
    const statusLabel = { "on-track": "On track", behind: "Behind", today: "Exam today", past: "Exam passed" }[exam?.status];
    const statusColor = exam?.status === "behind" || exam?.status === "today" ? "var(--warm)" : "var(--success)";

    // Exam dates are set on Home now (applied to picked sets); the set detail
    // only shows this set's readiness. Per-set input kept here for reference:
    // <input type="date" id="examDate" value="…" data-session="…" /> + Clear btn
    const examPanel = `
      ${
        exam
          ? `<div class="block exam-live">
               <div class="exam-head">
                 <span class="exam-ic">🎯</span>
                 <div class="exam-head-txt">
                   <div class="t-label">${exam.daysLeft < 0 ? "Exam passed" : exam.daysLeft === 0 ? "Exam today" : `${exam.daysLeft} day${exam.daysLeft === 1 ? "" : "s"} to go`}</div>
                   <div class="sub">${s.total} card${s.total === 1 ? "" : "s"} in this set</div>
                 </div>
                 <span class="pill ${statusColor === "var(--warm)" ? "warn" : "ok"}"
                       title="On track = the daily pace below is sustainable (20 cards/day or fewer). Behind = it isn't, or the exam is within 2 days with most of the set unmastered.">${statusLabel}</span>
               </div>
               <div class="bar ${s.progress === 100 ? "ok" : ""}"><i style="width:${s.progress}%"></i></div>
               <div class="readiness">
                 <div class="r-cell" title="Share of this set's cards you've mastered."><div class="v tnum">${s.progress}%</div><div class="k">mastered</div></div>
                 <div class="r-cell" title="Cards left to master ÷ days left."><div class="v tnum">${exam.status === "past" ? "—" : exam.dailyTarget}</div><div class="k">cards/day</div></div>
                 <div class="r-cell" title="Cards scheduled for review right now."><div class="v tnum">${s.due}</div><div class="k">due now</div></div>
               </div>
             </div>`
          : `<div class="help" style="margin:0">Set an exam date on Home and pick this set to get a countdown, daily target, and pre-exam resurfacing.</div>`
      }`;

    const editForm = editingCardId
      ? `<div class="block editcard">
           <div class="field"><label>Front</label><textarea id="editFront" rows="2">${esc(studySet.flashcards.find((c) => c.id === editingCardId)?.front || "")}</textarea></div>
           <div class="field"><label>Back</label><textarea id="editBack" rows="3">${esc(studySet.flashcards.find((c) => c.id === editingCardId)?.back || "")}</textarea></div>
           <div style="display:flex;gap:10px">
             <button class="btn btn-ghost" style="flex:1" data-action="edit-cancel">Cancel</button>
             <button class="btn btn-primary" style="flex:1" data-action="edit-save" data-id="${esc(editingCardId)}">Save card</button>
           </div>
         </div>`
      : "";

    body = `
      ${examPanel}
      <div class="mastery">
        <div class="m new"><div class="v tnum">${s.fresh}</div><div class="k">New</div></div>
        <div class="m learn"><div class="v tnum">${s.learning}</div><div class="k">Learning</div></div>
        <div class="m mast"><div class="v tnum">${s.mastered}</div><div class="k">Mastered</div></div>
      </div>
      <div class="help" style="margin:0">New → <b>Learning</b> after one correct review → <b>Mastered</b> once it is on a 6+ day interval (about a week of good grades). <i>Again</i> brings a card back later in this session and resets its schedule.</div>
      ${editForm}
      <div class="block" style="padding:6px 14px">
        ${
          studySet.flashcards.length
            ? studySet.flashcards
                .map(
                  (c) =>
                    `<div class="cardrow"><span class="sdot ${masteryOf(c)}"></span><span class="q">${esc(c.front)}</span><span class="due">${
                      isDue(c) ? "Due now" : timeUntil(c.dueDate)
                    }</span>
                     <span class="rowbtns">
                       <button class="iconbtn ic-xs" data-action="card-edit" data-id="${esc(c.id)}" aria-label="Edit"><svg class="ic" viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16l-1 4z"/></svg></button>
                       <button class="iconbtn ic-xs" data-action="card-del" data-id="${esc(c.id)}" aria-label="Delete"><svg class="ic" viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2m-8 0l1 13h8l1-13"/></svg></button>
                     </span></div>`
                )
                .join("")
            : '<div class="empty">No flashcards.</div>'
        }
      </div>
      ${studySet.mode === "coding" ? `<button class="btn btn-ghost btn-block" data-action="start-coding" data-id="${esc(session.id)}">⌨️ Coding exercises</button>` : ""}
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="add-card" data-id="${esc(session.id)}">＋ Card</button>
        <button class="btn btn-ghost" style="flex:1" data-action="start-typed" data-id="${esc(session.id)}">✍️ Type answers</button>
      </div>
      <!-- Export paused while import-from-Anki/Quizlet ships:
      <button class="btn btn-ghost btn-block" data-action="export-tsv" data-id="${esc(session.id)}">⇩ Export to Anki/CSV</button> -->`;
  } else if (tab === "quiz") {
    const available = studySet.quiz?.length || 0;
    // Quick is a fixed 5, Half is half the set rounded to the nearest 5,
    // Full is everything — capped by stored questions. See quiz-lengths.js.
    const lengths = quizLengths(s.total, available);

    body = available
      ? `<div class="block" style="text-align:center">
           <div style="font-weight:650">Multiple-choice quiz</div>
           <div style="font-size:12.5px;color:var(--muted);margin:6px 0 14px">Questions and options are shuffled every sitting.</div>
           ${
             lengths.length > 1
               ? `<div class="qlens" role="group" aria-label="Quiz length">
                    ${lengths
                      .map(
                        ([label, n], i) =>
                          `<button class="qlen${i === 0 ? " on" : ""}" data-action="quiz-len" data-n="${n}" aria-pressed="${i === 0}">
                             <span class="l">${label}</span><span class="n tnum">${n} question${n === 1 ? "" : "s"}</span>
                           </button>`
                      )
                      .join("")}
                  </div>`
               : ""
           }
           <button class="btn btn-primary btn-block" data-action="start-quiz" data-n="${lengths[0][1]}">Start quiz</button>
         </div>`
      : `<div class="empty">No quiz for this set.<br>${
          session.source === "quizlet"
            ? "Imported sets are flashcards only."
            : "Tap <b>↻ Regenerate</b> (top right) — fresh sets scale the quiz with the cards."
        }</div>`;
  } else {
    // summary
    const summ = studySet.summary;
    body = `
      <div class="block" style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="tag dot" style="color:var(--primary)">${esc(sourceLabel(session))}</span>
          <span class="tag">${studySet.flashcards.length} cards</span>
          ${session.messages?.length ? `<span class="tag">${session.messages.length} messages</span>` : ""}
        </div>
        ${
          summ
            ? `<div class="t-label" style="margin-top:6px">TL;DR</div>
               <div style="font-size:13px;line-height:1.6;color:var(--ink)">${esc(summ.summary)}</div>
               ${summ.keyPoints?.length ? `<div class="t-label" style="margin-top:10px">Key points</div>
               <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:var(--muted)">
                 ${summ.keyPoints.map((p) => `<li>${esc(p)}</li>`).join("")}
               </ul>` : ""}`
            : session.messages?.length
            ? `<div class="help" style="margin:0">Get an AI TL;DR and key takeaways from this conversation.</div>
               <button class="btn btn-primary btn-block" data-action="gen-summary" data-id="${esc(session.id)}">✨ Summarize conversation</button>`
            : `<div class="t-label" style="margin-top:6px">Key points</div>
               <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:var(--muted)">
                 ${(studySet.flashcards || []).slice(0, 8).map((c) => `<li>${esc(c.front)}</li>`).join("") || "<li>No cards</li>"}
               </ul>`
        }
      </div>
      <div class="block" style="display:flex;flex-direction:column;gap:9px">
        <div class="t-label">Study mode</div>
        <div class="modes" role="group" aria-label="Study mode">
          ${[
            ["general", "General", "Flashcards, quiz, written answers"],
            ["coding", "Coding", "Review swaps in small coding tasks"],
          ]
            .map(
              ([id, label, hint]) =>
                `<button class="modebtn${(studySet.mode || "general") === id ? " on" : ""}"
                   data-action="set-mode" data-id="${esc(session.id)}" data-mode="${id}"
                   aria-pressed="${(studySet.mode || "general") === id}">
                   <span class="l">${label}</span><span class="h">${hint}</span>
                 </button>`
            )
            .join("")}
        </div>
      </div>

`;
  }

  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <span style="flex:1"></span>
        ${
          studySet
            ? `<button class="btn btn-ghost btn-sm" data-action="set-share" data-id="${esc(session.id)}"
                 aria-expanded="${shareOpenFor === session.id}" aria-controls="shareOut">🔗 Share link</button>`
            : ""
        }
        ${
          studySet
            ? `<button class="linkbtn" data-action="make-set" data-id="${esc(session.id)}" title="Regenerate flashcards and quiz from the source — matching cards keep their review schedule">↻ Regenerate</button>`
            : `<span class="tag">${s.total} cards</span>`
        }
        ${studySet ? `<button class="iconbtn" data-action="delete-set" data-id="${esc(session.id)}" aria-label="Delete set"><svg class="ic" viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2m-8 0l1 13h8l1-13"/></svg></button>` : ""}
      </div>
      <div><div class="h-title" style="line-height:1.25">${esc(session.title || "Untitled")}</div>
        <div style="display:flex;gap:6px;margin-top:8px"><span class="tag dot" style="color:var(--primary)">${esc(sourceLabel(session))}</span></div>
      </div>
      <div id="shareOut">${shareOpenFor === session.id ? shareBlockHtml(studySet) : ""}</div>
      ${
        studySet
          ? `<div class="block" style="display:flex;flex-direction:column;gap:9px">
               <div class="prog-line" style="font-size:12px"><span style="font-weight:650;color:var(--ink)">${s.progress}% mastered</span><span>${s.mastered} of ${s.total}</span></div>
               <div class="bar ${s.progress === 100 ? "ok" : ""}"><i style="width:${s.progress}%"></i></div>
             </div>
             <div class="seg">
               <button data-action="tab" data-tab="cards" class="${tab === "cards" ? "on" : ""}">Flashcards</button>
               <button data-action="tab" data-tab="quiz" class="${tab === "quiz" ? "on" : ""}">Quiz</button>
               <button data-action="tab" data-tab="summary" class="${tab === "summary" ? "on" : ""}">Summary</button>
             </div>`
          : ""
      }
      ${body}
    </div>
    ${
      studySet && tab === "cards" && s.total
        ? `<div class="footer-cta"><button class="btn btn-primary btn-block" data-action="set-review" data-id="${esc(session.id)}">${
            s.due ? `Review ${s.due} due` : `Study ahead · ${s.total} cards`
          }</button></div>`
        : ""
    }`);
}

export async function makeSet(sessionId) {
  // Regenerating an existing set replaces its cards — warn first. Cards whose
  // fronts survive the regen keep their SM-2 schedule (service worker).
  const { studySets } = await bundle();
  if (setFor(sessionId, studySets)) {
    const okToReplace = confirm(
      "Regenerate this set from its source?\n\n" +
        "Existing cards and quiz questions are replaced. Cards that come back with the same front keep their review schedule; everything else starts fresh. Your exam date and summary are kept."
    );
    if (!okToReplace) return;
  }
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd"><div class="h-title"><span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>Generating…</div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="genstep done"><span class="tick"><svg class="ic ic-sm" viewBox="0 0 24 24" style="stroke:#fff"><path d="M5 12l4 4 10-10"/></svg></span>Conversation saved</div>
        <div class="genstep run"><span class="tick"></span>Writing flashcards</div>
        <div class="genstep wait"><span class="tick"></span>Building a quiz</div>
      </div>
      <div class="block"><div class="help">This can take 5–15 seconds.</div></div>
    </div>`);
  topOfView();
  try {
    await send({ type: "GENERATE_STUDY_SET", sessionId });
    toast("Your flashcards are ready");
    syncNow().catch(() => {}); // background sync — silent if offline/signed out
    renderSetDetail(sessionId, "cards");
  } catch (e) {
    toast(e.message);
    renderSetDetail(sessionId, "cards");
  }
}

export async function promptAddCard(sessionId) {
  editingCardId = null;
  detail.addingCard = true;
  paintAddCard();
}
export function paintAddCard() {
  const btn = app.querySelector('[data-action="add-card"]');
  const html = `<div class="block editcard">
      <div class="field"><label>Front</label><textarea id="newFront" rows="2" placeholder="Question / term"></textarea></div>
      <div class="field"><label>Back</label><textarea id="newBack" rows="3" placeholder="Answer / definition"></textarea></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="add-cancel">Cancel</button>
        <button class="btn btn-primary" style="flex:1" data-action="add-save" data-id="${esc(detail.session.id)}">Add card</button>
      </div>
    </div>`;
  if (btn) insertHTMLBefore(btn.closest("div"), html);
}
export async function saveNewCard(sessionId) {
  const front = /** @type {HTMLInputElement} */ (document.getElementById("newFront"))?.value.trim();
  const back = /** @type {HTMLInputElement} */ (document.getElementById("newBack"))?.value.trim();
  if (!front) return toast("Add a question first.");
  await addCard(sessionId, front, back || "");
  toast("Card added");
  renderSetDetail(sessionId, "cards");
}
export async function saveCardEdit(sessionId, cardId) {
  const front = /** @type {HTMLInputElement} */ (document.getElementById("editFront"))?.value.trim();
  const back = /** @type {HTMLInputElement} */ (document.getElementById("editBack"))?.value.trim();
  if (!front) return toast("Add a question first.");
  await updateCard(sessionId, cardId, { front, back: back || "" });
  toast("Card saved");
}

export async function generateSummary(sessionId) {
  toast("Summarizing…");
  try {
    await send({ type: "SUMMARIZE", sessionId });
    renderSetDetail(sessionId, "summary");
  } catch (e) {
    toast(e.message);
  }
}


export function openDetailTab(tab) { renderSetDetail(detail.session.id, tab); }
export function startQuizForCurrentSet(n) { startQuiz(detail.studySet, "set:" + detail.session.id, n); }
export function currentDetail() { return detail; }
export function setEditingCardId(v) { editingCardId = v; }
