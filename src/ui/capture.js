import { queryActiveTab, send, sendToTab, toast } from "./core.js";
import { renderSetDetail } from "./views/set-detail.js";
import { classifyUrl } from "../storage/sources.js";
import { addSession, saveStudySet, uid } from "../storage/store.js";
import { lookupShare, paintSharePreview, setSharedPreview, importSharedSet, sharedPreview } from "./views/import.js";
import { isAIChatTab } from "./core.js";
import { renderYou } from "./views/you.js";
import { openSheet, closeSheet } from "./sheet.js";
import { renderImport } from "./views/import.js";

// Keep track of original text to restore it after capturing
let currentOriginalText = "Capture page";
let answerOriginalText = "Capture answer";

function setCapturingState(isCapturing, btnElement) {
  const cBtn = document.getElementById("captureCurrentBtn");
  const aBtn = document.getElementById("captureAnswerBtn");
  const addBtn = document.getElementById("dockAddBtn");
  
  if (isCapturing) {
    if (cBtn) {
      cBtn.style.width = cBtn.offsetWidth + "px";
      cBtn.disabled = true;
    }
    if (aBtn) {
      aBtn.style.width = aBtn.offsetWidth + "px";
      aBtn.disabled = true;
    }
    if (addBtn) addBtn.disabled = true;
    
    if (btnElement) {
      const lbl = btnElement.querySelector(".dock-lbl");
      if (lbl) lbl.textContent = "Capturing...";
    }
  } else {
    if (cBtn) {
      cBtn.style.width = "";
      cBtn.disabled = false;
      const lbl = cBtn.querySelector(".dock-lbl");
      if (lbl) lbl.textContent = currentOriginalText;
    }
    if (aBtn) {
      aBtn.style.width = "";
      aBtn.disabled = false;
      const lbl = aBtn.querySelector(".dock-lbl");
      if (lbl) lbl.textContent = answerOriginalText;
    }
    if (addBtn) addBtn.disabled = false;
  }
}

function handleCaptureResponse(r, kind, origin) {
  if (r.generated) {
    let msg = "New set from page В· " + r.cards + " cards";
    if (kind === "youtube") msg = "New set from video В· " + r.cards + " cards";
    else if (kind === "pdf") msg = "New set from PDF В· " + r.cards + " cards";
    else if (kind === "answer") msg = "New set from answer В· " + r.cards + " cards";
    else if (kind === "text") msg = "New set В· " + r.cards + " cards";
    
    toast(msg, 3000, "Open", () => {
      renderSetDetail(r.session.id);
    });
  } else {
    if (r.reason && r.reason.includes("signed in")) {
      toast("Saved В· sign in to make cards", 3000, "Sign in", () => { renderYou(); });
    } else if (r.reason && (r.reason.includes("quota") || r.reason.includes("limit"))) {
      toast("Saved В· you've used this month's sets", 3000, "Plans", () => { renderYou(); });
    } else if (r.reason) {
      toast("Saved В· couldn't make cards", 3000, "Open", () => { renderSetDetail(r.session.id); });
    } else {
      toast("Couldn't capture this page", 3000, "Retry", () => {
        if (kind === "answer") captureLastAnswer(document.getElementById("captureAnswerBtn"));
        else captureCurrent(document.getElementById("captureCurrentBtn"));
      });
    }
  }
}

export async function captureCurrent(btnElement) {
  const kind = btnElement?.dataset.kind;
  const origin = btnElement?.dataset.origin;
  
  if ((kind === "youtube" || kind === "pdf") && origin && origin !== "file://") {
    const granted = await new Promise((resolve) => {
      try {
        chrome.permissions.request({ origins: [origin + "/*"] }, (ok) => resolve(!!ok));
      } catch {
        resolve(false);
      }
    });
    if (!granted) return toast("Mafsar needs access to this site to capture it.");
  }
  
  const tab = await queryActiveTab();
  if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("moz-extension://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:") || tab.url.includes("chrome.google.com/webstore") || tab.url.includes("addons.mozilla.org")) {
    return toast("This page can't be captured");
  }
  
  setCapturingState(true, btnElement);
  try {
    const resp = await sendToTab(tab.id, { type: "CAPTURE_ACTIVE" });
    let r;
    if (resp?.ok) {
      r = await send({ type: "SAVE_AND_GENERATE", payload: resp.session });
    } else {
      r = await send({ type: "CAPTURE_UNIVERSAL", tabId: tab.id });
    }
    handleCaptureResponse(r, kind || "page", origin);
  } catch (e) {
    toast("Couldn't capture this page", 3000, "Retry", () => {
      if (btnElement && btnElement.id === "captureAnswerBtn") captureLastAnswer(btnElement);
      else captureCurrent(btnElement);
    });
  } finally {
    setCapturingState(false);
  }
}

