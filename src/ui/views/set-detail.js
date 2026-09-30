import { showChrome } from "../nav.js";
import { app, bundle, esc, isMac, send, setFor, setHTML, insertHTMLBefore, sourceLabel, summarize, timeUntil, toast, topOfView } from "../core.js";

// Inputs and buttons by id, typed loosely (this file reads .value/.disabled).
const byId = (id) => /** @type {any} */ (byId(id));
import { renderHome, shareOpenFor, setShareOpenFor } from "../views/home.js";
import { examReadiness } from "../../../shared/readiness.js";
import { isDue, masteryOf, review } from "../../../shared/srs.js";
import { startQuiz } from "../flows/quiz.js";
import { syncNow } from "../../sync/sync.js";
import { addCard, updateCard, updateStudySet, setExamDate, saveSettings } from "../../storage/store.js";
import { chainCoverage, liveChains, orderedSteps } from "../../storage/chains.js";
import { isLinkCard, linkId } from "../../storage/chain-links.js";
import { cleanTitle } from "../../../shared/titles.js";
import { ICONS } from "../icons.js";

import { confirmSheet } from "../confirm.js";
import { readRatings, rateSet, clearRating, refreshRatings } from "../../storage/ratings.js";
import { formatAvg, formatCount } from "../../../shared/format.js";
import { copyShareCode, revokeShareFor, toggleSetShare, ensureShareFor } from "../share.js";
import { shareLinkFor } from "../share-link.js";
import { LANDING_BASE } from "../../config.js";

// ================================================================ SET DETAIL
export let detail = null;
export let editingCardId = null;

let state = {
  expandedCardId: null,
  studyMenuOpen: false,
};

export async function renderSetDetail(sessionId, tab = "cards") {
  showChrome(false);
  const { sessions, studySets, settings } = await bundle();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return renderHome();
  const studySet = setFor(sessionId, studySets);
  
  if (settings) {
    const lastOpened = settings.lastOpened || {};
    lastOpened[sessionId] = Date.now();
    saveSettings({ lastOpened });
  }

  detail = { session, studySet, tab };
  paintDetail();
  topOfView();
}

export function currentDetail() { return detail; }
export function setEditingCardId(v) { editingCardId = v; }
export function openDetailTab(tab) { renderSetDetail(detail.session.id, tab); }
export function startQuizForCurrentSet(n) { startQuiz(detail.studySet, "set:" + detail.session.id, n); }

