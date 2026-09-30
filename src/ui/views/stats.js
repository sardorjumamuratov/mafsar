import { app, appendHTML, platformName, setHTML, esc, toast, send, bundle, topOfView } from "../core.js";
import { openSheet, closeSheet as closeSharedSheet } from "../sheet.js";
import { setNav, showChrome } from "../nav.js";
import { getReviewLog } from "../../storage/store.js";

// We'll calculate the stats dynamically!
export async function renderStats() {
  setNav("stats");
  showChrome(true);
  topOfView();
  const logs = await getReviewLog();
  
  if (logs.length < 10) {
    setHTML(app, `
      <div style="padding:16px;font-size:32px;font-weight:700;letter-spacing:-0.03em;color:var(--ink)">Your stats</div>
      <div style="padding:16px;border-radius:16px;background:var(--surface);border:1px solid var(--border);display:flex;flex-direction:column;gap:12px;margin:16px">
        <div style="font-size:15px;font-weight:600;color:var(--ink)">Your stats appear after your first few sessions</div>
        <div style="font-size:14px;color:var(--muted)">Review 10 cards to unlock trends and feedback.</div>
        <button class="btn btn-primary" style="height:52px;border-radius:14px" data-action="start-review">Start review</button>
      </div>
      ${renderFeedbackRow()}
    `);
    return;
  }
  
  setHTML(app, `
    <div style="padding:16px;font-size:32px;font-weight:700;letter-spacing:-0.03em;color:var(--ink)">Your stats</div>
    <div style="display:flex;gap:8px;padding:0 16px;margin-bottom:16px" id="statsTabs">
      <button class="stats-tab active" data-tab="week" style="flex:1;height:36px;border-radius:8px;background:var(--surface-2);color:var(--ink);font-size:14px;font-weight:600;border:none">Week</button>
      <button class="stats-tab" data-tab="month" style="flex:1;height:36px;border-radius:8px;background:transparent;color:var(--muted);font-size:14px;font-weight:600;border:none">Month</button>
      <button class="stats-tab" data-tab="all" style="flex:1;height:36px;border-radius:8px;background:transparent;color:var(--muted);font-size:14px;font-weight:600;border:none">All time</button>
    </div>
    
    <div id="statsContent" style="padding:0 16px;display:flex;flex-direction:column;gap:16px;padding-bottom:120px">
      <!-- content rendered here -->
    </div>
  `);
  
  /** @type {any} */ (window).__mafsar_startReview = () => {
    // trigger home session
    const homeBtn = document.querySelector('[data-view="home"]');
    if(homeBtn) /** @type {HTMLElement} */ (homeBtn).click(); 
  };

  const tabs = app.querySelectorAll(".stats-tab");
  tabs.forEach(t => /** @type {HTMLElement} */ (t).onclick = (e) => {
    tabs.forEach(btn => {
      /** @type {HTMLElement} */ (btn).style.background = "transparent";
      /** @type {HTMLElement} */ (btn).style.color = "var(--muted)";
      btn.classList.remove("active");
    });
    const cur = /** @type {HTMLElement} */ (e.target);
    cur.style.background = "var(--surface-2)";
    cur.style.color = "var(--ink)";
    cur.classList.add("active");
    renderTab(cur.dataset.tab, logs);
  });
  
  renderTab("week", logs);
}

function renderFeedbackRow() {
  return `
    <div style="padding:0 16px;margin-top:24px;margin-bottom:120px">
      <button type="button" data-action="open-feedback" style="width:100%;padding:14px;border-radius:14px;border:1px solid var(--border-control);background:transparent;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-text);flex-shrink:0" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
        <div style="flex:1;display:flex;flex-direction:column">
          <div style="font-size:15px;font-weight:600;color:var(--ink)">Send feedback about the app</div>
          <div style="font-size:13px;color:var(--muted)">Bugs, ideas, anything</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-new)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>
  `;
}

function getSheetHost() {
  return document.getElementById("sheet");
}