export async function captureLastAnswer(btnElement) {
  const origin = btnElement?.dataset.origin;
  const isAi = btnElement?.dataset.isAi === "true";
  
  if (!isAi) {
    return toast("No answer found on this page");
  }
  
  if (origin) {
    try {
      const granted = await new Promise((resolve) => {
        chrome.permissions.request({ origins: [origin + "/*"] }, (ok) => resolve(!!ok));
      });
      if (!granted) return toast("Mafsar needs access to this site to capture it.");
    } catch {
      // ignore
    }
  }

  setCapturingState(true, btnElement);
  try {
    const tab = await queryActiveTab();
    if (!tab?.id) throw new Error("No tab");
    const r = await send({ type: "CAPTURE_LAST_ANSWER_SMART", tabId: tab.id });
    handleCaptureResponse(r, "answer", origin);
  } catch (e) {
    toast("Couldn't capture this page", 3000, "Retry", () => {
      if (btnElement && btnElement.id === "captureAnswerBtn") captureLastAnswer(btnElement);
      else captureCurrent(btnElement);
    });
  } finally {
    setCapturingState(false);
  }
}

export async function refreshCaptureDock() {
  const dock = document.getElementById("captureDock");
  const answerBtn = document.getElementById("captureAnswerBtn");
  const currentBtn = document.getElementById("captureCurrentBtn");
  if (!dock || !answerBtn || !currentBtn) return;

  const tab = await queryActiveTab();
  const source = classifyUrl(tab?.url || "");

  if (source.kind === "page") {
    delete currentBtn.dataset.kind;
    delete currentBtn.dataset.origin;
    currentOriginalText = "Capture page";
  } else {
    currentBtn.dataset.kind = source.kind;
    currentBtn.dataset.origin = source.origin;
    currentOriginalText = source.kind === "youtube" ? "Capture video" : "Capture PDF";
  }
  
  const lblC = currentBtn.querySelector(".dock-lbl");
  if (lblC && !currentBtn.disabled) lblC.textContent = currentOriginalText;
  
  const chatTab = await isAIChatTab();
  if (chatTab.ok && chatTab.url) {
    answerBtn.dataset.origin = new URL(chatTab.url).origin;
    answerBtn.dataset.isAi = "true";
  } else {
    delete answerBtn.dataset.origin;
    answerBtn.dataset.isAi = "false";
  }
}

// The "Add a set" rows. Static markup: nothing here is user data.
const ADD_ROWS = [
  ["add-import", "Import file", "CSV, Anki or Quizlet",
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'],
  ["add-paste", "Paste text", "Make cards from notes you paste",
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'],
  ["add-create", "Create empty set", "Start from scratch and add cards yourself",
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'],
  ["add-share", "Enter a share code", "Add a set someone shared with you",
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'],
];

export function openAddMenu() {
  const rows = ADD_ROWS.map(([action, title, sub, icon]) => `
    <button class="sheet-row" data-action="${action}" style="display:flex;align-items:center;gap:14px;padding:12px;border:none;border-radius:12px;background:transparent;text-align:left;cursor:pointer;width:100%">
      <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
      </div>
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">${title}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${sub}</div>
      </div>
    </button>`).join("");
  const html = `<div style="display:flex;flex-direction:column;gap:2px">${rows}</div>`;
  
  openSheet("Add a set", html, true);
  
  const sheet = document.getElementById("sheet");
  sheet.querySelectorAll(".sheet-row").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const act = e.currentTarget.dataset.action;
      closeSheet();
      if (act === "add-import") {
        renderImport();
      } else if (act === "add-paste") {
        setTimeout(openPasteMenu, 200);
      } else if (act === "add-create") {
        setTimeout(openCreateEmptyMenu, 200);
      } else if (act === "add-share") {
        setTimeout(openShareCodeMenu, 200);
      }
    });
  });
}

