import { setNav, showChrome } from "../nav.js";
import { FLAME, app, bundle, dateInputValue, esc, examDaysLeft, greeting, nav, send, setFor, setHTML, summarize, toast, topOfView } from "../core.js";
import { computeStreak, dayKey, setExamDate, weekActivity } from "../../storage/store.js";
import { examReadiness, weakTopics } from "../../storage/readiness.js";
import { review } from "../../storage/srs.js";
import { setRow } from "../views/sets.js";
import { detail } from "../views/set-detail.js";
import { LANDING_BASE } from "../../config.js";

// ================================================================ HOME
export async function renderHome() {
  setNav("home");
  showChrome(true);
  const { sessions, studySets, activity, settings, reviewLog } = await bundle();

  let due = 0,
    mastered = 0,
    total = 0;
  for (const set of studySets) {
    const s = summarize(set);
    due += s.due;
    mastered += s.mastered;
    total += s.total;
  }
  const progress = total ? Math.round((mastered / total) * 100) : 0;
  const reviewedToday = activity[dayKey()] || 0;
  const streak = computeStreak(activity);
  const week = weekActivity(activity);
  const est = Math.max(1, Math.round(due * 0.4));

  const withSets = sessions.filter((s) => setFor(s.id, studySets));
  const topSets = withSets.slice(0, 4);

  // --- Exam section: one date on Home, applied to the sets the user picks ---
  const examSets = studySets.filter((s) => s.examDate && s.examDate > Date.now());
  const examDate = examSets.length ? Math.min(...examSets.map((s) => s.examDate)) : null;
  let totals = { total: 0, mastered: 0, due: 0 };
  for (const s of examSets) {
    const x = summarize(s);
    totals.total += x.total;
    totals.mastered += x.mastered;
    totals.due += x.due;
  }
  const exam = examDate
    ? examReadiness({ examDate, total: totals.total, mastered: totals.mastered, due: totals.due })
    : null;
  const behind = exam?.status === "behind" || exam?.status === "today";
  // The date input gets its own labeled row rather than competing with the
  // heading in a flex row — a native date field can't be shrunk gracefully.
  const examCard = exam
    ? `<div class="block exam-live">
         <div class="exam-head">
           <span class="exam-ic">🎯</span>
           <div class="exam-head-txt">
             <div class="t-label">${examDaysLeft(examDate)}</div>
             <div class="sub">${totals.total} card${totals.total === 1 ? "" : "s"} · ${examSets.length} set${examSets.length === 1 ? "" : "s"}</div>
           </div>
           <span class="pill ${behind ? "warn" : "ok"}">${behind ? "Behind" : "On track"}</span>
         </div>
         <div class="bar ${exam.progress === 100 ? "ok" : ""}"><i style="width:${totals.total ? exam.progress : 0}%"></i></div>
         <div class="prog-line" style="font-size:12px">
           <span style="font-weight:600;color:var(--ink)">${exam.progress}% mastered</span>
           <span>${exam.dailyTarget}/day to finish</span>
         </div>
         <label class="date-field">
           <span>Exam date</span>
           <input type="text" placeholder="YYYY-MM-DD" id="homeExamDate" class="date-input" value="${dateInputValue(examDate)}" />
         </label>
         <div class="exam-actions">
           <button class="btn btn-ghost btn-sm" data-action="exam-pick">Choose sets</button>
           <button class="btn btn-ghost btn-sm" data-action="exam-clear">Clear</button>
         </div>
       </div>`
    : `<div class="block exam-live">
         <div class="exam-head" data-action="exam-pick" role="button" tabindex="0">
           <span class="exam-ic">🎯</span>
           <div class="exam-head-txt">
             <div class="t-label">Exam prep</div>
             <div class="sub">Set a date and pick which sets count</div>
           </div>
           <svg class="ic chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
         </div>
         <label class="date-field">
           <span>Exam date</span>
           <input type="text" placeholder="YYYY-MM-DD" id="homeExamDate" class="date-input" value="" />
         </label>
       </div>`;

  const allCards = studySets.flatMap((s) => s.flashcards || []);
  const weak = weakTopics(reviewLog, allCards);
  const insightsCard = weak.length
    ? `<div class="listhd"><span class="t-label">Needs work</span></div>
       <div class="block insight" style="display:flex;flex-direction:column;gap:9px">
         ${weak
           .slice(0, 3)
           .map(
             (w) =>
               `<div class="insight-row"><span class="q">${esc(w.front)}</span>${
                 w.forgetRisk
                   ? `<span class="tag dot" style="color:var(--warm)">forget soon</span>`
                   : `<span class="tag">${w.fails} miss${w.fails === 1 ? "" : "es"}</span>`
               }</div>`
           )
           .join("")}
       </div>`
    : "";

  const heroHtml = due
    ? `<div class="due-hero">
         <div><div class="t-label">Due today</div><div class="n tnum">${due}</div>
         <div class="sub">across ${withSets.length} set${withSets.length === 1 ? "" : "s"} · ~${est} min</div></div>
         <button class="btn btn-primary btn-block" data-action="start-review">Start review</button>
       </div>`
    : `<div class="block tint" style="text-align:center">
         <div style="font-size:26px">✅</div>
         <div style="font-weight:650;margin-top:6px">You're all caught up</div>
         <div style="font-size:12.5px;color:var(--muted);margin-top:4px">No cards due right now. Capture a chat or import a set.</div>
       </div>`;

  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <div><div class="h-sub">${greeting()}</div><div class="h-title">Ready to review</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="streak">${FLAME}${streak}</span>
                  </div>
      </div>

      ${heroHtml}
      ${examCard}

      <div class="block" style="display:flex;flex-direction:column;gap:11px">
        <div class="listhd"><span class="t-label">This week</span>
          <span class="tag">${week.filter((d) => d.count).length} of 7 days</span></div>
        <div class="week">
          ${week
            .map(
              (d) =>
                `<div class="d"><span class="dot ${d.isToday ? "today" : d.count ? "on" : ""}"></span><span class="lbl">${d.label}</span></div>`
            )
            .join("")}
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="v tnum">${mastered}</div><div class="k">Mastered</div></div>
        <div class="stat"><div class="v tnum">${progress}%</div><div class="k">Progress</div></div>
        <div class="stat"><div class="v tnum">${studySets.length}</div><div class="k">Sets</div></div>
      </div>

      ${insightsCard}

      <div class="listhd"><span class="t-label">Your sets</span>
        <button class="linkbtn" data-action="open-import">＋ Import</button></div>
      ${
        topSets.length
          ? topSets.map((s) => setRow(s, summarize(setFor(s.id, studySets)))).join("")
          : `<div class="empty">No study sets yet.<br>Open ChatGPT, Claude, or Gemini and click <b>Save to Mafsar</b>.</div>`
      }
      ${withSets.length > 4 ? `<button class="btn btn-ghost btn-block" data-action="nav-sets">View all ${withSets.length} sets</button>` : ""}
      ${reviewedToday ? `<div style="text-align:center;font-size:12px;color:var(--faint)">${reviewedToday} cards reviewed today</div>` : ""}
    </div>`);
  topOfView();
  
  const hDate = document.getElementById("homeExamDate");
  if (hDate && window.flatpickr) {
    window.flatpickr(hDate, { disableMobile: true, allowInput: true });
  }
}

// --- Exam set picker (focus view): choose which sets count toward the exam ---
export let examDraft = null; // { date: ms|null, picked: Set<sessionId> }

export async function openExamPicker() {
  const { sessions, studySets } = await bundle();
  const withSets = sessions.filter((s) => setFor(s.id, studySets));
  const examSets = studySets.filter((s) => s.examDate && s.examDate > Date.now());
  examDraft = {
    date: examSets.length ? Math.min(...examSets.map((s) => s.examDate)) : examDraft?.date || null,
    picked: new Set(examSets.map((s) => s.sessionId)),
  };
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Exam sets</div><span style="width:32px"></span>
      </div>
      <div class="field"><label>Exam date</label>
        <input type="text" placeholder="YYYY-MM-DD" id="pickerDate" class="date-input" value="${dateInputValue(examDraft.date)}" style="width:auto" /></div>
      <div class="help" style="margin:0">Pick the sets this exam covers. Selected sets resurface cards before the date and count toward readiness.</div>
      <div class="block" style="padding:6px 14px">
        ${
          withSets.length
            ? withSets
                .map((session) => {
                  const set = setFor(session.id, studySets);
                  const s = summarize(set);
                  return `<label class="pick-row">
                    <input type="checkbox" class="picker-check" data-id="${esc(session.id)}" ${examDraft.picked.has(session.id) ? "checked" : ""} />
                    <span style="flex:1;min-width:0">
                      <span class="name">${esc(session.title || "Untitled")}</span>
                      <span class="blurb" id="blurb-${esc(session.id)}">${esc(set?.blurb || `${s.total} cards`)}</span>
                    </span>
                    <span class="tag">${s.total}</span>
                  </label>`;
                })
                .join("")
            : `<div class="empty">No sets yet — capture or import something first.</div>`
        }
      </div>
      <button class="btn btn-primary btn-block" data-action="picker-save" ${withSets.length ? "" : "disabled"}>Save exam</button>
    </div>`);
  topOfView();
  fillMissingBlurbs(withSets, studySets);
  
  const pDate = document.getElementById("pickerDate");
  if (pDate && window.flatpickr) {
    window.flatpickr(pDate, { disableMobile: true, allowInput: true });
  }
}