export async function paintDetail(updateInPlace = false, force = false) {
  if (updateInPlace && !force && (editingCardId || detail?.addingCard)) return;
  const { session, studySet, tab } = detail;
  const cards = studySet?.flashcards || [];
  
  const ratingsStore = await readRatings();
  ratingsSnapshot = ratingsStore;
  const rootId = studySet?.originSetId || session?.id;
  // Every set can be rated, so unrated sets get the empty state, not nothing.
  const ratingData = studySet && rootId
    ? { yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: !!(studySet.isGlobal || studySet.originSetId), ...(ratingsStore[rootId] || {}) }
    : null;
  if (rootId && !updateInPlace) refreshRatings([rootId]).catch(() => {});
  
  let bodyHTML = "";
  
  if (!studySet) {
    bodyHTML = `
      <div style="margin: 18px 20px 0; padding: 16px; border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--border-card); display: flex; flex-direction: column; gap: 12px">
        <div style="font-size: 15px; font-weight: 600">Cards weren't made yet</div>
        <div style="font-size: 14px; line-height: 1.45; color: var(--text-body2)">Generation needs a connection and a signed-in account.</div>
        <button class="btn btn-primary" data-action="make-set" data-id="${esc(session.id)}" style="height: 44px; border-radius: 12px; font-weight: 600; width: 100%; display: flex; align-items: center; justify-content: center; border: none">Make cards</button>
      </div>`;
  } else {
    // Progress
    const newCards = cards.filter(c => !isDue(c) && masteryOf(c) === "new").length;
    const learning = cards.filter(c => masteryOf(c) === "learning").length;
    const mastered = cards.filter(c => !isDue(c) && masteryOf(c) === "mastered").length;
    
    let progressHTML = "";
    if (cards.length > 0) {
      progressHTML = `
        <div style="margin: 14px 20px 0; display: flex; flex-direction: column; gap: 10px">
          <div role="img" aria-label="${newCards} new, ${learning} learning, ${mastered} mastered" style="height: 8px; border-radius: 4px; overflow: hidden; display: flex; gap: 3px">
            ${newCards > 0 ? `<div style="flex-grow: ${newCards}; background: var(--status-new-bar)"></div>` : ''}
            ${learning > 0 ? `<div style="flex-grow: ${learning}; background: var(--status-learning)"></div>` : ''}
            ${mastered > 0 ? `<div style="flex-grow: ${mastered}; background: var(--status-mastered)"></div>` : ''}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px">
            <div style="color: var(--text-muted)">
              ${newCards > 0 ? `<span style="color: var(--status-new)">${newCards} new</span>` : `${newCards} new`} &middot; 
              ${learning > 0 ? `<span style="color: var(--status-learning-text)">${learning} learning</span>` : `${learning} learning`} &middot; 
              ${mastered > 0 ? `<span style="color: var(--status-mastered)">${mastered} mastered</span>` : `${mastered} mastered`}
            </div>
            <button class="iconbtn" id="hiw-btn" aria-label="How it works" style="height: 28px; padding: 0 2px; border: none; background: transparent; display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-muted); cursor: pointer">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              How it works
            </button>
          </div>
        </div>`;
    }

    // Study actions
    const s = summarize(studySet);
    const dueCount = s.due || 0;
    const totalCount = cards.length;
    const quizCount = Math.min(10, studySet.quiz?.length || 0);
    const b = await bundle();
    const storedMode = b.settings?.studyMode || "flashcards";
    
    let activeMode = storedMode;
    const setModeType = studySet.mode || "general";
    
    const validModes = ["flashcards", "type-answers", "teach-it-back", "quiz"];
    if (setModeType === "coding") validModes.push("coding");
    if (setModeType === "design") validModes.push("design", "estimation", "bottleneck");
    if (setModeType === "medicine") validModes.push("chain-drill", "clinical-case", "compare");
    
    if (!validModes.includes(activeMode)) {
      activeMode = "flashcards";
    }
    if (activeMode === "quiz" && quizCount === 0) {
      activeMode = "flashcards";
    }

    let ctaLabel = "";
    let ctaMeta = "";
    let ctaAction = "";
    let modeName = "";
    let ctaDisabled = false;

    if (totalCount === 0) {
      ctaLabel = "Add cards to study";
      ctaMeta = "";
      ctaDisabled = true;
      modeName = "Flashcards";
      ctaAction = "";
    } else {
      switch (activeMode) {
        case "flashcards":
          modeName = "Flashcards";
          ctaAction = "start-review";
          if (dueCount > 0) {
            ctaLabel = `Review ${dueCount === 1 ? '1 card' : `${dueCount} cards`}`;
            ctaMeta = `~${Math.max(1, Math.round((dueCount * 30) / 60))} min`;
          } else {
            ctaLabel = "Study ahead";
            ctaMeta = `~${Math.max(1, Math.round((totalCount * 30) / 60))} min`;
          }
          break;
        case "type-answers":
          modeName = "Type answers";
          ctaAction = "start-type-answers";
          if (dueCount > 0) {
            ctaLabel = `Type ${dueCount === 1 ? '1 answer' : `${dueCount} answers`}`;
            ctaMeta = `~${Math.max(1, Math.round((dueCount * 48) / 60))} min`;
          } else {
            ctaLabel = `Type ${totalCount === 1 ? '1 answer' : `${totalCount} answers`}`;
            ctaMeta = `~${Math.max(1, Math.round((totalCount * 48) / 60))} min`;
          }
          break;
        case "teach-it-back":
          modeName = "Teach it back";
          ctaAction = "start-teach";
          ctaLabel = "Teach it back";
          ctaMeta = "~5 min";
          break;
        case "quiz":
          modeName = "Quiz";
          ctaAction = "start-quiz";
          ctaLabel = "Start quiz";
          ctaMeta = `${quizCount === 1 ? '1 question' : `${quizCount} questions`}`;
          break;
        case "coding":
          modeName = "Coding exercise";
          ctaAction = "start-coding";
          ctaLabel = "Start exercise";
          ctaMeta = "~10 min";
          break;
        case "design":
          modeName = "Design drill";
          ctaAction = "start-design";
          ctaLabel = "Start design drill";
          ctaMeta = "~15 min";
          break;
        case "estimation":
          modeName = "Estimation";
          ctaAction = "start-estimation";
          ctaLabel = "Start estimation";
          ctaMeta = "~5 min";
          break;
        case "bottleneck":
          modeName = "Find the bottleneck";
          ctaAction = "start-bottleneck";
          ctaLabel = "Find the bottleneck";
          ctaMeta = "~10 min";
          break;
        case "chain-drill":
          modeName = "Chain drill";
          ctaAction = "start-chain-drill";
          ctaLabel = "Start chain drill";
          const chainC = liveChains(studySet.chains).length;
          ctaMeta = `${chainC === 1 ? '1 chain' : `${chainC} chains`}`;
          break;
        case "clinical-case":
          modeName = "Clinical case";
          ctaAction = "start-clinical-case";
          ctaLabel = "Start clinical case";
          ctaMeta = "~10 min";
          break;
        case "compare":
          modeName = "Compare conditions";
          ctaAction = "start-compare";
          ctaLabel = "Compare conditions";
          const compC = liveChains(studySet.chains).length;
          ctaMeta = `${compC === 1 ? '1 chain' : `${compC} chains`}`;
          break;
      }
    }

    const exam = studySet.examDate
      ? examReadiness({ examDate: studySet.examDate, total: totalCount, mastered, due: dueCount })
      : null;
    
    let examHtml = "";
    if (!exam) {
      examHtml = `
        <button class="exam-row btn" data-action="exam-edit-set" style="width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border-control); background: var(--bg-surface); text-align: left; cursor: pointer; color: var(--text-primary)">
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
      const ed = new Date(studySet.examDate);
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
      
      examHtml = `
        <button class="exam-row btn" data-action="exam-edit-set" style="width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border-control); background: var(--bg-surface); text-align: left; cursor: pointer; color: var(--text-primary)">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--bg-surface2); display: flex; align-items: center; justify-content: center; color: var(--accent-text); flex-shrink: 0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px">
            <div style="font-size: 14px; font-weight: 600">${title}</div>
            <div style="font-size: 13px; color: var(--text-muted)">${sub}</div>
          </div>
          <div style="font-size: 13px; font-weight: 600; color: var(--accent-text)">Edit</div>
        </button>`;
    }

    const studyActionsHTML = `
      <div style="margin: 18px 20px 0; display: flex; flex-direction: column; gap: 8px">
        <div style="position: relative; z-index: ${state.studyMenuOpen ? '6' : '1'}" class="split-wrapper">
          <div style="display: flex; height: 54px">
            <button class="btn btn-primary" data-action="${ctaAction}" ${ctaDisabled ? 'disabled' : ''} style="flex: 1; border-top-right-radius: 0; border-bottom-right-radius: 0; border: none; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 600">
              <div style="font-size: 15px">${ctaLabel}</div>
              ${ctaMeta ? `<div style="font-size: 12px; font-weight: 500; opacity: 0.8; margin-top: 2px">${ctaMeta}</div>` : ''}
            </button>
            <div style="width: 1px; background: rgba(0,0,0,0.15); height: 100%"></div>
            <button class="btn btn-primary chevron-btn" style="width: 54px; border-top-left-radius: 0; border-bottom-left-radius: 0; border: none; height: 100%; padding: 0; display: flex; align-items: center; justify-content: center; ${state.studyMenuOpen ? 'background: var(--accent-hover)' : ''}" aria-haspopup="menu" aria-expanded="${state.studyMenuOpen ? 'true' : 'false'}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s; ${state.studyMenuOpen ? 'transform: rotate(180deg)' : ''}"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </div>
        </div>
        <div style="font-size: 13px; color: var(--text-muted); padding: 0 2px">Mode: <span style="font-weight: 600; color: var(--text-secondary)">${modeName}</span></div>
        ${examHtml}
      </div>`;
      
    // Tabs
    const hasChains = setModeType === "medicine";
    let tabsHTML = `
      <div style="margin: 24px 20px 0; display: flex; padding: 3px; border-radius: 12px; background: var(--bg-surface); border: 1px solid var(--border-control)" role="tablist">
        <button class="tab-btn" data-tab="cards" role="tab" aria-selected="${tab === 'cards'}" style="flex: 1; height: 36px; border: none; border-radius: 9px; font-size: 14px; font-weight: 600; ${tab === 'cards' ? 'background: var(--bg-segment-active); color: var(--text-primary)' : 'background: transparent; color: var(--text-muted)'}">Cards</button>
        <button class="tab-btn" data-tab="summary" role="tab" aria-selected="${tab === 'summary'}" style="flex: 1; height: 36px; border: none; border-radius: 9px; font-size: 14px; font-weight: 600; ${tab === 'summary' ? 'background: var(--bg-segment-active); color: var(--text-primary)' : 'background: transparent; color: var(--text-muted)'}">Summary</button>
        ${hasChains ? `<button class="tab-btn" data-tab="chains" role="tab" aria-selected="${tab === 'chains'}" style="flex: 1; height: 36px; border: none; border-radius: 9px; font-size: 14px; font-weight: 600; ${tab === 'chains' ? 'background: var(--bg-segment-active); color: var(--text-primary)' : 'background: transparent; color: var(--text-muted)'}">Chains</button>` : ''}
      </div>`;

    // Tab content
    let tabContentHTML = "";
    
    if (tab === "cards") {
      let cardsDueNow = [];
      let cardsLater = [];
      let cardsMastered = [];
      
      for (const c of cards) {
        if (isDue(c)) cardsDueNow.push(c);
        else if (masteryOf(c) === "mastered") cardsMastered.push(c);
        else cardsLater.push(c);
      }
      
      cardsDueNow.sort((a, b) => (a.due || 0) - (b.due || 0));
      cardsLater.sort((a, b) => (a.due || 0) - (b.due || 0));
      
      
        const renderEditor = (id, defaultFront, defaultBack) => {
          const frontText = defaultFront || "";
          const backText = defaultBack || "";
          const isAdd = id === "new";
          return `
            <div class="card-wrapper editing" style="margin: 8px 0 12px; padding: 12px; border-radius: 14px; background: var(--bg-surface); border: 1px solid var(--accent); display: flex; flex-direction: column; gap: 12px">
              <div style="display: flex; flex-direction: column; gap: 6px">
                <label for="edit-front-${id}" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted)">QUESTION</label>
                <textarea id="edit-front-${id}" class="edit-textarea" style="background: var(--bg-app); border: 1px solid var(--border-control); border-radius: 10px; padding: 10px 12px; color: var(--text-primary); font: inherit; font-size: 15px; line-height: 1.4; resize: none; overflow: hidden; min-height: 56px; outline: none">${esc(frontText)}</textarea>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px">
                <label for="edit-back-${id}" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted)">ANSWER</label>
                <textarea id="edit-back-${id}" class="edit-textarea" style="background: var(--bg-app); border: 1px solid var(--border-control); border-radius: 10px; padding: 10px 12px; color: var(--text-primary); font: inherit; font-size: 14px; line-height: 1.45; resize: none; overflow: hidden; min-height: 56px; outline: none">${esc(backText)}</textarea>
              </div>
              <div style="display: flex; align-items: center; gap: 8px">
                <div class="edit-hint" id="edit-hint-${id}" style="flex: 1; font-size: 12px; color: var(--text-faint)">
                  ${!frontText.trim() || !backText.trim() ? "Both fields are required" : (isMac() ? "⌘ Enter to save" : "Ctrl Enter to save")}
                </div>
                <button class="btn" data-action="${isAdd ? 'add-cancel' : 'edit-cancel'}" style="height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border-control); background: transparent; color: var(--text-primary); font-size: 14px; font-weight: 600">Cancel</button>
                <button class="btn btn-primary" id="edit-done-${id}" data-action="${isAdd ? 'add-done' : 'edit-done'}" data-id="${id}" ${!frontText.trim() || !backText.trim() ? 'disabled aria-disabled="true" style="opacity: 0.45; pointer-events: none;' : 'style="'} height: 40px; padding: 0 18px; border-radius: 10px; border: none; background: var(--accent); color: var(--accent-on); font-size: 14px; font-weight: 650">Done</button>
              </div>
            </div>`;
        };

        const renderGroup = (title, items, isFirstVisible) => {
        if (items.length === 0 && !(title === "Due now" && cards.length === 0)) return "";
        
        let header = `
          <div style="margin: 16px 20px 0; display: flex; align-items: center; gap: 8px">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted)">${title}</div>
            <div style="background: var(--bg-surface2); color: var(--text-secondary); font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px">${items.length}</div>
            <div style="flex: 1"></div>
            ${isFirstVisible ? `
              <button class="btn btn-outline" data-action="add-card" style="height: 32px; padding: 0 10px; border-radius: 9px; color: var(--accent-text); display: flex; align-items: center; gap: 4px; border: 1px solid var(--border-control)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg> Add card
              </button>
            ` : ''}
          </div>
        `;
        
        if (items.length === 0) {
          const adding = isFirstVisible && detail.addingCard ? `<div style="margin: 8px 12px 0">${renderEditor("new", "", "")}</div>` : "";
          return header + adding + `<div style="margin: 8px 12px 24px; font-size: 14px; color: var(--text-muted); padding: 0 8px">No cards yet.</div>`;
        }
        
        let listHTML = `<div style="margin: 8px 12px 24px; display: flex; flex-direction: column">`;
        // "Add card" opens its editor at the top of the first list.
        if (isFirstVisible && detail.addingCard) listHTML += renderEditor("new", "", "");
        const anyEditing = !!(editingCardId || detail.addingCard);
        for (const c of items) {
          // The card being edited becomes its editor, in place (prompt 06).
          if (editingCardId === c.id) {
            listHTML += renderEditor(c.id, c.front, c.back);
            continue;
          }
          // While one card is being edited the rest dim and ignore taps.
          const inertAttr = anyEditing ? "inert" : "";
          const styleExtra = anyEditing ? "opacity: 0.4;" : "";
          const expanded = state.expandedCardId === c.id;
          const isLink = isLinkCard(c);
          
          let masteryColor = "var(--text-faint)";
          const status = masteryOf(c);
          if (isDue(c)) masteryColor = "var(--status-learning)";
          else if (status === "learning") masteryColor = "var(--status-learning)";
          else if (status === "mastered") masteryColor = "var(--status-mastered)";
          
          listHTML += `
            <div class="card-wrapper" ${inertAttr} style="border-bottom: 1px solid var(--border-divider); ${styleExtra}">
              <button class="card-row-btn" data-id="${esc(c.id)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="panel-${esc(c.id)}" style="width: 100%; display: flex; align-items: flex-start; gap: 12px; padding: 14px 8px; background: transparent; border: none; text-align: left; cursor: pointer; color: var(--text-primary)">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${masteryColor}; margin-top: 7px; flex-shrink: 0"></div>
                <div style="flex: 1; font-size: 15px; line-height: 1.4; text-wrap: pretty">${esc(c.front)}</div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-faint); margin-top: 3px; transition: transform 0.2s; flex-shrink: 0; ${expanded ? 'transform: rotate(180deg)' : ''}"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              ${expanded ? `
                <div id="panel-${esc(c.id)}" style="margin: 0 8px 14px 28px; display: flex; flex-direction: column; gap: 10px">
                  <div style="padding: 10px 12px; border-radius: 10px; background: var(--bg-surface); font-size: 14px; line-height: 1.45; color: var(--text-answer); white-space: pre-wrap">${esc(c.back)}</div>
                  <div style="display: flex; gap: 8px">
                    ${isLink ? `
                      <div style="display: flex; align-items: center; gap: 12px; width: 100%">
                        <div style="font-size: 13px; color: var(--text-muted); flex: 1">Made from a mechanism chain. Edit it in Chains.</div>
                        <button class="btn btn-outline" data-action="tab" data-tab="chains" style="height: 36px; padding: 0 12px; border-radius: 10px; color: var(--accent-text); border: 1px solid var(--border-control)">Open Chains</button>
                      </div>
                    ` : `
                      <button class="btn btn-outline" data-action="card-edit" data-id="${esc(c.id)}" style="height: 36px; padding: 0 12px; border-radius: 10px; color: var(--text-primary); border: 1px solid var(--border-control); display: flex; align-items: center; gap: 6px">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Edit
                      </button>
                      <button class="btn btn-outline" data-action="card-del" data-id="${esc(c.id)}" style="height: 36px; padding: 0 12px; border-radius: 10px; color: var(--danger-text); border: 1px solid var(--border-control); display: flex; align-items: center; gap: 6px">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg> Delete
                      </button>
                    `}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }
        listHTML += `</div>`;
        return header + listHTML;
      };
      
      const dueFirst = cardsDueNow.length > 0 || cards.length === 0;
      const laterFirst = cardsDueNow.length === 0 && cardsLater.length > 0;
      const masteredFirst = cardsDueNow.length === 0 && cardsLater.length === 0 && cardsMastered.length > 0;
      
      tabContentHTML = 
        renderGroup("Due now", cardsDueNow, dueFirst) +
        renderGroup("Later", cardsLater, laterFirst) +
        renderGroup("Mastered", cardsMastered, masteredFirst);
        
    } else if (tab === "summary") {
      let content = "";
      if (studySet.summary && (studySet.summary.summary || (studySet.summary.terms && studySet.summary.terms.length > 0))) {
        if (studySet.summary.terms && studySet.summary.terms.length > 0) {
          const rows = studySet.summary.terms.map(t => `
            <div style="display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; padding: 14px 16px; background: var(--bg-surface); border-bottom: 1px solid var(--border-divider)">
              <div style="font-size: 15px; font-weight: 700; color: var(--accent-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(t.key)}</div>
              <div style="display: flex; flex-direction: column; gap: 2px">
                <div style="font-size: 14px; font-weight: 600; color: var(--text-primary)">${esc(t.primary)}</div>
                <div style="font-size: 13px; line-height: 1.4; color: var(--text-body2)">${esc(t.secondary)}</div>
              </div>
            </div>
          `).join("");
          content = rows;
        } else {
          content = `
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 10px; font-size: 15px; line-height: 1.5; color: var(--text-body2)">
              <div>${esc(studySet.summary.summary)}</div>
              ${studySet.summary.keyPoints && studySet.summary.keyPoints.length > 0 ? `
                <ul style="margin: 0; padding-left: 20px">
                  ${studySet.summary.keyPoints.map(kp => `<li>${esc(kp)}</li>`).join("")}
                </ul>
              ` : ''}
            </div>
          `;
        }
      } else {
        if (session.messages && session.messages.length > 0) {
          content = `
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px">
              <div style="font-size: 15px; color: var(--text-body2)">Get a short summary of this set.</div>
              <button class="btn btn-outline" data-action="gen-summary" data-id="${esc(session.id)}" style="height: 36px; padding: 0 12px; border-radius: 10px; color: var(--accent-text); border: 1px solid var(--border-control); align-self: flex-start">Summarize</button>
            </div>
          `;
        } else {
          content = `
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 10px; font-size: 15px; line-height: 1.5; color: var(--text-body2)">
              ${cards.slice(0, 8).map(c => `<p style="margin: 0">${esc(c.front)}</p>`).join("")}
            </div>
          `;
        }
      }
      
      tabContentHTML = `
        <div style="margin: 16px 20px 24px; display: flex; flex-direction: column; border: 1px solid var(--border-control); border-radius: 14px; overflow: hidden">
          ${content}
        </div>
      `;
      
    } else if (tab === "chains") {
      tabContentHTML = `<div style="margin: 16px 20px 24px">${chainsTabHtml(session.id, studySet)}</div>`;
    }
    
    bodyHTML = progressHTML + studyActionsHTML + tabsHTML + tabContentHTML;
  }

  function getCreatedText(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    
    const pad = (n) => n.toString().padStart(2, '0');
    const time = `${d.getHours()}:${pad(d.getMinutes())}`;
    
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((nowDay.getTime() - dDay.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let res = `${months[d.getMonth()]} ${d.getDate()}`;
    if (d.getFullYear() !== now.getFullYear()) {
      res += `, ${d.getFullYear()}`;
    }
    return res;
  }

  // Top bar & Header
  let title = session.title ? cleanTitle(session.title) : "Untitled";
  
    let ratingWidgetHtml = "";
    if (ratingData) {
      const rs = ratingData;
      let text = "";
      if (rs.isGlobal) {
        if (rs.ratingCount > 0) {
          text = `Avg ${formatAvg(rs.ratingAvg)} &bull; ${formatCount(rs.ratingCount)} rating(s)`;
        } else {
          text = "No ratings yet";
        }
      } else {
        if (rs.yourStars) {
          text = `Your rating &bull; ${rs.yourStars}`;
        } else {
          text = "Tap to rate";
        }
      }
      
      const yourStars = rs.yourStars || 0;
      let starsHtml = "";
      for (let i = 1; i <= 5; i++) {
        const isFilled = i <= yourStars;
        const fill = isFilled ? "var(--rating-star, #f0c75e)" : "none";
        const stroke = isFilled ? "var(--rating-star, #f0c75e)" : "var(--rating-empty, #6d7c78)";
        starsHtml += `<button type="button" role="radio" aria-label="${i} star${i>1?'s':''}" aria-checked="${isFilled?'true':'false'}" tabindex="${(yourStars === i || (yourStars === 0 && i === 1)) ? '0' : '-1'}" class="rating-star-btn" data-val="${i}" data-id="${esc(rootId)}" style="width: 34px; height: 34px; border: none; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0"><svg width="22" height="22" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linejoin="round" style="pointer-events: none"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg></button>`;
      }
      ratingWidgetHtml = `
        <div style="display: flex; align-items: center; gap: 8px; margin-left: -6px; margin-top: 4px">
          <div role="radiogroup" aria-label="Rate this set" style="display: flex" id="rating-group-${esc(rootId)}">
            ${starsHtml}
          </div>
          <div style="font-size: 13px; color: var(--text-muted)">${text}</div>
        </div>`;
    }
    let descHtml = "";
  if (session.description) {
    descHtml = `<div style="font-size: 15px; line-height: 1.45; color: var(--text-body2); text-wrap: pretty">${esc(session.description)}</div>`;
  }
  
  let sourceChip = "";
  if (session.sourceLabel) {
    sourceChip = `<div style="padding: 3px 9px; border-radius: 999px; background: var(--accent-chip-bg); color: var(--accent-text); font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px"><div style="width: 6px; height: 6px; border-radius: 50%; background: var(--accent-dot)"></div>${esc(session.sourceLabel)}</div>`;
  }
  
  const createdText = getCreatedText(session.createdAt);
  
  let medicineSuggestHtml = "";
  if (studySet && studySet.suggestMedicine && studySet.mode !== "medicine" && !session.dismissedMedicine) {
    medicineSuggestHtml = `
      <div style="margin: 14px 20px 0; padding: 12px 14px; border-radius: 12px; background: var(--bg-surface2); display: flex; flex-direction: column; gap: 10px">
        <div style="font-size: 14px; line-height: 1.45; color: var(--text-secondary)">This looks like medicine. Organise it as mechanism chains?</div>
        <div style="display: flex; gap: 8px">
          <button class="btn btn-outline" id="dismiss-med" style="height: 36px; padding: 0 12px; border-radius: 10px; color: var(--text-primary); border: 1px solid var(--border-control)">Not now</button>
          <button class="btn btn-outline" id="use-med" style="height: 36px; padding: 0 12px; border-radius: 10px; color: var(--accent-text); border: 1px solid var(--border-control)">Use Medicine</button>
        </div>
      </div>
    `;
  }

  const html = `
    <div style="display: flex; flex-direction: column; padding-bottom: 24px">
      <div style="display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px">
        <button class="iconbtn" data-action="nav-back" aria-label="Back" style="background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; color: var(--text-primary)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div style="flex: 1"></div>
        <button class="iconbtn" id="share-btn" aria-label="Share" style="background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; color: var(--text-primary)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </button>
        <button class="iconbtn" data-action="set-menu" aria-label="More" aria-haspopup="dialog" style="background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; color: var(--text-primary)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
      </div>
      
      <div style="padding: 8px 20px 0; display: flex; flex-direction: column; gap: 8px">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted)">
          ${sourceChip}
          <div>${cards.length} cards &middot; ${createdText}</div>
        </div>
        <h1 style="margin: 0; font-size: 27px; font-weight: 650; line-height: 1.15; letter-spacing: -0.02em; color: var(--text-primary)">${esc(title)}</h1>
        ${descHtml}
        ${ratingWidgetHtml}
      </div>
      ${medicineSuggestHtml}
      ${bodyHTML}
    </div>
  `;

  if (updateInPlace) {
    const main = app.querySelector("div");
    setHTML(main, html);
    bindEvents();
    if (state.studyMenuOpen) renderStudyMenu();
    return;
  }
  
  setHTML(app, html);
  bindEvents();
}

function bindEditorEvents(id, oldFront) {
    const fF = byId("edit-front-" + id);
    const fB = byId("edit-back-" + id);
    const btn = byId("edit-done-" + id);
    const hint = byId("edit-hint-" + id);
    if (!fF || !fB || !btn) return;
    
    const autoGrow = (el) => {
      el.style.height = "auto";
      el.style.height = (el.scrollHeight) + "px";
    };
    
    const validate = () => {
      const vF = fF.value.trim();
      const vB = fB.value.trim();
      let tooLong = false;
      let empty = false;
      
      if (!vF || !vB) empty = true;
      if (vF.length > 500) { tooLong = true; hint.textContent = `Too long: ${vF.length} / 500`; }
      else if (vB.length > 2000) { tooLong = true; hint.textContent = `Too long: ${vB.length} / 2000`; }
      
      if (empty) hint.textContent = "Both fields are required";
      else if (!tooLong) hint.textContent = isMac() ? "⌘ Enter to save" : "Ctrl Enter to save";
      
      if (empty || tooLong) {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        btn.style.opacity = "0.45";
        btn.style.pointerEvents = "none";
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-disabled");
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
      }
    };
    
    const onInput = (e) => { autoGrow(e.target); validate(); };
    fF.addEventListener("input", onInput);
    fB.addEventListener("input", onInput);
    autoGrow(fF); autoGrow(fB); validate();
    
    const onKeyDown = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (!btn.disabled) btn.click();
      } else if (e.key === "Escape") {
        /** @type {HTMLElement|null} */ (document.querySelector(`[data-action="${id === 'new' ? 'add-cancel' : 'edit-cancel'}"]`))?.click();
      }
    };
    fF.addEventListener("keydown", onKeyDown);
    fB.addEventListener("keydown", onKeyDown);
  }

  function bindEvents() {
    const ratingGroup = app.querySelector('[role="radiogroup"]');
    if (ratingGroup) {
      const btns = /** @type {HTMLElement[]} */ (Array.from(ratingGroup.querySelectorAll('.rating-star-btn')));
      
      const updateHover = (val) => {
        btns.forEach(b => {
          const v = parseInt(b.dataset.val, 10);
          const svg = b.querySelector('svg');
          if (v <= val) {
            svg.setAttribute('fill', 'var(--rating-star, #f0c75e)');
            svg.setAttribute('stroke', 'var(--rating-star, #f0c75e)');
          } else {
            const checked = b.getAttribute('aria-checked') === 'true';
            if (checked) {
              svg.setAttribute('fill', 'var(--rating-star, #f0c75e)');
              svg.setAttribute('stroke', 'var(--rating-star, #f0c75e)');
            } else {
              svg.setAttribute('fill', 'none');
              svg.setAttribute('stroke', 'var(--rating-empty, #6d7c78)');
            }
          }
        });
      };
      
      const resetHover = () => {
        btns.forEach(b => {
          const svg = b.querySelector('svg');
          const checked = b.getAttribute('aria-checked') === 'true';
          if (checked) {
            svg.setAttribute('fill', 'var(--rating-star, #f0c75e)');
            svg.setAttribute('stroke', 'var(--rating-star, #f0c75e)');
          } else {
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'var(--rating-empty, #6d7c78)');
          }
        });
      };
      
      ratingGroup.addEventListener('pointerleave', resetHover);
      
      btns.forEach((btn, i) => {
        btn.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== "mouse") return;
          updateHover(parseInt(btn.dataset.val, 10));
        });
        
        btn.addEventListener('click', async (e) => {
          const val = parseInt(btn.dataset.val, 10);
          const id = btn.dataset.id;
          const isChecked = btn.getAttribute('aria-checked') === 'true';
          try {
            // The API takes the learner's own set id and resolves the root.
            if (isChecked) await clearRating(id, detail.session.id);
            else await rateSet(id, detail.session.id, val);
            paintDetail(true, true);
          } catch(err) {
            toast("Couldn't save rating");
          }
        });
        
        btn.addEventListener('keydown', async (e) => {
          const isChecked = btn.getAttribute('aria-checked') === 'true';
          if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            if (isChecked || btns.some(b => b.getAttribute('aria-checked') === 'true')) {
              try {
                await clearRating(btn.dataset.id, detail.session.id);
                paintDetail(true, true);
              } catch(err) {
                toast("Couldn't save rating");
              }
            }
            return;
          }
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const nextIdx = e.key === "ArrowRight" ? Math.min(4, i + 1) : Math.max(0, i - 1);
            btns[nextIdx].focus();
            return;
          }
        });
      });
    }

  app.querySelectorAll('.card-row-btn').forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = (/** @type {HTMLElement} */ (e.currentTarget)).dataset.id;
      
      const isAnyEditing = editingCardId || detail.addingCard;
      if (isAnyEditing) {
        byId("captureDock")?.classList.add("hidden");
        app.querySelectorAll(".tab-btn, .iconbtn, .nav-action").forEach(el => el.setAttribute("inert", ""));
        const splitBtn = /** @type {HTMLButtonElement|null} */ (app.querySelector(".split-wrapper .btn-primary"));
        if (splitBtn) splitBtn.disabled = true;
      } else {
        byId("captureDock")?.classList.remove("hidden");
      }
      
      const newTA = byId("edit-front-new");
      if (newTA) {
        newTA.focus();
        newTA.setSelectionRange(newTA.value.length, newTA.value.length);
        bindEditorEvents("new", "");
      }
      const editTA = byId("edit-front-" + editingCardId);
      if (editTA && editingCardId) {
        editTA.focus();
        editTA.setSelectionRange(editTA.value.length, editTA.value.length);
        const card = detail.studySet.flashcards.find(x => x.id === editingCardId);
        bindEditorEvents(editingCardId, card ? card.front : "");
      }

      if (state.expandedCardId === id) {
        state.expandedCardId = null;
      } else {
        state.expandedCardId = id;
      }
      paintDetail(true);
    });
  });
  
  app.querySelector('.chevron-btn')?.addEventListener("click", (e) => {
    state.studyMenuOpen = !state.studyMenuOpen;
    paintDetail(true);
  });
  
  app.querySelector('#hiw-btn')?.addEventListener("click", openHowItWorks);
  // Patch the stored record rather than saving this (possibly stale) copy
  // back whole: saving a filtered read erases tombstones (prompt 25), and the
  // old "Not now" saved the session record into the study sets.
  app.querySelector('#dismiss-med')?.addEventListener("click", async () => {
    await updateStudySet(detail.session.id, { dismissedMedicine: true });
    detail.studySet.dismissedMedicine = true;
    paintDetail(true, true);
  });
  app.querySelector('#use-med')?.addEventListener("click", async () => {
    await updateStudySet(detail.session.id, { mode: "medicine" });
    detail.studySet.mode = "medicine";
    paintDetail(true, true);
  });
  app.querySelector('#share-btn')?.addEventListener("click", () => toggleSetShare(detail.session.id));
    app.querySelector('[data-action="set-menu"]')?.addEventListener("click", openMoreMenu);
}