export function openFeedback() {
  const host = getSheetHost();
  openSheet("Send feedback", `
    <div style="display:flex;flex-direction:column;gap:16px">
      <textarea id="feedbackText" placeholder="Tell us more..." rows="5" maxlength="4000" style="width:100%;border-radius:12px;border:1px solid var(--border);padding:12px;font-size:14px;background:var(--surface)"></textarea>
      
      <div id="screenshotPreview" style="display:none;position:relative;width:64px;height:64px">
        <img id="screenshotImg" style="width:64px;height:64px;object-fit:cover;border-radius:8px">
        <button id="removeScreenshot" aria-label="Remove screenshot" style="position:absolute;top:-6px;right:-6px;background:var(--surface-2);border-radius:50%;width:20px;height:20px;border:1px solid var(--border);font-size:12px;display:flex;align-items:center;justify-content:center;color:var(--ink)">×</button>
      </div>
      
      <button class="btn" id="attachScreenshotBtn" style="height:36px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--ink);font-size:14px;font-weight:500">Attach a screenshot</button>
      <input type="file" id="screenshotInput" accept="image/png,image/jpeg,image/webp" style="display:none">
      
      <button class="btn btn-primary" id="sendFeedbackBtn" disabled style="height:50px;border-radius:12px;font-size:16px;font-weight:650;margin-top:8px">Send</button>
    </div>
  `);
  const closeSheet = closeSharedSheet;
  if (!host) return;
  
  const textEl = /** @type {HTMLTextAreaElement} */ (document.getElementById("feedbackText"));
  const sendBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sendFeedbackBtn"));
  const attachBtn = /** @type {HTMLButtonElement} */ (document.getElementById("attachScreenshotBtn"));
  const fileInput = /** @type {HTMLInputElement} */ (document.getElementById("screenshotInput"));
  const preview = /** @type {HTMLElement} */ (document.getElementById("screenshotPreview"));
  const img = /** @type {HTMLImageElement} */ (document.getElementById("screenshotImg"));
  const removeBtn = /** @type {HTMLButtonElement} */ (document.getElementById("removeScreenshot"));

  let imageData = null;
  
  textEl.oninput = () => {
    sendBtn.disabled = textEl.value.trim().length === 0;
  };
  
  attachBtn.onclick = () => fileInput.click();
  
  fileInput.onchange = (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    const file = target.files?.[0];
    if(!file) return;
    
    // resize
    const reader = new FileReader();
    reader.onload = (re) => {
      const image = new Image();
      image.onload = () => {
        let w = image.width;
        let h = image.height;
        if(Math.max(w, h) > 1600) {
          if(w > h) { h = Math.round((h * 1600) / w); w = 1600; }
          else { w = Math.round((w * 1600) / h); h = 1600; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if(ctx) ctx.drawImage(image, 0, 0, w, h);
        
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        if (dataUrl.length * 0.75 > 1.5 * 1024 * 1024) return;
        
        imageData = dataUrl;
        img.src = dataUrl;
        preview.style.display = "block";
        attachBtn.style.display = "none";
      };
      image.src = /** @type {string} */ (re.target.result);
    };
    reader.readAsDataURL(file);
  };
  
  removeBtn.onclick = () => {
    imageData = null;
    preview.style.display = "none";
    attachBtn.style.display = "block";
    fileInput.value = "";
  };
  
  sendBtn.onclick = async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";
    try {
      // The worker reads `imageData` (a plain `image` field was silently dropped).
      await send({
        type: "SEND_FEEDBACK", text: textEl.value.trim(), imageData, route: "Stats",
        appVersion: chrome.runtime.getManifest().version,
        platform: platformName() + (navigator.userAgent.includes("Firefox") ? " Firefox" : " Chrome"),
      });
      toast("Thanks, feedback sent");
      closeSheet();
    } catch(err) {
      sendBtn.textContent = "Couldn't send · Retry";
      sendBtn.disabled = false;
    }
  };
}

export function getRangeLogs(logs, tab) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  let cutoff = new Date(now);
  if (tab === "week") cutoff.setDate(cutoff.getDate() - 6);
  else if (tab === "month") cutoff.setDate(cutoff.getDate() - 29);
  else return logs;
  cutoff.setHours(0, 0, 0, 0);
  return logs.filter(l => new Date(l.reviewedAt) >= cutoff);
}

