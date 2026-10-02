import { app, platformName, setHTML, esc, toast, send, bundle, topOfView } from "../core.js";
import { openSheet, closeSheet } from "../sheet.js";
import { setNav, showChrome } from "../nav.js";
import { getReviewLog } from "../../storage/store.js";
import { isDue, masteryOf } from "../../../shared/srs.js";
import { computeStreak } from "../../../shared/streak.js";
import { computeDailyGoal } from "../../../shared/daily-goal.js";

// ================================================================ STATS (05-stats.html, spec redesign/10)
// Everything here is computed on the device from local data: "mornings" and
// "today" need the learner's own clock, and it works offline.

// The range is remembered for the session (spec 10, block 2).
let range = "week";

const RANGES = [["week", "Week"], ["month", "Month"], ["all", "All time"]];
// A review logged before durationMs existed counts as this long (spec 10).
const DEFAULT_REVIEW_MS = 22_000;
const CARD = "padding:16px;border-radius:16px;background:var(--bg-surface);border:1px solid var(--border-card)";
const LABEL = "font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)";

// A review is a log row with a grade. Good (4) and Easy (5) count as recalled.
const isReview = (l) => typeof l.grade === "number";
const recalled = (l) => l.grade === 4 || l.grade === 5;

export function studiedMs(logs) {
  return logs.reduce((a, l) => a + (Number.isFinite(l.durationMs) ? l.durationMs : DEFAULT_REVIEW_MS), 0);
}

/** New / learning / mastered by the scheduler's own rule, tombstones skipped. */
export function cardCounts(cards) {
  const out = { new: 0, learning: 0, mastered: 0 };
  for (const c of cards) if (!c.deleted) out[masteryOf(c)]++;
  return out;
}

function fmtDuration(ms) {
  const mins = Math.floor(ms / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

export function getRangeLogs(logs, tab) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const cutoff = new Date(now);
  if (tab === "week") cutoff.setDate(cutoff.getDate() - 6);
  else if (tab === "month") cutoff.setDate(cutoff.getDate() - 29);
  else return logs;
  cutoff.setHours(0, 0, 0, 0);
  return logs.filter((l) => new Date(l.reviewedAt) >= cutoff);
}

function rangeLabel(tab, allLogs) {
  if (tab === "week") return "Last 7 days";
  if (tab === "month") return "Last 30 days";
  const first = allLogs.reduce((m, l) => Math.min(m, new Date(l.reviewedAt).getTime() || Infinity), Infinity);
  if (!Number.isFinite(first)) return "All time";
  const d = new Date(first);
  const opts = /** @type {Intl.DateTimeFormatOptions} */ ({ month: "long", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
  return `Since ${d.toLocaleDateString("en-US", opts)}`;
}

function segHtml() {
  return RANGES.map(([k, label]) => `<button type="button" class="stats-tab" role="tab" aria-selected="${range === k}" data-tab="${k}" style="flex:1;height:36px;border:0;border-radius:9px;background:${range === k ? "var(--bg-segment-active)" : "transparent"};color:${range === k ? "var(--text-primary)" : "var(--text-faint)"};font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">${label}</button>`).join("");
}

export async function renderStats() {
  setNav("stats");
  showChrome(true);
  const allLogs = (await getReviewLog()).filter(isReview);
  const { studySets, activity } = await bundle();
  const live = studySets.filter((s) => !s.deleted);
  const cards = live.flatMap((s) => s.flashcards || []);

  const head = `
    <div style="display:flex;flex-direction:column;gap:2px;padding:0 4px">
      <h1 style="margin:0;font-size:24px;font-weight:650;letter-spacing:-.02em">Stats</h1>
      <div id="statsRange" style="font-size:13px;color:var(--text-muted)">${esc(rangeLabel(range, allLogs))}</div>
    </div>
    <div id="statsTabs" role="tablist" style="display:flex;padding:3px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card)">${segHtml()}</div>`;

  if (allLogs.length < 10) {
    setHTML(app, `
      <div class="screen" style="padding:18px 16px 24px;gap:16px">
        ${head}
        <div style="${CARD};display:flex;flex-direction:column;gap:12px">
          <div style="font-size:15px;font-weight:600">Your stats appear after your first few sessions</div>
          <div style="font-size:14px;line-height:1.45;color:var(--text-body2)">Review 10 cards to unlock trends and feedback.</div>
          <button type="button" class="sheet-primary" data-action="start-review">Start review</button>
        </div>
        ${feedbackRowHtml()}
      </div>`);
    topOfView();
    return;
  }

  setHTML(app, `
    <div class="screen" style="padding:18px 16px 24px;gap:16px">
      ${head}
      <div id="statsRangeBlocks" style="display:contents"></div>
      ${renderAllCards(cards)}
      ${renderFeedback(getRangeLogs(allLogs, range), cards, live, allLogs, activity)}
      ${feedbackRowHtml()}
    </div>`);
  topOfView();
  paintRange(allLogs);

  app.querySelector("#statsTabs")?.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest(".stats-tab"));
    if (!b || b.dataset.tab === range) return;
    range = b.dataset.tab;
    // The figures, the chart and the feedback follow the range; All cards doesn't.
    renderStats();
  });
}