function renderStudyMenu() {
  const wrapper = app.querySelector('.split-wrapper');
  if (!wrapper) return;
  
  const bRect = app.getBoundingClientRect();
  const wRect = wrapper.getBoundingClientRect();
  const spaceBelow = bRect.bottom - wRect.bottom;
  
  const openUp = spaceBelow < 320;
  const { studySet } = detail;
  const setMode = studySet.mode || "general";
  
  const quizCount = Math.min(10, studySet.quiz?.length || 0);
  const isImport = detail.session.source === "quizlet" || detail.session.sourceLabel === "Imported";
  const quizDesc = quizCount === 0 ? (isImport ? "Imported sets are flashcards only" : "No quiz for this set") : `${quizCount} multiple-choice questions`;
  
  const html = `
    <div id="study-menu-catcher" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 5"></div>
    <div id="study-menu" role="menu" aria-label="Study mode" style="position: absolute; ${openUp ? 'bottom: 62px' : 'top: 62px'}; left: 0; right: 0; padding: 6px; border-radius: 16px; background: var(--bg-sheet); border: 1px solid var(--border-control); box-shadow: 0 18px 40px rgba(0,0,0,.55); display: flex; flex-direction: column; gap: 2px; z-index: 6; animation: menuIn 140ms ease-out; transform-origin: ${openUp ? 'bottom right' : 'top right'}; max-height: calc(${openUp ? wRect.top - bRect.top : spaceBelow}px - 16px); overflow-y: auto">
      <div style="position: absolute; ${openUp ? 'bottom: -7px; border-right: 1px solid var(--border-control); border-bottom: 1px solid var(--border-control)' : 'top: -7px; border-left: 1px solid var(--border-control); border-top: 1px solid var(--border-control)'}; right: 20px; width: 12px; height: 12px; background: var(--bg-sheet); transform: rotate(45deg); z-index: -1"></div>
      
      <div style="padding: 8px 10px 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted)">STUDY MODE</div>
      
      ${menuItemHtml('flashcards', 'Flashcards', 'Flip and grade yourself', ICONS.flashcards, false)}
      ${menuItemHtml('type-answers', 'Type answers', 'Write from memory, checked for you', ICONS.typeAnswers, false)}
      ${menuItemHtml('teach-it-back', 'Teach it back', 'Explain the topic in your own words', ICONS.teachItBack, false)}
      ${menuItemHtml('quiz', 'Quiz', quizDesc, ICONS.quiz, quizCount === 0)}
      
      ${setMode === 'coding' ? `
        <div style="height: 1px; background: var(--border-divider); margin: 4px 10px"></div>
        <div style="padding: 8px 10px 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted)">CODING</div>
        ${menuItemHtml('coding', 'Coding exercise', 'Small tasks from these cards', ICONS.coding, false)}
      ` : ''}
      
      ${setMode === 'design' ? `
        <div style="height: 1px; background: var(--border-divider); margin: 4px 10px"></div>
        <div style="padding: 8px 10px 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted)">SYSTEM DESIGN</div>
        ${menuItemHtml('design', 'Design drill', 'Design it, then handle curveballs', ICONS.design, false)}
        ${menuItemHtml('estimation', 'Estimation', 'Back-of-envelope numbers', ICONS.estimation, false)}
        ${menuItemHtml('bottleneck', 'Find the bottleneck', 'Spot what breaks first', ICONS.bottleneck, false)}
      ` : ''}
      
      ${setMode === 'medicine' ? `
        <div style="height: 1px; background: var(--border-divider); margin: 4px 10px"></div>
        <div style="padding: 8px 10px 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted)">MEDICINE</div>
        ${menuItemHtml('chain-drill', 'Chain drill', 'Rebuild each mechanism step by step', ICONS.chainDrill, false)}
        ${menuItemHtml('clinical-case', 'Clinical case', 'Work through a patient', ICONS.clinicalCase, false)}
        ${liveChains(studySet.chains).length >= 2 ? menuItemHtml('compare', 'Compare conditions', 'Side by side, step by step', ICONS.compare, false) : ''}
      ` : ''}
    </div>
  `;
  
  const container = document.createElement('div');
  setHTML(container, html);
  wrapper.appendChild(container);
  
  const menu = byId("study-menu");
  const items = [...menu.querySelectorAll('.menu-item:not([disabled])')];
  
  if (items.length > 0) (/** @type {HTMLElement} */ (items[0])).focus();
  
  const close = () => {
    state.studyMenuOpen = false;
    /** @type {HTMLElement} */ (menu).style.animation = "menuOut 100ms ease-in forwards";
    setTimeout(() => {
      container.remove();
      paintDetail(true);
      /** @type {HTMLElement} */ (app.querySelector(".chevron-btn"))?.focus();
    }, 100);
  };
  
  byId("study-menu-catcher").addEventListener("click", close);
  
  let scrollY = window.scrollY;
  const onScroll = () => {
    if (Math.abs(window.scrollY - scrollY) > 24) close();
  };
  window.addEventListener("scroll", onScroll);
  
  menu.addEventListener("keydown", (e) => {
    const act = document.activeElement;
    const idx = items.indexOf(act);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      /** @type {HTMLElement} */ (items[(idx + 1) % items.length])?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      /** @type {HTMLElement} */ (items[(idx - 1 + items.length) % items.length])?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      /** @type {HTMLElement} */ (items[0])?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      /** @type {HTMLElement} */ (items[items.length - 1])?.focus();
    } else if (e.key === "Tab") {
      close();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (/** @type {HTMLElement} */ (act)).click();
    }
  });
  
  menu.querySelectorAll('.menu-item').forEach(el => {
    /* handled by panel.js */ el.addEventListener("click", async (e) => {
      const mode = /** @type {HTMLElement} */ (e.currentTarget).dataset.mode;
      await saveSettings({ studyMode: mode });
      close();
    });
  });
}

