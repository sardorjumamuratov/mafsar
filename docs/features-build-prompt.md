# Mafsar — Client Feature Plan & Build Prompt

Client-side (no-backend) features that run in the existing extension using the user's own LLM key.
Two parts: **the plan**, then a **self-contained build prompt** to hand to a coding agent.

---

## Part 1 — The plan

### What exists today (so features hook in, not rebuild)
- **Content scripts** (`src/content/`) capture chats from ChatGPT/Claude/Gemini and inject "Save to Mafsar"; Quizlet import.
- **Service worker** (`src/background/service-worker.js`) routes messages and calls the LLM via `src/llm/generate.js` (multi-provider: Gemini/Groq/Anthropic).
- **Panel** (`src/ui/panel.js` + `panel.css` + `panel.html`) — app shell: Home / Sets / Review / Teams / You, with a teal design system.
- **Storage** (`src/storage/store.js`): `sessions`, `studySets` (`{ sessionId, title, flashcards[], quiz[] }`, cards carry SM-2 fields), `activity` (streaks). Helpers: `saveStudySet`, `updateCard`, `bumpActivity`, `computeStreak`, `weekActivity`.
- **SRS** (`src/storage/srs.js`): `initSchedule`, `review(card, grade)`, `isDue`, `byDue`, `masteryOf`.

### Features to build (priority order — highest demo/retention value first)
1. **Exam date + readiness + adaptive scheduling** — per-set exam date; countdown, on-track/behind, daily target; cap review intervals so cards resurface before the date.
2. **AI short-answer grading** — a question type where the user types an answer and the LLM scores it against the source + gives feedback (the "AI assessment" pillar).
3. **Apply / fresh hypotheticals** — an opt-in practice step that generates a *new* scenario each review testing the same concept, then grades the typed answer (adaptive + habit). Works for any set; no modes system required.
4. **Weak-topic insights + personalized forgetting** — from a local `reviewLog`, surface weak concepts and "you'll likely forget X by Friday."
5. **Conversation summary + key concepts** — a TL;DR tab per set.
6. **Local study reminders** — `chrome.alarms` + `chrome.notifications`: "24 cards due."
7. **Card editing** (add / edit / delete) and **export/backup** (Anki/CSV + JSON restore).

> **Modes** (general/coding/law/medicine subject templates) are deferred — see Part 3.

### Guardrails (carry into every LLM feature)
- **Ground in the source**: generate/grade only from the user's captured conversation or pasted text; **never fabricate citations/facts** (critical for law/medicine).
- Keep everything **offline/local**; the user's own API key; no new servers.
- **Never store PHI**; keep sensitive-subject content local.
- Preserve cross-browser support (Chrome + Firefox); use `chrome.*` callback style already used in the panel.

---

## Part 2 — The build prompt (hand this to a coding agent)

> **Copy everything below into a fresh coding session, in the Mafsar repo.**

---

You are extending **Mafsar**, an existing MV3 browser extension (Chrome + Firefox) that captures AI-chat learning sessions and turns them into flashcards, quizzes, and spaced-repetition reviews. All code is **vanilla JS ES modules, no build step**. Study data lives in `chrome.storage.local` via `src/storage/store.js`; SM-2 scheduling is in `src/storage/srs.js`; the side panel UI is `src/ui/panel.js` (+ `panel.css`, `panel.html`); LLM calls go through the service worker (`src/background/service-worker.js` → `src/llm/generate.js`, multi-provider). Match the existing code style, the teal design tokens/classes in `panel.css`, cross-browser `chrome.*` callback usage, and the `esc()` helper for any user text injected into HTML.

Build these features **in order**, each self-contained and shippable:

### 1. Exam date + readiness + adaptive scheduling
- Add an optional `examDate` (epoch ms) to a study set. New store helper `setExamDate(sessionId, examDate|null)`.
- In the **set detail** view add a `<input type="date">` to set/clear the date, plus a **readiness panel**: days left, `% ready` (reuse `summarize().progress`), an **on-track/behind** status, and a **daily target** (`ceil(remaining / daysLeft)`).
- **Adaptive scheduling:** when grading a card in a set with a future `examDate`, clamp the new `dueDate` to `≤ examDate` so cards keep resurfacing before the exam. Pass `examDate` through the review queue items.
- On **Home**, show a compact "🎯 next exam" card (soonest future date) linking to the set.