/** Fetch tiny AI blurbs for sets that don't have one; patch rows as they land. */
export async function fillMissingBlurbs(sessions, studySets) {
  for (const session of sessions) {
    const set = setFor(session.id, studySets);
    if (!set || set.blurb || !set.flashcards?.length) continue;
    const cell = document.getElementById(`blurb-${session.id}`);
    if (!cell) continue;
    try {
      const r = await send({ type: "GET_BLURB", sessionId: session.id });
      if (r.blurb && document.getElementById(`blurb-${session.id}`)) {
        document.getElementById(`blurb-${session.id}`).textContent = r.blurb;
      }
    } catch {
      /* offline or LLM error — the card count stays as the label */
    }
  }
}

export async function saveExamSelection() {
  const dateStr = /** @type {HTMLInputElement} */ (document.getElementById("pickerDate"))?.value;
  const date = dateStr ? new Date(`${dateStr}T23:59:59`).getTime() : null;
  if (!date) return toast("Pick an exam date first.");
  const { studySets } = await bundle();
  for (const set of studySets) {
    const picked = examDraft?.picked.has(set.sessionId);
    if (picked && set.examDate !== date) await setExamDate(set.sessionId, date);
    if (!picked && set.examDate) await setExamDate(set.sessionId, null);
  }
  toast("Exam date set. Cards will resurface before it.");
  renderHome();
}

// --- Sharing: the share link lives at the top of every set detail ----------
// The code is cached on the set (local-only); the link is ${LANDING_BASE}/s/{code}.
export let shareOpenFor = null; // sessionId whose share block is revealed (survives tab switches)


export function setExamDraft(v) { examDraft = v; }
export function setShareOpenFor(v) { shareOpenFor = v; }