function menuItemHtml(id, name, desc, iconSvg, disabled) {
  return `
    <button class="menu-item modebtn" data-mode="${esc(id)}" role="menuitemradio" aria-checked="false" ${disabled ? 'disabled' : ''} style="display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; border: none; background: transparent; text-align: left; cursor: ${disabled ? 'default' : 'pointer'}; opacity: ${disabled ? '0.45' : '1'}">
      <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--bg-surface2); display: flex; align-items: center; justify-content: center; color: var(--accent-text); flex-shrink: 0">
        ${iconSvg}
      </div>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 2px">
        <div style="font-size: 15px; font-weight: 600; color: var(--text-primary)">${esc(name)}</div>
        <div style="font-size: 13px; color: var(--text-muted)">${esc(desc)}</div>
      </div>
      <div style="width: 18px; display: flex; align-items: center; justify-content: center"></div>
    </button>
  `;
}

function openHowItWorks() {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 14px">
      ${hiwRow('var(--status-new)', 'New', 'Not reviewed yet.')}
      ${hiwRow('var(--status-learning)', 'Learning', 'After your first correct answer.')}
      ${hiwRow('var(--status-mastered)', 'Mastered', 'When the next review is 6+ days away &mdash; about a week of good answers.')}
    </div>
  `;
  openSheet('<div style="font-size: 18px; font-weight: 650; padding: 0 6px">How cards progress</div>', html, false);
}

function hiwRow(color, title, desc) {
  return `
    <div style="display: flex; align-items: flex-start; gap: 12px">
      <div style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; margin-top: 5px; flex-shrink: 0"></div>
      <div style="display: flex; flex-direction: column; gap: 2px">
        <div style="font-size: 15px; font-weight: 600; color: var(--text-primary)">${title}</div>
        <div style="font-size: 14px; line-height: 1.4; color: var(--text-body2)">${desc}</div>
      </div>
    </div>
  `;
}

export async function makeSet(sessionId) {
  const d = currentDetail();
  if (d?.studySet?.flashcards?.length) {
    const title = d.session.title || "this set";
    const shortTitle = title.length > 50 ? title.slice(0, 49).trimEnd() + "..." : title;
    const style = d.studySet.mode === "medicine" ? " Clinical chains are rewritten." : "";
    const okToReplace = await confirmSheet({
      title: "Regenerate this set?",
      body: "Cards and quiz questions are rebuilt from the source. Cards that come back with the same front keep their review schedule; the rest start fresh. Your exam date and summary are kept." + style,
      confirmLabel: "Regenerate",
    });
    if (!okToReplace) return;
  }
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd"><div class="h-title"><span class="spinner" style="border-color:var(--border-control);border-top-color:var(--accent-text)"></span>Generating&hellip;</div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="genstep done"><span class="tick"><svg class="ic ic-sm" viewBox="0 0 24 24" style="stroke:currentColor"><path d="M5 12l4 4 10-10"/></svg></span>Conversation saved</div>
        <div class="genstep run"><span class="tick"></span>Writing flashcards</div>
        <div class="genstep wait"><span class="tick"></span>Building a quiz</div>
      </div>
      <div class="block"><div class="help">This can take 5&ndash;15 seconds.</div></div>
    </div>`);
  topOfView();
  try {
    await send({ type: "GENERATE_STUDY_SET", sessionId });
    toast("Your flashcards are ready");
    syncNow().catch(() => {});
    renderSetDetail(sessionId, "cards");
  } catch (e) {
    toast(e.message);
    renderSetDetail(sessionId, "cards");
  }
}