function openPasteMenu() {
  const html = '<div style="display:flex;flex-direction:column;gap:12px;padding:16px 20px">' +
    '<textarea id="pasteText" placeholder="Paste your notes here..." style="width:100%;min-height:140px;max-height:400px;background:var(--bg-surface);border:1px solid var(--border-control);border-radius:12px;padding:12px;color:var(--text-primary);font-size:15px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div id="pasteCount" style="font-size:13px;color:var(--text-muted)">0 / 30,000</div>' +
      '<button id="pasteSubmit" class="btn btn-primary" disabled style="height:50px;border-radius:12px;padding:0 24px">Make cards</button>' +
    '</div>' +
  '</div>';
  openSheet("Paste text", html, false);
  
  const ta = document.getElementById("pasteText");
  const count = document.getElementById("pasteCount");
  const btn = document.getElementById("pasteSubmit");
  
  ta.addEventListener("input", () => {
    const len = ta.value.length;
    count.textContent = len.toLocaleString() + " / 30,000";
    if (len > 30000) {
      count.style.color = "var(--danger-text)";
      btn.disabled = true;
    } else if (len > 0) {
      count.style.color = "var(--text-muted)";
      btn.disabled = false;
    } else {
      count.style.color = "var(--text-muted)";
      btn.disabled = true;
    }
  });
  
  btn.addEventListener("click", async () => {
    const text = ta.value;
    if (!text || text.length > 30000) return;
    closeSheet();
    setCapturingState(true);
    try {
      const sessionRecord = {
        title: text.slice(0, 40).trim() + (text.length > 40 ? "..." : ""),
        url: "",
        source: "text",
        sourceLabel: "TXT",
        messages: [{ role: "user", content: text }],
        capturedAt: Date.now()
      };
      const r = await send({ type: "SAVE_AND_GENERATE", payload: sessionRecord });
      handleCaptureResponse(r, "text", null);
    } catch (e) {
      toast(e.message);
    } finally {
      setCapturingState(false);
    }
  });
}

function openCreateEmptyMenu() {
  const html = '<div style="display:flex;flex-direction:column;gap:12px;padding:16px 20px">' +
    '<input type=\"text\" id=\"emptyTitle\" placeholder=\"Name your set\" style=\"width:100%;height:44px;background:var(--bg-surface);border:1px solid var(--border-control);border-radius:12px;padding:0 12px;color:var(--text-primary);font-size:15px;font-family:inherit;box-sizing:border-box\" autofocus />' +
    '<button id="emptySubmit" class="btn btn-primary" disabled style="height:50px;border-radius:12px">Create</button>' +
  '</div>';
  openSheet("Create empty set", html, false);
  
  const inp = document.getElementById("emptyTitle");
  const btn = document.getElementById("emptySubmit");
  
  inp.addEventListener("input", () => { btn.disabled = !inp.value.trim(); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) btn.click(); });
  
  btn.addEventListener("click", async () => {
    const title = inp.value.trim();
    if (!title) return;
    closeSheet();
    try {
      const now = Date.now();
      const session = await addSession({
        source: "manual", sourceLabel: "ME", title, url: "",
        capturedAt: now, messages: [], importedCount: 0
      });
      await saveStudySet({ sessionId: session.id, title, createdAt: now, flashcards: [], quiz: [] });
      renderSetDetail(session.id);
    } catch (e) { toast(e.message); }
  });
}

function openShareCodeMenu() {
  const html = '<div style="display:flex;flex-direction:column;gap:12px;padding:16px 20px">' +
    '<input type=\"text\" id=\"shareCodeInput\" placeholder=\"Enter share code\" style=\"width:100%;height:44px;background:var(--bg-surface);border:1px solid var(--border-control);border-radius:12px;padding:0 12px;color:var(--text-primary);font-size:15px;font-family:inherit;box-sizing:border-box;text-transform:uppercase\" autofocus />' +
    '<button id="shareCodeSubmit" class="btn btn-primary" disabled style="height:50px;border-radius:12px">Look up</button>' +
  '</div>';
  openSheet("Enter a share code", html, false);
  
  const inp = document.getElementById("shareCodeInput");
  const btn = document.getElementById("shareCodeSubmit");
  
  inp.addEventListener("input", () => { btn.disabled = !inp.value.trim(); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) btn.click(); });
  
  btn.addEventListener("click", async () => {
    const code = inp.value.trim().toUpperCase();
    if (!code) return;
    btn.disabled = true;
    btn.textContent = "Looking up...";
    try {
      // Defer to the existing view logic
      const codeInput = document.createElement("input");
      codeInput.id = "shareCode";
      codeInput.value = code;
      document.body.appendChild(codeInput);
      
      const out = document.createElement("div");
      out.id = "sharePreview";
      document.body.appendChild(out);
      
      try {
        await lookupShare();
        if (sharedPreview) {
          const t = document.getElementById("toast");
          if (t && t.textContent.includes("already added")) {
             // already shown
          } else {
             await importSharedSet();
          }
        }
      } finally {
        document.body.removeChild(codeInput);
        document.body.removeChild(out);
      }
      
      btn.disabled = false;
      btn.textContent = "Look up";
      closeSheet();
    } catch (e) {
      toast(e.message);
      btn.disabled = false;
      btn.textContent = "Look up";
    }
  });
}
