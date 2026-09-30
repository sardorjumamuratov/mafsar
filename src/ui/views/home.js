import { setNav, showChrome } from "../nav.js";
import { FLAME, app, bundle, dateInputValue, esc, examDaysLeft, greeting, nav, send, setFor, setHTML, summarize, toast, topOfView } from "../core.js";
import { computeStreak, dayKey, getLastSync, setExamDate, weekActivity } from "../../storage/store.js";
import { examReadiness, weakTopics } from "../../../shared/readiness.js";
import { review } from "../../../shared/srs.js";
import { SetRowHtml as setRow } from "../set-row.js";
import { detail } from "../views/set-detail.js";
import { LANDING_BASE } from "../../config.js";
import { updateBannerHtml } from "../update-banner.js";

// ================================================================ HOME
export async function renderHome() {
  setNav("home");
  showChrome(true);
  const { sessions, studySets, activity, settings, reviewLog } = await bundle();
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  const nextMonthStr = dateInputValue(d.getTime());

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
    
  let examCard = "";
  if (homeExamEditing) {
    const val = examDate ? dateInputValue(examDate) : nextMonthStr;
    examCard = `<div class="block tint" style="display: flex; align-items: center; gap: 12px; padding: 12px 14px;">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--bg-surface2); display: flex; align-items: center; justify-content: center; color: var(--accent-text); flex-shrink: 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px">
          <input type="date" id="home-exam-input" style="font-family: inherit; font-size: 15px; border: none; background: transparent; color: var(--text-primary); outline: none" value="${val}" />
        </div>
        <button class="btn" data-action="exam-save-home" style="color: var(--status-mastered); font-weight: 600; font-size: 14px; padding: 0 8px; background: transparent; border: none">Save</button>
      </div>`;
  } else if (!exam) {
    examCard = `<button class="btn" data-action="exam-edit-home" style="width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border-control); background: var(--bg-surface); text-align: left; cursor: pointer; color: var(--text-primary); margin-bottom: 24px">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--bg-surface2); display: flex; align-items: center; justify-content: center; color: var(--accent-text); flex-shrink: 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px">
          <div style="font-size: 14px; font-weight: 600">Add an exam date</div>
          <div style="font-size: 13px; color: var(--text-muted)">Get a countdown and a daily target</div>
        </div>
        <div style="font-size: 13px; font-weight: 600; color: var(--accent-text)">Add</div>
      </button>`;
  } else {
    const ed = new Date(examDate);
    const today = new Date();
    const edDate = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate());
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffD = Math.round((edDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    
    let title = `Exam &middot; ${ed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
    let sub = `${diffD} ${diffD === 1 ? 'day' : 'days'} left &middot; ${exam.dailyTarget} new ${exam.dailyTarget === 1 ? 'card' : 'cards'} a day`;
    
    if (diffD === 0) {
      title = "Exam &middot; Today";
      sub = `0 days left &middot; ${exam.dailyTarget} new ${exam.dailyTarget === 1 ? 'card' : 'cards'} a day`;
    } else if (diffD < 0) {
      title = "Exam passed";
      sub = "Pick a new date";
    }
    
    examCard = `<button class="btn block tint" data-action="exam-edit-home" style="width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; text-align: left; cursor: pointer; color: var(--text-primary); margin-bottom: 24px; border: none">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--bg-surface2); display: flex; align-items: center; justify-content: center; color: var(--accent-text); flex-shrink: 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px">
          <div style="font-size: 14px; font-weight: 600">${title}</div>
          <div style="font-size: 13px; color: var(--text-muted)">${sub}</div>
        </div>
      </button>`;
  }


  const allCards = studySets.flatMap((s) => (s.flashcards || []).map((c) => ({ ...c, sessionId: s.sessionId })));
  const weak = weakTopics(reviewLog, allCards);
  const insightsCard = weak.length
    ? `<div class="listhd"><span class="t-label">Needs work</span></div>
       <div class="block insight" style="display:flex;flex-direction:column;gap:9px">
         ${weak
           .slice(0, 3)
           .map(
             (w) =>
               `<button type="button" class="insight-row" data-action="open-weak" data-id="${esc(w.sessionId)}" data-card="${esc(w.cardId)}">
                   <span class="q">${esc(w.front)}</span>
                   ${w.forgetRisk ? `<span class="tag dot" style="color:var(--status-learning)">Forget soon</span>` : w.misses > 0 ? `<span class="tag">Missed ${w.misses}×</span>` : `<span class="tag">Felt hard</span>`}
                   <svg class="ic chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
                 </button>`
           )
           .join("")}
       </div>`
    : "";

  // Nothing stored and nothing ever synced: the first sync is still in flight,
  // so show that rather than telling a new learner they have no cards.
  const isInitialSync = studySets.length === 0 && !(await getLastSync());
  const heroHtml = isInitialSync ? homeSkeleton() : due
    ? `<div class="due-hero">
         <div><div class="t-label">Due today</div><div class="n tnum">${due}</div>
         <div class="sub">across ${withSets.length} set${withSets.length === 1 ? "" : "s"} · ~${est} min</div></div>
         <button class="btn btn-primary btn-block" data-action="start-review">Start review</button>
       </div>`
    : `<div class="block tint" style="text-align:center">
         <div style="font-size:26px">✅</div>
         <div style="font-weight:650;margin-top:6px">You're all caught up</div>
         <div style="font-size:12.5px;color:var(--text-muted);margin-top:4px">No cards due right now. Capture a chat or import a set.</div>
       </div>`;

  const updateBanner = await updateBannerHtml();
  setHTML(app, `
    <div class="view">
      ${updateBanner}
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
      ${reviewedToday ? `<div style="text-align:center;font-size:12px;color:var(--text-faint)">${reviewedToday} cards reviewed today</div>` : ""}
    </div>`);
  topOfView();
  
  
}