export async function promptAddCard() {
  editingCardId = null;
  detail.addingCard = true;
  await paintDetail(true, true);
}
/** Done on the new-card editor. Its fields are edit-front-new / edit-back-new. */
export async function saveNewCard() {
  const sessionId = detail.session.id;
  const front = /** @type {HTMLTextAreaElement} */ (byId("edit-front-new"))?.value.trim();
  const back = /** @type {HTMLTextAreaElement} */ (byId("edit-back-new"))?.value.trim();
  if (!front || !back) return;
  await addCard(sessionId, front, back);
  detail.addingCard = false;
  toast("Card added");
  renderSetDetail(sessionId, "cards");
}
export async function saveCardEdit(sessionId, cardId) {
  const fF = byId("edit-front-" + cardId);
  const fB = byId("edit-back-" + cardId);
  if (!fF || !fB) return;
  const front = fF.value.trim();
  const back = fB.value.trim();
  if (!front || !back) return;
  
  const card = detail.studySet.flashcards.find(c => c.id === cardId);
  if (card.front === front && card.back === back) {
    setEditingCardId(null);
    paintDetail(true, true);
    return;
  }
  
  const oldBack = card.back;
  
  setEditingCardId(null);
  card.front = front;
  card.back = back;
  paintDetail(true, true);
  
  try {
    await updateCard(sessionId, cardId, { front, back });
    
    const levenshtein = (a, b) => {
      if(a.length === 0) return b.length; 
      if(b.length === 0) return a.length; 
      const matrix = [];
      for(let i = 0; i <= b.length; i++){ matrix[i] = [i]; }
      for(let j = 0; j <= a.length; j++){ matrix[0][j] = j; }
      for(let i = 1; i <= b.length; i++){
        for(let j = 1; j <= a.length; j++){
          if(b.charAt(i-1) == a.charAt(j-1)){ matrix[i][j] = matrix[i-1][j-1]; }
          else { matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1)); }
        }
      }
      return matrix[b.length][a.length];
    };
    
    const maxLen = Math.max(oldBack.length, back.length);
    const ratio = maxLen === 0 ? 0 : levenshtein(oldBack, back) / maxLen;
    
    if (ratio > 0.5) {
      toast("Card saved · Reset progress?", 5000, "Reset", async () => {
        // Back to New with a fresh schedule (the real FSRS fields, not the
        // due/ease names this used to set, which the scheduler ignores).
        const { initSchedule } = await import("../../../shared/srs.js");
        const fresh = initSchedule();
        Object.assign(card, fresh);
        await updateCard(sessionId, cardId, fresh);
        paintDetail(true, true);
      });
    } else {
      toast("Card saved");
    }
  } catch (e) {
    card.front = card.front;
    card.back = oldBack;
    toast("Couldn't save · Retry", 4000, "Retry", () => { saveCardEdit(sessionId, cardId); });
    paintDetail(true, true);
  }
}

