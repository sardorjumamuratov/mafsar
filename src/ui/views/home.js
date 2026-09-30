import { setNav, showChrome } from "../nav.js";
import { app, bundle, dateInputValue, esc, greeting, setHTML, topOfView } from "../core.js";
import { getLastSync } from "../../storage/store.js";
import { computeStreak, weekActivity } from "../../../shared/streak.js";
import { computeDailyGoal, fadingSoon } from "../../../shared/daily-goal.js";
import { SetRowHtml, setViewModels } from "../set-row.js";
import { readRatings } from "../../storage/ratings.js";
import { updateBannerHtml } from "../update-banner.js";

// ================================================================ HOME (redesign 01)

// Which set's share block is open. Lives here because share.js and set
// detail both read it.
export let shareOpenFor = null;
export function setShareOpenFor(v) { shareOpenFor = v; }

// The exam card turns into an inline date editor in place; Home never sends
// the learner to another screen for it.
let homeExamEditing = false;
export function setHomeExamEditing(v) {
  homeExamEditing = !!v;
  return renderHome();
}

// The cards behind "Fading soon", so "Review n" can start exactly them.
let fadingRefs = [];
export function getFadingRefs() { return fadingRefs; }

const CAL_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
const LABEL = "font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted)";
const LINK = "font-size:14px;font-weight:600;color:var(--accent-text);background:transparent;border:none;padding:0;cursor:pointer";
const CARD = "padding:16px;border-radius:16px;background:var(--bg-surface);border:1px solid var(--border-card)";
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];
const fmtExam = (ms) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtShort = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function sectionHeader(title, actionLabel, action, extra = "") {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px">
      <span style="${LABEL}">${esc(title)}</span>
      ${actionLabel ? `<button type="button" style="${LINK}" data-action="${action}" ${extra}>${esc(actionLabel)}</button>` : ""}
    </div>`;
}

function skeleton() {
  return `<div class="skel" role="status" aria-label="Loading your sets" style="display:flex;flex-direction:column;gap:20px">
      <div class="sk" style="height:196px;border-radius:20px"></div>
      <div class="sk" style="height:120px;border-radius:16px"></div>
    </div>`;
}

export async function renderHome() {
  setNav("home");
  showChrome(true);
  const { sessions, studySets, activity, settings } = await bundle();
  const live = studySets.filter((s) => !s.deleted);
  const now = Date.now();
  const updateBanner = await updateBannerHtml();

  const greet = `<div style="padding:0 4px;display:flex;flex-direction:column;gap:2px">
      <div style="font-size:14px;color:var(--text-muted)">${esc(greeting())}</div>
      <h1 style="margin:0;font-size:24px;font-weight:650;letter-spacing:-0.02em;color:var(--text-primary)">Today's review</h1>
    </div>`;

  // Nothing stored and nothing ever synced: the first sync is still running,
  // so show that, not "you have nothing" (prompt 31).
  if (!live.length) {
    const first = !(await getLastSync());
    setHTML(app, `<div style="padding:18px 16px 28px;display:flex;flex-direction:column;gap:20px">
        ${updateBanner}${greet}
        ${first ? skeleton() : `<div style="${CARD};display:flex;flex-direction:column;gap:6px">
          <div style="font-size:15px;font-weight:600;color:var(--text-primary)">Make your first set</div>
          <div style="font-size:14px;line-height:1.45;color:var(--text-body2)">Open an AI chat, a web page or a YouTube video, then tap Capture below.</div>
        </div>`}
      </div>`);
    topOfView();
    return;
  }

  // --- Block 2: today's goal ---
  const goal = computeDailyGoal(live, now);
  const hero = `<div style="padding:20px;border-radius:20px;background:var(--accent);color:var(--accent-on);display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.75">Today's goal</div>
        <div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:52px;font-weight:700;line-height:1;letter-spacing:-0.03em">${goal.goalCount}</span>
          <span style="font-size:18px;font-weight:600">${goal.goalCount === 1 ? "card" : "cards"}</span>
        </div>
        <div style="font-size:14px;font-weight:500">${
          goal.totalDue === 0 ? "You're all caught up"
          : goal.nearestExam ? `~${goal.goalMinutes} min · keeps you on pace for ${esc(fmtShort(goal.nearestExam))}`
          : `~${goal.goalMinutes} min · a steady daily amount`
        }</div>
      </div>
      ${goal.totalDue ? `
      <button type="button" class="home-hero-btn" data-action="home-start-goal" data-n="${goal.goalCount}" style="width:100%;height:50px;border-radius:14px;border:none;background:var(--hero-btn);color:var(--accent-on-white);font-size:16px;font-weight:650;font-family:inherit;cursor:pointer">Start review</button>
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500">
        <span>${goal.totalDue} due across ${goal.setCount} ${goal.setCount === 1 ? "set" : "sets"}</span>
        <button type="button" data-action="start-review" style="font:inherit;font-weight:650;color:inherit;background:transparent;border:none;padding:0;text-decoration:underline;text-underline-offset:3px;cursor:pointer">Review all</button>
      </div>` : ""}
    </div>`;

  // --- Block 3: this week ---
  const streak = computeStreak(activity);
  const week = weekActivity(activity);
  const weekCard = `<div style="${CARD};display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="${LABEL}">This week</span>
        <span style="font-size:13px;color:var(--text-body2)">${streak ? `${streak}-day streak` : "Start a streak today"}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">
        ${week.map((d) => {
          const studied = d.count > 0;
          const border = studied || d.isToday ? "var(--accent)" : "var(--track)";
          const fill = studied ? "var(--accent)" : "transparent";
          const day = new Date(d.key + "T12:00:00");
          const label = d.isToday ? "Today" : WEEKDAY[day.getDay()];
          const a11y = `${d.isToday ? "Today" : day.toLocaleDateString("en-US", { weekday: "long" })}, ${studied ? "studied" : d.isToday ? "not studied yet" : "not studied"}`;
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px" aria-label="${esc(a11y)}" role="img">
              <span style="width:32px;height:32px;border-radius:16px;border:2px solid ${border};background:${fill};box-sizing:border-box"></span>
              <span style="font-size:12px;${d.isToday ? "font-weight:700;color:var(--accent-text)" : "font-weight:500;color:var(--text-faint)"}">${label}</span>
            </div>`;
        }).join("")}
      </div>
    </div>`;

  // --- Block 4: exam ---
  const examSets = live.filter((s) => s.examDate && s.examDate === goal.nearestExam);
  let examCard;
  if (homeExamEditing) {
    examCard = `<div style="${CARD};display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0">${CAL_ICON}</div>
        <input type="date" id="home-exam-input" aria-label="Exam date" value="${esc(dateInputValue(goal.nearestExam || now + 30 * 86_400_000))}" min="${esc(dateInputValue(now))}" style="flex:1;min-width:0;font:inherit;font-size:15px;border:none;background:transparent;color:var(--text-primary);outline:none" />
        <button type="button" data-action="exam-save-home" style="${LINK};font-size:13px">Save</button>
      </div>`;
  } else if (!goal.nearestExam) {
    examCard = `<button type="button" data-action="exam-edit-home" style="${CARD};display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;width:100%;font:inherit;color:var(--text-primary)">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0">${CAL_ICON}</div>
        <div style="flex:1;display:flex;flex-direction:column;gap:2px">
          <div style="font-size:15px;font-weight:600">Add an exam date</div>
          <div style="font-size:13px;color:var(--text-muted)">Get a countdown and a daily target</div>
        </div>
        <span style="font-size:13px;font-weight:600;color:var(--accent-text)">Add</span>
      </button>`;
  } else {
    let total = 0, mastered = 0;
    for (const s of setViewModels(sessions, examSets)) { total += s.total; mastered += s.mastered; }
    const readiness = total ? Math.round((mastered / total) * 100) : 0;
    const d = goal.daysUntilExam;
    const left = d === 0 ? "Exam today" : `${d} ${d === 1 ? "day" : "days"} left`;
    examCard = `<button type="button" data-action="exam-edit-home" style="${CARD};display:flex;flex-direction:column;gap:12px;text-align:left;cursor:pointer;width:100%;font:inherit;color:var(--text-primary)">
        <div style="display:flex;align-items:center;gap:12px;width:100%">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0">${CAL_ICON}</div>
          <div style="flex:1;display:flex;flex-direction:column;gap:2px">
            <div style="font-size:15px;font-weight:600">Exam · ${esc(fmtExam(goal.nearestExam))}</div>
            <div style="font-size:13px;color:var(--text-muted)">${left} · ${examSets.length} ${examSets.length === 1 ? "set" : "sets"} included</div>
          </div>
          <span style="font-size:13px;font-weight:600;color:var(--accent-text)">Edit</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;width:100%">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-body2)"><span>Ready</span><span style="color:var(--text-primary);font-weight:600">${readiness}%</span></div>
          <div style="height:6px;border-radius:3px;background:var(--track);overflow:hidden"><div style="height:100%;width:${readiness}%;background:var(--accent)"></div></div>
        </div>
      </button>`;
  }

  // --- Block 5: fading soon ---
  const fading = fadingSoon(live, now);
  fadingRefs = fading.map((f) => ({ sessionId: f.sessionId, cardId: f.card.id }));
  const fadingBlock = fading.length ? `<div style="display:flex;flex-direction:column;gap:8px">
      ${sectionHeader("Fading soon", `Review ${fading.length}`, "home-fading-review")}
      <div style="border-radius:16px;background:var(--bg-surface);border:1px solid var(--border-card);padding:0 14px">
        ${fading.slice(0, 3).map((f, i, arr) => `
          <button type="button" data-action="open-weak" data-id="${esc(f.sessionId)}" data-card="${esc(f.card.id)}" style="display:flex;gap:12px;align-items:flex-start;padding:13px 0;width:100%;background:transparent;border:none;${i < arr.length - 1 ? "border-bottom:1px solid var(--border-divider);" : ""}text-align:left;cursor:pointer;font:inherit;color:var(--text-primary)">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--status-learning);margin-top:7px;flex-shrink:0" aria-hidden="true"></span>
            <span style="font-size:15px;line-height:1.4;text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(f.card.front)}</span>
          </button>`).join("")}
      </div>
    </div>` : "";

  // --- Block 6: continue ---
  const ratings = await readRatings();
  const lastOpened = settings.lastOpened || {};
  const all = setViewModels(sessions, live);
  const recent = [...all]
    .sort((a, b) => (lastOpened[b.id] || 0) - (lastOpened[a.id] || 0) || Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 3);
  const continueBlock = `<div style="display:flex;flex-direction:column;gap:8px">
      ${sectionHeader("Continue", `All ${all.length} ${all.length === 1 ? "set" : "sets"}`, "nav-sets")}
      ${recent.map((s) => SetRowHtml(s, ratings)).join("")}
    </div>`;

  setHTML(app, `<div id="home-view" style="padding:18px 16px 28px;display:flex;flex-direction:column;gap:20px">
      ${updateBanner}
      ${greet}
      ${hero}
      ${weekCard}
      ${examCard}
      ${fadingBlock}
      ${continueBlock}
    </div>`);
  topOfView();
  if (homeExamEditing) /** @type {HTMLInputElement|null} */ (document.getElementById("home-exam-input"))?.focus();
}