function renderTab(tab, allLogs) {
  const logs = getRangeLogs(allLogs, tab);
  const cont = document.getElementById("statsContent");
  if(!cont) return;
  
  // metrics
  const revs = logs.length;
  const retCount = logs.filter(l => l.grade === 4 || l.grade === 5).length;
  const ret = revs === 0 ? "—" : Math.round((retCount / revs) * 100) + "%";
  
  const dur = logs.reduce((a, b) => a + (b.durationMs || 0), 0);
  const durMins = Math.floor(dur / 60000);
  const durStr = durMins >= 60 ? `${Math.floor(durMins/60)}h ${durMins%60}m` : `${durMins}m`;
  
  let html = `
    <div style="display:flex;border-radius:16px;background:var(--surface);border:1px solid var(--border);overflow:hidden">
      <div style="flex:1;padding:14px;display:flex;flex-direction:column;gap:2px">
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:var(--ink)">${revs}</div>
        <div style="font-size:13px;color:var(--muted)">Reviews</div>
      </div>
      <div style="flex:1;padding:14px;display:flex;flex-direction:column;gap:2px;border-left:1px solid var(--border)">
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:var(--ink)">${ret}</div>
        <div style="font-size:13px;color:var(--muted)">Retention</div>
      </div>
      <div style="flex:1;padding:14px;display:flex;flex-direction:column;gap:2px;border-left:1px solid var(--border)">
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:var(--ink)">${durStr}</div>
        <div style="font-size:13px;color:var(--muted)">Studied</div>
      </div>
    </div>
  `;
  
  html += renderChart(logs, tab);
  
  setHTML(cont, html);
  
  renderAllCardsAndFeedback(allLogs, tab);
}

async function renderAllCardsAndFeedback(allLogs, tab) {
  const { studySets } = await bundle();
  const sets = studySets;
  const cards = sets.flatMap(s => s.flashcards || []);
  const logs = getRangeLogs(allLogs, tab);
  
  let html = renderAllCards(cards) + renderFeedback(logs, cards, sets, allLogs);
  html += renderFeedbackRow();
  
  const c = document.getElementById("statsContent");
  if(c) appendHTML(c, html);
}

export function renderChart(logs, tab) {
  const title = tab === "week" ? "Reviews per day" : tab === "month" ? "Reviews per week" : "Reviews per month";
  let buckets = [];
  const now = new Date();
  
  if (tab === "week") {
    for (let i = 6; i >= 0; i--) {
      let d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push({ date: d, count: 0, label: i === 0 ? "Today" : ["S","M","T","W","T","F","S"][d.getDay()], isCur: i === 0 });
    }
    for (const l of logs) {
      const ld = new Date(l.reviewedAt);
      const daysAgo = Math.floor((now.getTime() - ld.getTime()) / (1000*3600*24));
      if (daysAgo >= 0 && daysAgo < 7) {
        buckets[6 - daysAgo].count++;
      }
    }
  } else if (tab === "month") {
    let d = new Date(now);
    d.setHours(0,0,0,0);
    let wks = [];
    while(wks.length < 5) {
      const day = d.getDay() || 7;
      let start = new Date(d);
      start.setDate(d.getDate() - day + 1);
      
      let label = start.toLocaleString("en-US", { month: "short", day: "numeric" });
      let isCur = wks.length === 0;
      if (isCur) label = "This wk";
      
      wks.unshift({ date: start, count: 0, label, isCur });
      d.setDate(d.getDate() - 7);
    }
    buckets = wks;
    
    for (const l of logs) {
      const ld = new Date(l.reviewedAt);
      for (let i=0; i<buckets.length; i++) {
        let bStart = buckets[i].date;
        let bEnd = new Date(bStart);
        bEnd.setDate(bStart.getDate() + 7);
        if (ld >= bStart && ld < bEnd) {
          buckets[i].count++;
          break;
        }
      }
    }
  } else {
    let curM = now.getMonth();
    let curY = now.getFullYear();
    for (let i = 11; i >= 0; i--) {
      let m = curM - i;
      let y = curY;
      while (m < 0) { m += 12; y--; }
      let d = new Date(y, m, 1);
      let label = i === 0 ? "This mo" : d.toLocaleString("en-US", { month: "short" });
      buckets.push({ m, y, count: 0, label, isCur: i === 0 });
    }
    for (const l of logs) {
      const ld = new Date(l.reviewedAt);
      for (const b of buckets) {
        if (ld.getMonth() === b.m && ld.getFullYear() === b.y) {
          b.count++; break;
        }
      }
    }
  }
  
  const max = Math.max(1, ...buckets.map(b => b.count));
  
  let html = `
    <div style="padding:16px;border-radius:16px;background:var(--surface);border:1px solid var(--border);display:flex;flex-direction:column;gap:14px">
      <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">${title}</div>
      <div style="height:128px;display:flex;align-items:flex-end;gap:8px" role="img" aria-label="Chart of ${title}">
  `;
  
  for (const b of buckets) {
    const height = Math.max(4, (b.count / max) * 84);
    const color = b.count === 0 ? "var(--surface-2, #1e2826)" : b.isCur ? "var(--primary, #34bcad)" : "var(--primary, #2c4a46)";
    const lblColor = b.isCur ? "var(--primary)" : "var(--faint, #6d7c78)";
    const valColor = b.isCur ? "var(--primary)" : "var(--muted)";
    const valStr = b.count > 0 ? `<div style="font-size:11px;font-weight:600;color:${valColor}">${b.count}</div>` : `<div style="height:14px"></div>`;
    const fw = b.isCur ? "700" : "500";
    
    html += `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px" aria-label="${b.label}: ${b.count} reviews">
        ${valStr}
        <div style="width:100%;border-radius:6px;background:${color};height:${height}px"></div>
        <div style="font-size:11px;font-weight:${fw};color:${lblColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${b.label}</div>
      </div>
    `;
  }
  
  html += `</div></div>`;
  return html;
}

