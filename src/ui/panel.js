import { doImport, previewImport, renderImport } from "./views/import.js";
import { app, bundle, nav, send, setFor, toast } from "./core.js";
import { goToActiveTab, registerTabs } from "./nav.js";
import { importSharedSet, lookupShare, renderSets } from "./views/sets.js";
import { currentDetail, makeSet, openDetailTab, paintDetail, promptAddCard, renderSetDetail, saveCardEdit, saveNewCard, setEditingCardId, startQuizForCurrentSet } from "./views/set-detail.js";
import { captureCurrent, captureLastAnswer } from "./capture.js";
import { deleteCard, deleteSession, saveStudySet, setExamDate } from "../storage/store.js";
import { review } from "../storage/srs.js";
import { applyNext, goReturn, gradeCard, revealCard, startGlobalReview, startSetReview } from "./flows/review.js";
import { authGoogle, authSubmit, exportBackup, exportSetTsv, generateSummary, googleAbortController, importBackupFile, renderAuthGate, renderYou } from "./views/you.js";
import { checkApply, startApply } from "./flows/apply.js";
import { checkCode, codingNext, startCodingPractice } from "./flows/coding.js";
import { copyShareCode, revokeShareFor, toggleSetShare } from "./share.js";
import { createTeamFromForm, joinTeamFromInput, leaveTeam, renderTeam, renderTeamCreate, renderTeams } from "./views/teams.js";
import { checkTyped, startTypedPractice, typedNext } from "./flows/typed.js";
import { getAuth, login, logout, register } from "../sync/auth.js";
import { examDraft, openExamPicker, renderHome, saveExamSelection, setExamDraft } from "./views/home.js";
import { answerQuiz, quickQuizLen, quizNext, startQuiz } from "./flows/quiz.js";
import { syncNow } from "../sync/sync.js";