### 2. AI short-answer grading (assessment)
- New question type: show a prompt, a `<textarea>`, and a **Check** button.
- Add a service-worker message `GRADE_ANSWER { question, reference, answer }` that calls the LLM (via `generate.js`'s provider layer) with a grading prompt and returns `{ score: 0..100, correct: bool, feedback }`. **Ground strictly in `reference` (the card's back / source); never invent facts.**
- Render score + feedback; count it toward activity/streak.

### 3. Apply / fresh hypotheticals
- Add `GENERATE_HYPOTHETICAL { concept }` → `{ scenario, rubric }`: a new scenario testing a concept (use the card front/back as the concept). No modes system required.
- In review, offer an opt-in "Apply" step: show the generated scenario, take a typed answer, grade it via `GRADE_ANSWER` using the rubric. Generate a **new** scenario each time (don't cache) so repeated practice stays fresh.

### 4. Weak-topic insights + personalized forgetting
- Add a local `reviewLog` in storage: on each grade, append `{ cardId, sessionId, grade, at }` (cap length, e.g. last 2,000).
- Add an **Insights** card (Home or You): concepts most often failed (from low grades), and a simple **forgetting prediction** per weak card (e.g., cards with low easiness + near due date → "likely to forget soon — review now"). One optional LLM call can phrase a natural-language summary from the weak card fronts.

### 5. Conversation summary + key concepts
- Extend generation (or a separate `SUMMARIZE` message) to produce a `summary` + `keyPoints[]` stored on the set; render in the set detail **Summary** tab.

### 6. Local study reminders
- Add `alarms` + `notifications` permissions. A daily `chrome.alarms` alarm checks due-card count and fires a `chrome.notifications` reminder ("24 cards due in Mafsar"). Add a toggle + time in options.

### 7. Card editing + export/backup
- Set detail: add/edit/delete individual cards.
- Export a set to **Anki-friendly TSV / CSV**; export/import **all data as JSON** (backup/restore) from the You screen.

### Requirements
- Everything works **offline with the user's own key**; no backend.
- **Grounding & safety:** generation/grading use only user-supplied content; cite the source; never fabricate legal citations or medical facts; **never persist PHI**.
- Keep it cross-browser (Chrome side panel + Firefox sidebar) and match the existing design system.
- Add small tests for pure logic (readiness math, interval clamping, weak-topic ranking) using `node --check`/`--input-type=module`, as the repo already does.

Deliver features 1–3 fully working first (they carry the demo), then 4–7.

---

## Part 3 — More features we could add later

**Study/content**
- Cloze (fill-in-the-blank) card type; "Explain this again" (re-ask the LLM on a card); text-to-speech (language learning / accessibility); capture from any webpage/PDF, not just AI chats; highlight-to-card on any page.

**Engagement/habit**
- "Daily challenge" (one hypo/question a day); confidence-based review (rate how sure you were); goals & badges; per-set + global streak freeze.

**Adaptive/AI**
- **Subject modes** (`general | coding | law | medicine`): per-set templates that change the generation prompt + card types — law → IRAC rule cards + hypotheticals; coding → "write the code" challenges; medicine → clinical-vignette MCQs (with a stronger grounding disclaimer). `generate` / `GRADE_ANSWER` / `GENERATE_HYPOTHETICAL` take an optional `mode` param. *(Deferred from the main build.)*
- Difficulty auto-tuning per learner; auto-generate an MCQ quiz from imported flashcards (fixes "imported sets have no quiz"); learning-path suggestions ("next, study X").

**Organization/UX**
- Tags/folders; search across all cards; keyboard shortcuts in review; manual light/dark toggle; onboarding flow.

**Backend-dependent (separate roadmap — see `backend-build-prompt.md`)**
- Accounts + cross-device sync, mobile app, teams/shared decks + leaderboards, no-API-key generation, community marketplace, subscriptions, server-scheduled push.