export function renderAllCards(cards) {
  let newC = 0, learn = 0, due = 0, mast = 0;
  for (const c of cards) {
    if (!c.stability && c.repetitions === 0) newC++;
    else if (c.interval < 21) learn++;
    else mast++;
    if (c.dueDate && new Date(c.dueDate) < new Date()) {
      due++;
    }
  }
  
  const total = cards.length;
  if (total === 0) return "";
  
  const pNew = (newC / total) * 100;
  const pLearn = (learn / total) * 100;
  const pDue = (due / total) * 100;
  const pMast = (mast / total) * 100;
  
  return `
    <div style="padding:16px;border-radius:16px;background:var(--surface);border:1px solid var(--border);display:flex;flex-direction:column;gap:10px">
      <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">All cards</div>
      
      <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--surface-2)">
        <div style="width:${pNew}%;background:var(--faint)"></div>
        <div style="width:${pLearn}%;background:var(--warm)"></div>
        <div style="width:${pDue}%;background:var(--danger)"></div>
        <div style="width:${pMast}%;background:var(--success)"></div>
      </div>
      
      <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:var(--muted)">
        <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--faint)">?</span> New: ${newC}</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--warm)">?</span> Learning: ${learn}</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--danger)">?</span> To review: ${due}</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--success)">?</span> Mastered: ${mast}</div>
      </div>
    </div>
  `;
}