function paintRange(allLogs) {
  const slot = document.getElementById("statsRangeBlocks");
  if (!slot) return;
  const logs = getRangeLogs(allLogs, range);
  const n = logs.length;
  const fig = [
    [n.toLocaleString("en-US"), "Reviews"],
    [n ? `${Math.round((logs.filter(recalled).length / n) * 100)}%` : "—", "Retention"],
    [fmtDuration(studiedMs(logs)), "Studied"],
  ];
  setHTML(slot, `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-radius:16px;background:var(--bg-surface);border:1px solid var(--border-card)">
      ${fig.map(([v, l], i) => `
        <div style="padding:14px;display:flex;flex-direction:column;gap:2px;border-left:1px solid ${i ? "var(--border-card)" : "transparent"}">
          <div style="font-size:22px;font-weight:700;letter-spacing:-.02em">${esc(v)}</div>
          <div style="font-size:13px;color:var(--text-muted)">${l}</div>
        </div>`).join("")}
    </div>
    ${renderChart(logs, range, allLogs)}`);
}

/** Buckets for the chart: 7 days, the weeks over 30 days, or up to 12 months. */
function chartBuckets(logs, tab, allLogs = logs) {
  const now = new Date();
  /** @type {{ start: Date, end: Date, label: string, full: string, count?: number }[]} */
  const buckets = [];
  if (tab === "week") {
    for (let i = 6; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      buckets.push({ start, end, label: i === 0 ? "Today" : ["S", "M", "T", "W", "T", "F", "S"][start.getDay()], full: start.toLocaleDateString("en-US", { weekday: "long" }) });
    }
  } else if (tab === "month") {
    // Calendar weeks, Monday to Sunday, that overlap the last 30 days.
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    let start = new Date(from.getFullYear(), from.getMonth(), from.getDate() - ((from.getDay() + 6) % 7));
    while (start <= now) {
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const label = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      buckets.push({ start, end, label, full: `Week of ${label}` });
      start = end;
    }
    buckets[buckets.length - 1].label = "This wk";
  } else {
    const first = allLogs.reduce((m, l) => Math.min(m, new Date(l.reviewedAt).getTime() || Infinity), now.getTime());
    const f = new Date(first);
    let months = (now.getFullYear() - f.getFullYear()) * 12 + now.getMonth() - f.getMonth();
    months = Math.min(11, Math.max(0, months));
    for (let i = months; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const label = start.toLocaleDateString("en-US", { month: "short" });
      buckets.push({ start, end, label: i === 0 ? "This mo" : label, full: start.toLocaleDateString("en-US", { month: "long" }) });
    }
  }
  for (const b of buckets) b.count = 0;
  for (const l of logs) {
    const t = new Date(l.reviewedAt);
    const b = buckets.find((x) => t >= x.start && t < x.end);
    if (b) b.count++;
  }
  return buckets;
}