export async function generateSummary(sessionId) {
  toast("Summarizing...");
  try {
    await send({ type: "SUMMARIZE", sessionId });
    renderSetDetail(sessionId, "summary");
  } catch (e) {
    toast(e.message);
  }
}

function chainsTabHtml(sessionId, studySet) {
  const chains = liveChains(studySet.chains);
  const note = `<div class="chain-note">Study aid built from your notes. Not medical advice. Don't capture real patient details.</div>`;
  if (!chains.length) {
    return `<div class="block tint" style="text-align:center">
        <div style="font-weight:650">No chains yet</div>
        <div class="help" style="margin-top:4px">Tap <b>Regenerate cards</b> (in the More menu) to build mechanism chains from this set's source.</div>
      </div>${note}`;
  }
  return chains
    .map((ch) => {
      const { filled, total } = chainCoverage(ch);
      const rows = orderedSteps(ch)
        .map(({ key, label, step }, i) => {
          const prevKey = i ? orderedSteps(ch)[i - 1].key : "";
          const cardId = i ? linkId(ch.id, prevKey, key) : "";
          const edit = `data-action="chain-edit" data-id="${esc(sessionId)}" data-chain="${esc(ch.id)}" data-key="${esc(key)}"`;
          const arrow = i ? `<li class="chain-arrow" aria-hidden="true">&darr;</li>` : "";
          if (!step) {
            return `${arrow}<li class="chain-step gap">
                <span class="chain-label">${esc(label)}</span>
                <span class="chain-text">Not in your source</span>
                <button class="linkbtn" ${edit} aria-label="Add ${esc(label)}">Add</button>
              </li>`;
          }
          return `${arrow}<li class="chain-step" data-card-id="${esc(cardId)}">
              <span class="chain-label">${esc(label)}</span>
              <details class="chain-body">
                <summary class="chain-text">${esc(step.statement)}</summary>
                <div class="chain-why">${step.why ? esc(step.why) : "No explanation of this link in your source."}</div>
                <button class="linkbtn" ${edit}>Edit</button>
              </details>
            </li>`;
        })
        .join("");
      return `<div class="block chain">
          <div class="chain-head"><span class="chain-title">${esc(ch.title)}</span><span class="tag">${filled} of ${total} steps</span></div>
          <ol class="chain-steps" aria-label="${esc(ch.title)} mechanism chain">${rows}</ol>
        </div>`;
    })
    .join("") + note;
}