export function renderFeedback(logs, cards, sets, allLogs) {
  let html = `<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-top:8px">FEEDBACK</div>`;
  
  let insights = [];
  
  let backlogDue = 0;
  for (const c of cards) {
    if (c.dueDate && new Date(c.dueDate) < new Date()) backlogDue++;
  }
  const dailyGoal = 20;
  if (backlogDue > 3 * dailyGoal) {
    const k = Math.min(backlogDue, Math.floor(15 * 60 / 22));
    insights.push({
      priority: 1,
      dot: "var(--warm, #ffb300)",
      title: "Your backlog is growing",
      body: `${backlogDue} cards are overdue. A 15-minute session today clears ${k}.`,
      action: "Start 15 min"
    });
  }
  
  let setStats = {};
  let globalRevs = 0, globalRet = 0;
  for (const l of logs) {
    globalRevs++;
    if (l.grade === 4 || l.grade === 5) globalRet++;
    const set = sets.find(s => cards.find(c => c.id === l.cardId)?.set_id === s.id);
    if (set) {
      if (!setStats[set.id]) setStats[set.id] = { revs: 0, ret: 0, name: set.title };
      setStats[set.id].revs++;
      if (l.grade === 4 || l.grade === 5) setStats[set.id].ret++;
    }
  }
  
  const avgRet = globalRevs > 0 ? (globalRet / globalRevs) * 100 : 0;
  let slipping = null;
  for (const id in setStats) {
    const s = setStats[id];
    if (s.revs >= 20) {
      const ret = (s.ret / s.revs) * 100;
      if (ret <= avgRet - 10) {
        if (!slipping || ret < (slipping.ret / slipping.revs) * 100) {
          slipping = s;
        }
      }
    }
  }
  
  if (slipping) {
    let codeHeuristic = false;
    const modeStr = codeHeuristic ? "Type answers" : "Flashcards";
    const modeTip = codeHeuristic ? "Typing answers makes you recall, not just recognise." : "A short review today brings it back.";
    insights.push({
      priority: 2,
      dot: "var(--warm, #ffb300)",
      title: `${slipping.name} is slipping`,
      body: `Retention ${Math.round((slipping.ret / slipping.revs) * 100)}%, the lowest of your sets. ${modeTip}`,
      action: `Review with ${modeStr}`
    });
  }
  
  let streak = 0;
  let studiedToday = false;
  const now = new Date();
  for (const l of allLogs) {
    const ld = new Date(l.reviewedAt);
    if (ld.getDate() === now.getDate() && ld.getMonth() === now.getMonth() && ld.getFullYear() === now.getFullYear()) {
      studiedToday = true;
      break;
    }
  }
  
  if (streak >= 3 && !studiedToday && now.getHours() >= 18) {
    insights.push({
      priority: 3,
      dot: "var(--warm, #ffb300)",
      title: `Keep your ${streak}-day streak`,
      body: "You haven't studied today. A few cards before midnight keeps it going."
    });
  }
  
  let buckets = { morn: {revs:0, ret:0}, aft: {revs:0, ret:0}, eve: {revs:0, ret:0} };
  for (const l of logs) {
    const h = new Date(l.reviewedAt).getHours();
    let b = h >= 5 && h < 12 ? buckets.morn : h >= 12 && h < 18 ? buckets.aft : buckets.eve;
    b.revs++;
    if (l.grade === 4 || l.grade === 5) b.ret++;
  }
  
  let validBuckets = Object.keys(buckets).filter(k => buckets[k].revs >= 30);
  if (validBuckets.length > 1) {
    let bestK = null, bestRet = 0, otherSum = 0, otherCount = 0;
    for (const k of validBuckets) {
      const ret = (buckets[k].ret / buckets[k].revs) * 100;
      if (ret > bestRet) {
        bestRet = ret;
        bestK = k;
      }
    }
    for (const k of validBuckets) {
      if (k !== bestK) {
        otherSum += (buckets[k].ret / buckets[k].revs) * 100;
        otherCount++;
      }
    }
    const otherAvg = otherSum / otherCount;
    if (bestRet >= otherAvg + 8) {
      const names = { morn: "Mornings", aft: "Afternoons", eve: "Evenings" };
      const bodies = { morn: "before noon", aft: "in the afternoon", eve: "after 6 pm" };
      insights.push({
        priority: 4,
        dot: "var(--success, #4caf50)",
        title: `${names[bestK]} work for you`,
        body: `You recall ${Math.round(bestRet - otherAvg)}% more in sessions ${bodies[bestK]}.`
      });
    }
  }
  
  insights.sort((a,b) => a.priority - b.priority);
  insights = insights.slice(0, 3);
  
  for (const i of insights) {
    let act = i.action ? `<button class="btn" style="height:36px;margin-left:18px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--primary);font-size:14px;font-weight:600">${i.action}</button>` : "";
    html += `
      <div style="padding:16px;border-radius:16px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:flex-start;gap:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:${i.dot};margin-top:6px;flex-shrink:0"></div>
        <div style="display:flex;flex-direction:column;gap:4px;flex:1">
          <div style="font-size:15px;font-weight:600;color:var(--ink)">${i.title}</div>
          <div style="font-size:14px;line-height:1.45;color:var(--muted)">${i.body}</div>
          ${act}
        </div>
      </div>
    `;
  }
  
  return html;
}
