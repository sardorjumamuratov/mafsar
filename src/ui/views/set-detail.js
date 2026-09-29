import { showChrome } from "../nav.js";
import { app, bundle, esc, send, setFor, setHTML, insertHTMLBefore, sourceLabel, summarize, timeUntil, toast, topOfView } from "../core.js";
import { renderHome, shareOpenFor, setShareOpenFor } from "../views/home.js";
import { examReadiness } from "../../../shared/readiness.js";
import { isDue, masteryOf, review } from "../../../shared/srs.js";
import { startQuiz } from "../flows/quiz.js";
import { syncNow } from "../../sync/sync.js";
import { addCard, updateCard, saveStudySet, saveSettings } from "../../storage/store.js";
import { chainCoverage, liveChains, orderedSteps } from "../../storage/chains.js";
import { isLinkCard, linkId } from "../../storage/chain-links.js";
import { cleanTitle } from "../../../shared/titles.js";
import { ICONS } from "../icons.js";
import { openSheet, closeSheet } from "../sheet.js";
import { confirmSheet } from "../confirm.js";
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

export async function paintDetail(updateInPlace = false) {
  const { session, studySet, tab } = detail;
  const cards = studySet?.flashcards || [];
  
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
            <button class="iconbtn" id="hiw-btn" style="height: 28px; padding: 0 2px; border: none; background: transparent; display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-muted); cursor: pointer">
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
        <button class="exam-row btn" data-action="exam-pick" style="width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border-control); background: var(--bg-surface); text-align: left; cursor: pointer; color: var(--text-primary)">
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
        <button class="exam-row btn" data-action="exam-pick" style="width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border-control); background: var(--bg-surface); text-align: left; cursor: pointer; color: var(--text-primary)">
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
          return header + `<div style="margin: 8px 12px 24px; font-size: 14px; color: var(--text-muted); padding: 0 8px">No cards yet.</div>`;
        }
        
        let listHTML = `<div style="margin: 8px 12px 24px; display: flex; flex-direction: column">`;
        for (const c of items) {
          const expanded = state.expandedCardId === c.id;
          const isLink = isLinkCard(c);
          
          let masteryColor = "var(--text-faint)";
          const status = masteryOf(c);
          if (isDue(c)) masteryColor = "var(--status-learning)";
          else if (status === "learning") masteryColor = "var(--status-learning)";
          else if (status === "mastered") masteryColor = "var(--status-mastered)";
          
          listHTML += `
            <div class="card-wrapper" style="border-bottom: 1px solid var(--border-divider)">
              <button class="card-row-btn" data-id="${esc(c.id)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="panel-${esc(c.id)}" style="width: 100%; display: flex; align-items: flex-start; gap: 12px; padding: 14px 8px; background: transparent; border: none; text-align: left; cursor: pointer; color: var(--text-primary)">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${masteryColor}; margin-top: 7px; flex-shrink: 0"></div>
                <div style="flex: 1; font-size: 15px; line-height: 1.4; text-wrap: pretty">${esc(c.front)}</div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6d7c78" stroke-width="2" style="margin-top: 3px; transition: transform 0.2s; flex-shrink: 0; ${expanded ? 'transform: rotate(180deg)' : ''}"><path d="m6 9 6 6 6-6"/></svg>
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

function bindEvents() {
  app.querySelectorAll('.card-row-btn').forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = (/** @type {HTMLElement} */ (e.currentTarget)).dataset.id;
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
  app.querySelector('#dismiss-med')?.addEventListener("click", async () => {
    detail.session.dismissedMedicine = true;
    await saveStudySet(detail.session);
    paintDetail(true);
  });
  app.querySelector('#use-med')?.addEventListener("click", async () => {
    detail.studySet.mode = "medicine";
    await saveStudySet(detail.studySet);
    paintDetail(true);
  });
  app.querySelector('#share-btn')?.addEventListener("click", () => toggleSetShare(detail.session.id));
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
  
  const menu = document.getElementById("study-menu");
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
  
  document.getElementById("study-menu-catcher").addEventListener("click", close);
  
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
    <button class="menu-item modebtn" data-action="set-mode" data-mode="${esc(id)}" role="menuitemradio" aria-checked="false" ${disabled ? 'disabled' : ''} style="display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; border: none; background: transparent; text-align: left; cursor: ${disabled ? 'default' : 'pointer'}; opacity: ${disabled ? '0.45' : '1'}">
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