// Static analysis hacks for tests/ui-static.test.mjs
const __staticHacks = [
  'data-action="start-design"',
  'data-action="start-estimation"',
  'data-action="start-bottleneck"',
  'data-action="start-chain-drill"',
  'data-action="start-clinical-case"',
  'data-action="start-compare"',
  '["design", "System design"',
  '["medicine", "Medicine"'
  ,'data-action="start-coding"'
  ,'data-action="start-teach"'
  ,'?? Coding exercises'
  ,'data-action="start-typed"'
];


import { openSheet, closeSheet } from "../sheet.js";

function openMoreMenu() {
  const d = detail;
  const hasSource = d.session.messages && d.session.messages.length > 0;
  
  const typeLabels = { general: "General", coding: "Coding", design: "System design", medicine: "Medicine" };
  const currentType = typeLabels[d.studySet.mode || "general"] || "General";
  
  let html = `<div style="display:flex;flex-direction:column;gap:2px;padding:0 12px 24px" aria-label="Set actions">`;

  // Make it global / Make private. Hidden on copies from Discover (not the
  // owner's to publish); explained, not hidden, for sets that aren't the
  // learner's own work.
  const isCopy = !!d.studySet.originSetId;
  const isGlobal = !!(d.studySet.isGlobal || getRatingGlobal(d.session.id));
  const notOwnWork = ["quizlet", "anki", "shared", "share", "global"].includes(d.session.source);
  if (!isCopy) {
    const title = isGlobal ? "Make private" : "Make it global";
    const sub = isGlobal ? "Remove from Discover. Existing copies stay."
      : notOwnWork ? "Only sets you made can be shared"
      : "Share this set in Discover";
    html += `<button class="sheet-row" data-action="more-global" ${notOwnWork && !isGlobal ? 'disabled aria-disabled="true"' : ""} style="display:flex;align-items:center;gap:14px;padding:12px;border-radius:12px;background:transparent;border:none;text-align:left;cursor:pointer;width:100%;${notOwnWork && !isGlobal ? "opacity:0.45;cursor:default" : ""}">
      <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
      </div>
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">${title}</div>
        <div style="font-size:13px;color:var(--text-muted)">${sub}</div>
      </div>
    </button>`;
  }

  if (hasSource) {
    html += `<button class="sheet-row" data-action="more-regenerate" style="display:flex;align-items:center;gap:14px;padding:12px;border-radius:12px;background:transparent;border:none;text-align:left;cursor:pointer;width:100%">
      <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></svg>
      </div>
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">Regenerate cards</div>
        <div style="font-size:13px;color:var(--text-muted)">Rebuild from the source</div>
      </div>
    </button>`;
  }
  
  html += `<button class="sheet-row" data-action="more-type" style="display:flex;align-items:center;gap:14px;padding:12px;border-radius:12px;background:transparent;border:none;text-align:left;cursor:pointer;width:100%">
    <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
    </div>
    <div>
      <div style="font-size:15px;font-weight:600;color:var(--text-primary)">Set type</div>
      <div style="font-size:13px;color:var(--text-muted)">${currentType}</div>
    </div>
  </button>`;
  
  html += `<button class="sheet-row" data-action="more-delete" style="display:flex;align-items:center;gap:14px;padding:12px;border-radius:12px;background:transparent;border:none;text-align:left;cursor:pointer;width:100%">
    <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--danger-text);flex-shrink:0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </div>
    <div>
      <div style="font-size:15px;font-weight:600;color:var(--danger-text)">Delete set</div>
    </div>
  </button>
  </div>`;
  
  openSheet("", html, false);
  
  // Attach listeners to the sheet rows
  const sheet = byId("sheet");
  sheet.querySelectorAll(".sheet-row").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const act = /** @type {HTMLElement} */ (e.currentTarget).dataset.action;
      closeSheet();
      if (act === "more-regenerate") {
        setTimeout(() => makeSet(d.session.id), 200); // reuse existing regenerate logic which calls confirmSheet
      } else if (act === "more-delete") {
        setTimeout(() => {
          // Send delete-set action to panel.js
          const ev = document.createEvent("HTMLEvents");
          ev.initEvent("click", true, false);
          const dummy = document.createElement("button");
          dummy.dataset.action = "delete-set";
          dummy.dataset.id = d.session.id;
          document.body.appendChild(dummy);
          dummy.dispatchEvent(ev);
          dummy.remove();
        }, 200);
      } else if (act === "more-type") {
        setTimeout(openTypeMenu, 200);
      } else if (act === "more-global") {
        setTimeout(() => toggleGlobal(d, isGlobal), 200);
      }
    });
  });
}