// ================================================================ action router
document.addEventListener("click", (e) => {
  const t = (/** @type {any} */ (e.target)).closest("[data-action]");
  if (!t) return;
  const a = (/** @type {any} */ (t)).dataset.action;
  const id = (/** @type {any} */ (t)).dataset.id;
  switch (a) {
    case "open-import": renderImport(); break;
    case "nav-back": goToActiveTab(); break;
    case "nav-sets": renderSets(); break;
    case "open-set": renderSetDetail(id); break;
    case "make-set": makeSet(id); break;
    case "capture-current": captureCurrent(); break;
    case "capture-last-answer": captureLastAnswer(); break;
    case "tab": openDetailTab((/** @type {any} */ (t)).dataset.tab); break;
    case "delete-set":
      if (confirm("Delete this set and its cards?")) deleteSession(id).then(goToActiveTab);
      break;
    case "start-review": startGlobalReview(); break;
    case "set-review": startSetReview(id); break;
    case "flip": revealCard(); break;
    case "grade": gradeCard(Number((/** @type {any} */ (t)).dataset.g)); break;
    case "billing-portal":
      (/** @type {any} */ (t)).disabled = true;
      t.textContent = "Opening…";
      send({ type: "BILLING_PORTAL" }).then((res) => {
        chrome.tabs.create({ url: res.url });
        (/** @type {any} */ (t)).disabled = false;
        t.textContent = "Manage subscription";
      }).catch((e) => {
        (/** @type {any} */ (t)).disabled = false;
        t.textContent = "Manage subscription";
        toast(e.message);
      });
      break;
    case "billing-checkout": {
        const plan = (/** @type {any} */ (t)).dataset.plan || "plus";
        (/** @type {any} */ (t)).disabled = true;
        t.textContent = "Opening\u2026";
        const currentPlan = (/** @type {any} */ (t)).dataset.currentPlan || "free";
        send({ type: "BILLING_CHECKOUT", plan }).then(async (res) => {
          const { pollBilling } = await import("../sync/auth.js");
          let activeTabId = null;
          chrome.tabs.create({ url: res.url }, (tab) => {
            if (tab) activeTabId = tab.id;
          });
          const ac = new AbortController();
          try {
            await pollBilling({ cancelSignal: ac.signal, fromPlan: currentPlan });
            if (activeTabId) await chrome.tabs.remove(activeTabId).catch(() => {});
            await renderYou();
          } catch (e) {
            toast(e.message);
          } finally {
            (/** @type {any} */ (t)).disabled = false;
            t.textContent = plan === "pro" ? "Upgrade to Pro" : "Upgrade to Plus";
          }
        }).catch((e) => {
          (/** @type {any} */ (t)).disabled = false;
          t.textContent = plan === "pro" ? "Upgrade to Pro" : "Upgrade to Plus";
          toast(e.message);
        });
        break;
      }
    case "apply-card": startApply(); break;
    case "set-mode":
      (async () => {
        const { studySets } = await bundle();
        const set = setFor((/** @type {any} */ (t)).dataset.id, studySets);
        if (!set || (set.mode || "general") === (/** @type {any} */ (t)).dataset.mode) return;
        set.mode = (/** @type {any} */ (t)).dataset.mode;
        await saveStudySet(set);
        toast((/** @type {any} */ (t)).dataset.mode === "coding" ? "Coding mode on — review now asks for code." : "General mode on.");
        renderSetDetail((/** @type {any} */ (t)).dataset.id, "summary");
      })();
      break;
    case "start-coding": startCodingPractice(id); break;
    case "set-share": toggleSetShare(id); break;
    case "share-copy": copyShareCode((/** @type {any} */ (t)).dataset.code, t); break;
    case "share-revoke": revokeShareFor((/** @type {any} */ (t)).dataset.id); break;
    case "open-team": renderTeam(id); break;
    case "team-create": renderTeamCreate(); break;
    case "team-create-save": createTeamFromForm(); break;
    case "team-join": joinTeamFromInput(); break;
    case "team-leave": leaveTeam(id); break;
    case "nav-teams": renderTeams(); break;
    case "nav-you": renderYou(); break;
    case "select-all":
      (/** @type {any} */ (t)).select();
      copyShareCode((/** @type {any} */ (t)).value, t.nextElementSibling);
      break;
    case "share-lookup": lookupShare(); break;
    case "share-import": importSharedSet(); break;
    case "code-check": checkCode(); break;
    case "code-next": codingNext(); break;
    case "apply-check": checkApply(); break;
    case "apply-next": applyNext(); break;
    case "start-typed": startTypedPractice(id); break;
    case "typed-check": checkTyped(); break;
    case "typed-next": typedNext(); break;
    case "clear-exam": setExamDate(id, null).then(() => renderSetDetail(id, "cards")); break;
    case "add-card": promptAddCard(id); break;
    case "card-edit": setEditingCardId(id); paintDetail(); break;
    case "edit-cancel": setEditingCardId(null); paintDetail(); break;
    case "edit-save":
      saveCardEdit(currentDetail().session.id, id).then(() => {
        setEditingCardId(null);
        openDetailTab("cards");
      });
      break;
    case "card-del":
      if (confirm("Delete this card?")) deleteCard(currentDetail().session.id, id).then(() => paintDetail());
      break;
    // case "export-tsv": exportSetTsv(id); break; // paused with the export button
    case "gen-summary": generateSummary(id); break;
    case "export-backup": exportBackup(); break;
    case "import-backup": document.getElementById("backupFile")?.click(); break;
    case "auth-signin": authSubmit("login", t); break;
    case "auth-register": authSubmit("register", t); break;
    case "auth-google": authGoogle(t); break;
    case "auth-google-cancel":
      if (googleAbortController) googleAbortController.abort();
      break;
    case "auth-signout":
      logout().then(() => {
        toast("Signed out. Your sets stay on this device.");
        renderAuthGate();
      }).catch((e) => toast(e.message));
      break;
    case "exam-pick": openExamPicker(); break;
    case "exam-clear":
      (async () => {
        const { studySets } = await bundle();
        for (const s of studySets) if (s.examDate) await setExamDate(s.sessionId, null);
        toast("Exam cleared");
        renderHome();
      })();
      break;
    case "picker-save": saveExamSelection(); break;
    case "quiz-len":
      app.querySelectorAll(".qlen").forEach((b) => {
        const on = b === t;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      /** @type {HTMLElement} */ (app.querySelector('[data-action="start-quiz"]')).dataset.n = (/** @type {any} */ (t)).dataset.n;
      break;
    case "start-quiz":
      startQuizForCurrentSet(Number((/** @type {any} */ (t)).dataset.n) || 0);
      break;
    case "quiz-after-review":
      (async () => {
        const id = (/** @type {any} */ (t)).dataset.id;
        const { studySets } = await bundle();
        const set = setFor(id, studySets);
        if (set?.quiz?.length) startQuiz(set, "set:" + id, quickQuizLen(set));
      })();
      break;
    case "quiz-opt": answerQuiz(Number((/** @type {any} */ (t)).dataset.i)); break;
    case "quiz-next": quizNext(); break;
    case "import-preview": previewImport(); break;
    case "import-save": doImport(); break;
    case "import-file": document.getElementById("importFile")?.click(); break;
    case "close-focus":
    case "return-focus": goReturn(); break;
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if ((/** @type {any} */ (t)).id === "examDate" && (/** @type {any} */ (t)).dataset.session) {
    const ms = (/** @type {any} */ (t)).value ? new Date(`${(/** @type {any} */ (t)).value}T23:59:59`).getTime() : null;
    setExamDate((/** @type {any} */ (t)).dataset.session, ms).then(() => {
      toast(ms ? "Exam date set. Cards will resurface before it." : "Exam date cleared");
      renderSetDetail((/** @type {any} */ (t)).dataset.session, "cards");
    });
  } else if ((/** @type {any} */ (t)).id === "homeExamDate") {
    // Date changed on Home: if an exam already exists, move it for every
    // selected set; otherwise draft it and go pick sets.
    const ms = (/** @type {any} */ (t)).value ? new Date(`${(/** @type {any} */ (t)).value}T23:59:59`).getTime() : null;
    (async () => {
      const { studySets } = await bundle();
      const selected = studySets.filter((s) => s.examDate);
      if (selected.length && ms) {
        for (const s of selected) await setExamDate(s.sessionId, ms);
        toast("Exam date updated");
        renderHome();
      } else {
        setExamDraft({ date: ms, picked: new Set() });
        openExamPicker();
      }
    })();
  } else if ((/** @type {any} */ (t)).id === "pickerDate") {
    if (examDraft) examDraft.date = (/** @type {any} */ (t)).value ? new Date(`${(/** @type {any} */ (t)).value}T23:59:59`).getTime() : null;
  } else if ((/** @type {any} */ (t)).classList?.contains("picker-check")) {
    if (examDraft) (/** @type {any} */ (t)).checked ? examDraft.picked.add((/** @type {any} */ (t)).dataset.id) : examDraft.picked.delete((/** @type {any} */ (t)).dataset.id);
  } else if ((/** @type {any} */ (t)).id === "backupFile" && (/** @type {any} */ (t)).files?.[0]) {
    importBackupFile((/** @type {any} */ (t)).files[0]);
    (/** @type {any} */ (t)).value = "";
  } else if ((/** @type {any} */ (t)).id === "importFile" && (/** @type {any} */ (t)).files?.[0]) {
    const file = (/** @type {any} */ (t)).files[0];
    (/** @type {any} */ (t)).value = "";
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      (/** @type {any} */ (document.getElementById("importText"))).value = text;
      // Auto-title from the filename ("Spanish Verbs.txt" -> "Spanish Verbs"),
      // and default the term separator to Tab — Anki's plain-text export format.
      const titleEl = document.getElementById("importTitle");
      if (titleEl && !/** @type {HTMLInputElement} */ (titleEl).value.trim()) {
        /** @type {HTMLInputElement} */ (titleEl).value = file.name.replace(/\.(txt|csv|tsv)$/i, "").replace(/[_-]+/g, " ") || "Imported";
      }
      if (/\.tsv$/i.test(file.name) || /\.txt$/i.test(file.name)) {
        (/** @type {any} */ (document.getElementById("termSep"))).value = "\\t";
        (/** @type {any} */ (document.getElementById("cardSep"))).value = "\\n";
      }
      previewImport();
    };
    reader.readAsText(file);
  }
});

// extra actions that need the add-card form state
document.addEventListener("click", (e) => {
  const t = (/** @type {any} */ (e.target)).closest("[data-action]");
  if (!t) return;
  if ((/** @type {any} */ (t)).dataset.action === "add-cancel") openDetailTab("cards");
  if ((/** @type {any} */ (t)).dataset.action === "add-save") saveNewCard((/** @type {any} */ (t)).dataset.id);
});
// bottom nav
nav.addEventListener("click", (e) => {
  const b = (/** @type {any} */ (e.target)).closest("button[data-nav]");
  if (!b) return;
  const n = b.dataset.nav;
  if (n === "review") return startGlobalReview();
  if (n === "home") renderHome();
  else if (n === "sets") renderSets();
  else if (n === "teams") renderTeams();
  else if (n === "you") renderYou();
});

// --- first-launch auth gate: an account is required (backend-first) ---------
(async function init() {
  registerTabs({ home: renderHome, sets: renderSets, teams: renderTeams, you: renderYou });
  const auth = await getAuth();
  if (!auth?.accessToken) {
    renderAuthGate();
    return;
  }
  renderHome();
  syncNow().catch(() => {});
})();