export function renderChart(logs, tab, allLogs = logs) {
  const title = tab === "week" ? "Reviews per day" : tab === "month" ? "Reviews per week" : "Reviews per month";
  const buckets = chartBuckets(logs, tab, allLogs);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const busiest = buckets.reduce((a, b) => (b.count > a.count ? b : a), buckets[0]);
  const summary = busiest.count ? `Busiest: ${busiest.full}, ${busiest.count} reviews` : "No reviews yet";
  const bars = buckets.map((b, i) => {
    const last = i === buckets.length - 1;
    const h = Math.max(4, Math.round((b.count / max) * 84));
    const bg = last ? "var(--accent)" : b.count ? "var(--chart-bar)" : "var(--status-new-bar)";
    return `
      <div aria-label="${esc(b.label)}: ${b.count} reviews" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:100%">
        <span style="font-size:11px;font-weight:600;color:${last ? "var(--accent-text)" : "var(--text-muted)"}">${b.count || ""}</span>
        <div style="width:100%;height:${h}px;border-radius:6px;background:${bg}"></div>
        <span style="font-size:11px;color:${last ? "var(--accent-text)" : "var(--text-faint)"};font-weight:${last ? 700 : 500};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${esc(b.label)}</span>
      </div>`;
  }).join("");
  return `
    <div style="${CARD};display:flex;flex-direction:column;gap:14px">
      <span style="${LABEL}">${title}</span>
      <div role="img" aria-label="${esc(summary)}" style="display:flex;align-items:flex-end;gap:8px;height:128px">${bars}</div>
    </div>`;
}

export function renderAllCards(cards) {
  const c = cardCounts(cards);
  if (!c.new && !c.learning && !c.mastered) return "";
  const legend = (color, n, label) => `<span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:4px;background:${color}"></span><b style="color:var(--text-primary);font-weight:600">${n}</b> ${label}</span>`;
  return `
    <div style="${CARD};display:flex;flex-direction:column;gap:10px">
      <span style="${LABEL}">All cards</span>
      <div role="img" aria-label="${c.new} new, ${c.learning} learning, ${c.mastered} mastered" style="display:flex;gap:3px;height:8px;border-radius:4px;overflow:hidden">
        ${c.new ? `<div style="flex:${c.new};background:var(--status-new-bar)"></div>` : ""}
        ${c.learning ? `<div style="flex:${c.learning};background:var(--status-learning)"></div>` : ""}
        ${c.mastered ? `<div style="flex:${c.mastered};background:var(--status-mastered)"></div>` : ""}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--text-body2)">
        ${legend("var(--status-new)", c.new, "New")}
        ${legend("var(--status-learning)", c.learning, "Learning")}
        ${legend("var(--status-mastered)", c.mastered, "Mastered")}
      </div>
    </div>`;
}