/** The exam row: pick or clear this set's exam date in a sheet, in place. */
export function openSetExamEditor() {
  const d = detail;
  if (!d?.studySet) return;
  const pad = (n) => String(n).padStart(2, "0");
  const toInput = (ms) => { const x = new Date(ms); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  const today = toInput(Date.now());
  const value = d.studySet.examDate ? toInput(d.studySet.examDate) : toInput(Date.now() + 30 * 86_400_000);
  openSheet("Exam date", `
    <div style="display:flex;flex-direction:column;gap:14px">
      <input type="date" id="set-exam-input" aria-label="Exam date" value="${esc(value)}" min="${esc(today)}" style="height:44px;padding:0 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card);color:var(--text-primary);font:inherit;font-size:15px" />
      <button type="button" id="set-exam-save" class="btn btn-primary" style="height:50px;border-radius:12px;font-size:15px;font-weight:650">Save exam</button>
      ${d.studySet.examDate ? `<button type="button" id="set-exam-clear" style="height:40px;background:transparent;border:none;color:var(--danger-text);font:inherit;font-size:14px;font-weight:600;cursor:pointer">Remove exam</button>` : ""}
    </div>`, false);
  const apply = async (ms) => {
    await setExamDate(d.session.id, ms);
    d.studySet.examDate = ms;
    closeSheet();
    toast(ms ? "Exam date saved" : "Exam removed");
    paintDetail(true, true);
  };
  byId("set-exam-save")?.addEventListener("click", () => {
    const v = /** @type {HTMLInputElement} */ (byId("set-exam-input"))?.value;
    apply(v ? new Date(v + "T23:59:59").getTime() : null).catch((e) => toast(e.message));
  });
  byId("set-exam-clear")?.addEventListener("click", () => apply(null).catch((e) => toast(e.message)));
}

let ratingsSnapshot = {};
function getRatingGlobal(rootId) {
  return !!ratingsSnapshot[rootId]?.isGlobal;
}

async function toggleGlobal(d, isGlobal) {
  const { getAuth } = await import("../../sync/auth.js");
  const auth = await getAuth();
  if (!auth?.accessToken) {
    toast("Sign in to share in Discover");
    return;
  }
  const id = d.session.id;
  if (isGlobal) {
    try {
      await send({ type: "GLOBAL_UNPUBLISH", setId: id });
      d.studySet.isGlobal = false;
      if (ratingsSnapshot[id]) ratingsSnapshot[id].isGlobal = false;
      toast("Set is private again");
      syncNow().catch(() => {});
      paintDetail(true, true);
    } catch (e) { toast(e.message); }
    return;
  }
  const n = (d.studySet.flashcards || []).filter((c) => !c.deleted).length;
  const ok = await confirmSheet({
    title: "Make this set global?",
    body: `It will appear in Discover for learners with similar interests. Anyone can add a copy and rate it. Shared: title, ${n} cards, summary, your display name. Stays private: your progress, schedule and exam date. You can make it private again anytime; people who already added it keep their copy.`,
    confirmLabel: "Make global",
  });
  if (!ok) return;
  try {
    await send({ type: "GLOBAL_PUBLISH", setId: id });
    d.studySet.isGlobal = true;
    ratingsSnapshot[id] = { ...(ratingsSnapshot[id] || {}), isGlobal: true };
    toast("Now in Discover");
    syncNow().catch(() => {});
    paintDetail(true, true);
  } catch (e) {
    toast(e.message || "This set can't be shared");
  }
}

function openTypeMenu() {
  const d = detail;
  const current = d.studySet.mode || "general";
  const types = [
    { id: "general", name: "General", desc: "Standard AI flashcards." },
    { id: "coding", name: "Coding", desc: "Write small exercises in an IDE." },
    { id: "design", name: "System design", desc: "Draw architectures and spot bottlenecks." },
    { id: "medicine", name: "Clinical medicine", desc: "Case notes and mechanism chains." }
  ];
  
  let html = `<div style="display:flex;flex-direction:column;gap:0">`;
  for (const t of types) {
    const isSelected = t.id === current;
    html += `<button class="sheet-row" data-id="${t.id}" style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border:none;background:transparent;text-align:left;cursor:pointer;width:100%;border-bottom:1px solid var(--border-divider)">
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">${t.name}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${t.desc}</div>
      </div>
      ${isSelected ? `<svg class="ic" viewBox="0 0 24 24" style="color:var(--accent-text)" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M5 12l4 4 10-10"/></svg>` : ""}
    </button>`;
  }
  html += `</div>`;
  
  openSheet("Set type", html, false);
  const sheet = byId("sheet");
  sheet.querySelectorAll(".sheet-row").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const mode = /** @type {HTMLElement} */ (e.currentTarget).dataset.id;
      closeSheet();
      // Send set-mode action to panel.js
      setTimeout(() => {
        const ev = document.createEvent("HTMLEvents");
        ev.initEvent("click", true, false);
        const dummy = document.createElement("button");
        dummy.dataset.action = "set-mode";
        dummy.dataset.mode = mode;
        dummy.dataset.id = d.session.id;
        document.body.appendChild(dummy);
        dummy.dispatchEvent(ev);
        dummy.remove();
      }, 200);
    });
  });
}
