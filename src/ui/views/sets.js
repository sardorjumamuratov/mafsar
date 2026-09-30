import { classifyUrl } from "../../storage/sources.js";
import { queryActiveTab, app, bundle, isAIChatTab, esc, send, setFor, setHTML, sourceLabel, summarize, toast, topOfView } from "../core.js";
import { setNav, showChrome } from "../nav.js";
import { parseShareCode } from ".././share-link.js";
import { setSharedPreview, sharedPreview } from "../views/teams.js";
import { addSession, saveStudySet, uid } from "../../storage/store.js";
import { initSchedule } from "../../../shared/srs.js";
import { syncNow } from "../../sync/sync.js";
import { renderSetDetail } from "../views/set-detail.js";

export function setRow(session, s) {
  const dueTag = s.due
    ? `<span class="tag dot" style="color:var(--warm)">${s.due} due</span>`
    : s.progress === 100 && s.total
    ? `<span class="tag">Mastered</span>`
    : `<span class="tag">0 due</span>`;
  return `
    <div class="setrow" data-action="open-set" data-id="${esc(session.id)}">
      <div class="top"><div class="name">${esc(session.title || "Untitled")}</div>${dueTag}</div>
      <div class="bar ${s.progress === 100 && s.total ? "ok" : ""}"><i style="width:${s.total ? s.progress : 0}%"></i></div>
      <div class="prog-line"><span>${s.total ? s.progress + "% mastered" : "Not generated"}</span><span>${esc(sourceLabel(session))}</span></div>
    </div>`;
}

let captureAnswerToken = 0;

/**
 * Keeps kind/origin on "Capture this page" in step with the active tab, so the
 * click handler can request site access before any await. The browser only
 * honours a permission request made directly inside the click.
 */
export async function refreshCaptureCurrentButton() {
  const btn = document.getElementById("captureCurrentBtn");
  if (!btn) return;
  const tab = await queryActiveTab();
  const source = classifyUrl(tab?.url || "");
  if (source.kind === "page") {
    delete btn.dataset.kind;
    delete btn.dataset.origin;
    return;
  }
  btn.dataset.kind = source.kind;
  btn.dataset.origin = source.origin;
}

export async function refreshCaptureAnswerButton() {
  const btn = document.getElementById("captureAnswerBtn");
  if (!btn) return;
  
  const token = Math.random();
  captureAnswerToken = token;
  
  const chatTab = await isAIChatTab();
  if (captureAnswerToken !== token) return; // stale response
  
  btn.classList.toggle("hidden", !chatTab.ok);
  if (chatTab.url) {
    btn.dataset.origin = new URL(chatTab.url).origin;
  } else {
    delete btn.dataset.origin;
  }
}

// ================================================================ SETS
export async function renderSets() {
  setNav("sets");
  showChrome(true);
  const { sessions, studySets } = await bundle();
  // The capture button starts hidden and is revealed after paint by
  // refreshCaptureAnswerButton(). Awaiting isAIChatTab here used to block the
  // whole list for up to 2s on a tab whose content script never answers.

  setHTML(app, `
    <div class="view">
      <div class="ahd"><div class="h-title">Your sets</div>
        </div>
      ${
        sessions.length
          ? sessions.map((s) => setRow(s, summarize(setFor(s.id, studySets)))).join("")
          : `<div class="empty"><div class="big">???</div>No sets yet.<br>Capture a page using the dock below, or tap Import.</div>No sets yet.<br>Capture an AI conversation with <b>Save to Mafsar</b>, or import from Quizlet.</div>`
      }
      
    </div>`);
  topOfView();
  
}