// Code fences, backticks, or a high density of code / maths symbols.
const looksLikeCode = (t) => /```|`[^`]+`/.test(t) || ((t.match(/[{}();=<>+\-*/^∑∫√≤≥]/g) || []).length / Math.max(1, t.length)) > 0.08;

/**
 * Up to three insights (spec 10, rules a–d), in the order backlog, slipping
 * set, streak risk, best time. `logs` is the selected range.
 */
export function renderFeedback(logs, cards, sets, allLogs, activity = {}) {
  const insights = [];
  const now = new Date();

  // c. Backlog: due > 3 × the daily goal.
  const backlog = cards.filter((c) => !c.deleted && isDue(c)).length;
  const goal = computeDailyGoal(sets.filter((s) => s.flashcards), now.getTime()).goalCount || 20;
  if (backlog > 3 * goal) {
    const k = Math.min(backlog, Math.floor((15 * 60) / 22));
    insights.push({ dot: "var(--status-learning)", title: "Your backlog is growing",
      body: `${backlog} cards are overdue. A 15-minute session today clears ${k}.`,
      action: `<button type="button" data-action="home-start-goal" data-n="${k}" style="align-self:flex-start;margin-left:18px;height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--border-control);background:transparent;color:var(--accent-text);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">Start 15 min</button>` });
  }

  // a. Slipping set: 20+ reviews in range, retention 10+ points under average.
  const setOfCard = new Map();
  for (const s of sets) for (const c of s.flashcards || []) setOfCard.set(c.id, s);
  const per = new Map();
  for (const l of logs) {
    const s = sets.find((x) => x.sessionId && x.sessionId === l.sessionId) || setOfCard.get(l.cardId);
    if (!s) continue;
    const r = per.get(s) || { revs: 0, ok: 0 };
    r.revs++;
    if (recalled(l)) r.ok++;
    per.set(s, r);
  }
  const avg = logs.length ? (logs.filter(recalled).length / logs.length) * 100 : 0;
  let slipping = null, slipRet = 101;
  for (const [s, r] of per) {
    const ret = (r.ok / r.revs) * 100;
    if (r.revs >= 20 && ret <= avg - 10 && ret < slipRet) { slipping = s; slipRet = ret; }
  }
  if (slipping) {
    const fc = (slipping.flashcards || []).filter((c) => !c.deleted);
    const typed = fc.length > 0 && fc.filter((c) => looksLikeCode(`${c.front} ${c.back}`)).length / fc.length > 0.4;
    const tip = typed ? "Typing answers makes you recall, not just recognise." : "A short review today brings it back.";
    insights.push({ dot: "var(--status-learning)", title: `${slipping.title || "A set"} is slipping`,
      body: `Retention ${Math.round(slipRet)}%, the lowest of your sets. ${tip}`,
      action: `<button type="button" data-action="${typed ? "start-typed" : "set-review"}" data-id="${esc(slipping.sessionId)}" style="align-self:flex-start;margin-left:18px;height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--border-control);background:transparent;color:var(--accent-text);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">Review with ${typed ? "Type answers" : "Flashcards"}</button>` });
  }

  // d. Streak risk: 3+ days, nothing today, 18:00 or later.
  const streak = computeStreak(activity || {});
  const today = now.toDateString();
  const studiedToday = allLogs.some((l) => new Date(l.reviewedAt).toDateString() === today);
  if (streak >= 3 && !studiedToday && now.getHours() >= 18) {
    insights.push({ dot: "var(--status-learning)", title: `Keep your ${streak}-day streak`,
      body: "You haven't studied today. A few cards before midnight keeps it going." });
  }

  // b. Best time: one bucket of 30+ reviews beats the others by 8+ points.
  const buckets = { morn: { revs: 0, ok: 0 }, aft: { revs: 0, ok: 0 }, eve: { revs: 0, ok: 0 } };
  for (const l of logs) {
    const h = new Date(l.reviewedAt).getHours();
    const b = h >= 5 && h < 12 ? buckets.morn : h >= 12 && h < 18 ? buckets.aft : buckets.eve;
    b.revs++;
    if (recalled(l)) b.ok++;
  }
  const valid = Object.keys(buckets).filter((k) => buckets[k].revs >= 30);
  if (valid.length > 1) {
    const ret = (k) => (buckets[k].ok / buckets[k].revs) * 100;
    const best = valid.reduce((a, b) => (ret(b) > ret(a) ? b : a));
    const others = valid.filter((k) => k !== best);
    const otherAvg = others.reduce((a, k) => a + ret(k), 0) / others.length;
    if (ret(best) >= otherAvg + 8) {
      const names = { morn: "Mornings", aft: "Afternoons", eve: "Evenings" };
      const when = { morn: "before noon", aft: "in the afternoon", eve: "after 6 pm" };
      insights.push({ dot: "var(--status-mastered)", title: `${names[best]} work for you`,
        body: `You recall ${Math.round(ret(best) - otherAvg)}% more in sessions ${when[best]}.` });
    }
  }

  const shown = insights.slice(0, 3);
  if (!shown.length) return "";
  const card = (i) => {
    const row = `<span style="width:8px;height:8px;border-radius:4px;background:${i.dot};margin-top:7px;flex-shrink:0"></span>
      <div style="display:flex;flex-direction:column;gap:4px"><div style="font-size:15px;font-weight:600">${esc(i.title)}</div><div style="font-size:14px;line-height:1.45;color:var(--text-body2);text-wrap:pretty">${esc(i.body)}</div></div>`;
    return i.action
      ? `<div style="${CARD};display:flex;flex-direction:column;gap:10px"><div style="display:flex;gap:10px;align-items:flex-start">${row}</div>${i.action}</div>`
      : `<div style="${CARD};display:flex;gap:10px;align-items:flex-start">${row}</div>`;
  };
  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      <span style="${LABEL};padding:0 4px">Feedback</span>
      ${shown.map(card).join("")}
    </div>`;
}

function feedbackRowHtml() {
  return `
    <button type="button" data-action="open-feedback" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:14px;border:1px solid var(--border-control);background:transparent;color:var(--text-primary);text-align:left;cursor:pointer;font-family:inherit;width:100%">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H10l-4 3.5V16H5a1 1 0 01-1-1V6a1 1 0 011-1z"/></svg>
      <span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:600">Send feedback about the app</span><span style="font-size:13px;color:var(--text-muted)">Bugs, ideas, anything</span></span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-new)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </button>`;
}

/** The "Send feedback" sheet (spec 10): text, an optional screenshot, Send. */
export function openFeedback() {
  openSheet("Send feedback", `
    <textarea id="feedbackText" aria-label="Your feedback" placeholder="Tell us more…" rows="5" maxlength="4000" style="resize:vertical;background:var(--bg-app);border:1px solid var(--border-control);border-radius:10px;padding:10px 12px;color:var(--text-primary);font-family:inherit;font-size:15px;line-height:1.4;outline:none"></textarea>
    <div id="screenshotPreview" style="display:none;position:relative;width:64px;height:64px">
      <img id="screenshotImg" alt="Attached screenshot" style="width:64px;height:64px;object-fit:cover;border-radius:8px">
      <button type="button" id="removeScreenshot" aria-label="Remove screenshot" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:10px;border:1px solid var(--border-control);background:var(--bg-surface2);color:var(--text-primary);font-size:12px;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer">×</button>
    </div>
    <button type="button" id="attachScreenshotBtn" style="align-self:flex-start;height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--border-control);background:transparent;color:var(--text-primary);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">Attach a screenshot</button>
    <input type="file" id="screenshotInput" accept="image/png,image/jpeg,image/webp" hidden>
    <button type="button" class="sheet-primary" id="sendFeedbackBtn" disabled>Send</button>`, false, null, { px: 22, pb: 24, gap: 16 });

  const textEl = /** @type {HTMLTextAreaElement} */ (document.getElementById("feedbackText"));
  const sendBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sendFeedbackBtn"));
  const attachBtn = /** @type {HTMLButtonElement} */ (document.getElementById("attachScreenshotBtn"));
  const fileInput = /** @type {HTMLInputElement} */ (document.getElementById("screenshotInput"));
  const preview = /** @type {HTMLElement} */ (document.getElementById("screenshotPreview"));
  const img = /** @type {HTMLImageElement} */ (document.getElementById("screenshotImg"));
  const removeBtn = /** @type {HTMLButtonElement} */ (document.getElementById("removeScreenshot"));
  if (!textEl) return;
  textEl.focus();

  let imageData = null;
  textEl.addEventListener("input", () => { sendBtn.disabled = textEl.value.trim().length === 0; });
  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    // At most 1600px on the long side, JPEG 0.8, and nothing over 1.5 MB.
    const reader = new FileReader();
    reader.onload = (re) => {
      const image = new Image();
      image.onload = () => {
        let w = image.width, h = image.height;
        if (Math.max(w, h) > 1600) {
          if (w > h) { h = Math.round((h * 1600) / w); w = 1600; }
          else { w = Math.round((w * 1600) / h); h = 1600; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(image, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        if (dataUrl.length * 0.75 > 1.5 * 1024 * 1024) return toast("That image is too large");
        imageData = dataUrl;
        img.src = dataUrl;
        preview.style.display = "block";
        attachBtn.style.display = "none";
      };
      image.src = /** @type {string} */ (re.target.result);
    };
    reader.readAsDataURL(file);
  });
  removeBtn.addEventListener("click", () => {
    imageData = null;
    preview.style.display = "none";
    attachBtn.style.display = "";
    fileInput.value = "";
  });
  sendBtn.addEventListener("click", async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    try {
      // The worker reads `imageData` (a plain `image` field was silently dropped).
      await send({
        type: "SEND_FEEDBACK", text: textEl.value.trim(), imageData, route: "Stats",
        appVersion: chrome.runtime.getManifest().version,
        platform: platformName() + (navigator.userAgent.includes("Firefox") ? " Firefox" : " Chrome"),
      });
      toast("Thanks, feedback sent");
      closeSheet();
    } catch {
      sendBtn.textContent = "Send";
      sendBtn.disabled = false;
      toast("Couldn't send · Retry");
    }
  });
}
