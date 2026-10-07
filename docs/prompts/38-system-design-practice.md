# 38 — System design practice: guided and interview styles, better feedback, gaps into cards

**Branch:** `feat/system-design-practice`
**Depends on:** the study-mode shell (`src/ui/flows/shell.js`, `.st-*` in `panel.css`), already on `main`.
**Touches:** `src/ui/flows/{design,estimation,bottleneck,shell}.js`, `src/ui/views/{set-detail,you}.js`, `src/ui/panel.{js,css}`, new pure modules in `src/storage/`, `src/background/service-worker.js`, `src/sync/api.js`, `server/src/{llm,schema,app,crypto}.ts`, `server/tests/`, `tests/`, `tests/harness/panel-harness.html`, `manifest.json` (version only).

Follow `AGENTS.md` throughout: test first, one branch, no `innerHTML`, no inline handlers, every `send({type})` routed in the worker, migrations append-only, no new permissions, no secrets, no new third-party data flows.

---

## 0. What this is

Mafsar turns AI chats and web pages into flashcard sets. A set in **System design** mode offers three practice modes besides the standard four: **Design brief** (`flows/design.js`), **Estimation** (`flows/estimation.js`) and **What breaks** (`flows/bottleneck.js`). They run in the side panel (about 390 × 884 px, dark and light themes, Geist).

Today all three follow one loop: read a prompt, write a large answer, submit, get a verdict. Change it to:

> Understand the task → make a decision → explain reasoning → get targeted feedback → improve or continue → save weak concepts as flashcards.

It must feel like deliberate practice, not a homework form. Prioritise clear next actions, low blank-page anxiety, and realistic interview practice when the learner wants it. Don't add complexity that doesn't serve that.

**Do not rebuild.** Modify the existing implementation, keep existing APIs and grading logic wherever possible, and keep every current study mode (including the non-design modes) working.

---

## 1. How the system really works (read before planning)

The requirements this prompt comes from were written for a generic backend with study-session tables, per-session endpoints and feature flags. Mafsar is not built that way. Map every requirement onto what exists, and **record each mapping in the deviation table (§3)**. Never build large new infrastructure (session tables, a flag service, analytics) to satisfy a requirement literally without asking.

What exists:

- **Drills are stateless on the server.** Routes in `server/src/app.ts`:
  `POST /v1/design-task`, `/v1/design-grade`, `/v1/design-curveball`, `/v1/estimation-task`, `/v1/estimation-summary`, `/v1/bottleneck-task`, `/v1/bottleneck-hint`, `/v1/bottleneck-grade`.
  Task routes use `requireQuota(db, "practice")`; follow-up routes use `limitByUser(limits.llmPerUser)`. Bodies are validated with zod schemas in `server/src/schema.ts` (`MAX_DESIGN_ANSWER = 4000`). Every route is authenticated.
- **Hidden data travels in sealed tokens.** `encryptState` / `decryptState` (`server/src/crypto.ts`, AES-256-GCM) carry the What breaks flaw and the clinical case. Tokens are **not bound to a user and never expire**. `openState()` in `llm.ts` turns a bad token into `BadStateError` (400).
- **The extension calls the server through the worker:** the panel's `send({type})`, then a `case` in `service-worker.js`, then `src/sync/api.js` (`post("/v1/…")`).
- **Response shapes today** (`server/src/llm.ts`):
  - Design task: `{ brief, rubric }`. The rubric is **sent to the client in plain text** and sent back at grading.
  - Design grade: `{ rubric_evaluation[{point,status,note}], sections[{section,verdict,note}], next_time }`.
  - Estimation task: `{ questions[{question, reference_value, reference_unit, worked_solution}] }`. **Reference answers and worked solutions are already on the client before answering.** Grading is deterministic and **client-side** (`src/storage/estimation.js`: 2× / 10× bands, unit-kind mismatch).
  - Estimation summary: `{ habit_to_fix }`.
  - Bottleneck task: `{ narrative, architecture: string[], state }`.
  - Bottleneck hint: `{ hint }`.
  - Bottleneck grade: `{ found_flaw, explanation_correct, fix_works, other_valid_issue, feedback, score, usedHint, planted_flaw, why_it_fails, model_solution }`. The client sends `usedHint` and the server trusts it.
- **History is client-side.** A finished drill writes one review-log row through `drillLogEntry({ kind, sessionId, fraction, id })` (`src/storage/drill-log.js`), synced by `/v1/sync`. The server's `reviewSchema` keeps only `id, cardId, grade, prevInterval, newInterval, reviewedAt, kind, stability, difficulty`, and zod strips unknown fields. Extra fields on a row therefore stay on the device. They don't break sync, but they don't reach other devices either. Never put a field on a row that could fail the schema: one bad row fails the whole sync batch.
- **Cards are client-side.** `addCard(sessionId, front, back)` in `src/storage/store.js` creates a card with every required field. Cards sync through `shared/sync-map.js`, whose field list is a whitelist.
- **Settings** live in `chrome.storage` through `saveSettings({...})`; the set detail already stores `settings.studyMode`.
- **Scores today:** Design = rubric coverage, partial counting half (`rubricScore`). Estimation = correct 1, close 0.5, otherwise 0. What breaks = server score out of 3, minus 0.5 when a hint was used, logged as `score / 3`.
- **There are no feature flags, no product analytics, and no server-side drill history.** The privacy policy (`server/src/privacy.ts`, lines ~55–58) already says drill answers go to the AI service only to grade or reply and aren't stored.
- **Model budget:** the Groq free tier allows 8,000 tokens per minute, *including the requested completion*. Keep new outputs small and never add a model call per keystroke or per field.
- The UI shell: `paintShell`, `verdictRow`, `bindField`, `primaryBtn`/`secondaryBtn`/`textBtn`, `waitRow`, `icon`, the `keys` handler, and `exitStudy` (close confirmation). Tokens are declared as `--st-*` in **both** theme blocks at the top of `panel.css` (`tests/redesign.test.mjs` forbids raw hex outside them). Visual references: `docs/design/06-study.html` and `08-system-design.html`.
- The phone app (`mobile/`) has none of these modes, but it shares `shared/` and syncs cards. It must keep type-checking and passing its tests, and cards saved here must review there normally.

---

## 2. Phase 0: inventory and decisions (no product code yet)

Before writing code, write `docs/notes/38-inventory.md` (or put it at the top of your report) summarising:

1. The current relevant endpoints.
2. Their current request and response shapes, verified in code (not copied from §1).
3. Which existing fields can be reused.
4. Which changes can stay frontend-only.
5. Which backend changes are required.
6. Every compatibility risk, especially old extension versions (0.3.x) talking to the new server, and old sealed tokens.

Also confirm by reading the code: routes and handlers, schemas, the DB models and migrations (`server/src/db.ts`), prompt builders, the model provider integration (`callJson`), grading functions, persistence, auth, rate limits, retries, logging, error format, the frontend API clients, and the existing tests.

Then fill in the **deviation table** (§3) and ask the user **only** about the open decisions in §3. Proceed with everything else.

---

## 3. Decisions and deviations

Recommended defaults are marked ★. If the user doesn't object, use them.

| # | Requirement as written | Reality | Recommendation |
|---|---|---|---|
| D1 | `POST /study-sessions/:id/...`, session ownership checks | No sessions; stateless routes plus sealed tokens | ★ Keep the `/v1/*` routes; add new routes as `/v1/design-checkpoint` and `/v1/drill-card-suggestions`. Make new tokens carry `uid` (the authenticated user) and `iat`. Reject a token whose `uid` differs, or one older than 24 h, as `EXERCISE_EXPIRED`. Tokens without `uid` (old) stay accepted. |
| D2 | Persist `practiceStyle` and session metadata on the server; DB migration | No drill table; review rows strip extra fields | ★ No migration. Keep metadata on the local drill-log row (§12). Server-side storage of drill metadata is future work. |
| D3 | Estimation: re-parse and grade on the server; don't send reference answers before submission | Graded client-side; references already on the client | ★ Keep deterministic client-side grading as the source of truth (it is personal study history, not a competitive score). Validate and bound the summary payload on the server. Record the exposure as a known limitation. Alternative, only if the user asks: a non-AI `/v1/estimation-check` route with a TypeScript port of the parser plus parity tests. |
| D4 | Hidden rubric not exposed before submission | `rubric` is returned in plain text today | ★ Add a sealed `state` (rubric, constraints, `practiceStyle`, `uid`, `iat`) to the design-task response. `/v1/design-grade` prefers `state` over `rubric`. **Keep returning `rubric`** for old clients; the new client ignores it and never displays it. Removing it is future work, after `MIN_CLIENT_VERSION` passes this release. |
| D5 | Feature flags (`systemDesignCheckpoints` and others) | No flag system | ★ Server env kill switches, read once: `DESIGN_CHECKPOINTS` and `DRILL_CARD_SUGGESTIONS` (both default **on**; `off` returns `404 {error:"feature_disabled"}`). The client hides the matching action when it gets `feature_disabled`. Checkpoints are only ever user-triggered ("Check my thinking"), never automatic. |
| D6 | Launch-screen override of the practice style | Modes start straight from the set detail's study button | ★ A compact "Style: Learn concepts ▾" control next to the start button for the three design modes. It opens the style sheet with a "Make this my default" checkbox (unchecked = this session only). |
| D7 | Observability metrics | No analytics; privacy promises minimal data | ★ No client analytics. Server: one structured log line per drill operation (operation label, latency, success or failure, practiceStyle), with no answer text. Product metrics (completion rate, save rate) become future work. |
| D8 | Timer in Interview simulation | No time limits exist | ★ An elapsed timer only (mm:ss under the mode label, from `Date.now()` stored in state, so repaints don't reset it). No hard limit. |
| D9 | `POST /flashcards/from-suggestions` with server-side ownership | Cards are created locally | ★ The server only *suggests* (`/v1/drill-card-suggestions`, user-triggered). Saving goes through local `addCard`, with client-side duplicate checks. No save endpoint. |

Anything else you find that doesn't fit gets a row of its own. Don't silently pick.

---

## 4. Practice style

Two styles, with internal values `"guided"` and `"simulation"`.

**Pure module** `src/storage/practice-style.js` (unit tested):
- `PRACTICE_STYLES`: a registry `{ guided: { label: "Learn concepts", short: "Guided", description, icon }, simulation: { label: "Interview simulation", short: "Simulation", description, icon } }`. Build it so a third style (`adaptive`, which would reduce guidance as the learner improves) is one new entry plus behaviour flags. **Don't build Adaptive.**
- Behaviour flags per style, read by the flows instead of `if (style === "guided")` scattered around: `checkpoints`, `conceptChips`, `stepByStep`, `structuredBottleneck`, `hintPenalty`, `progressiveHints`, `workingOpen`, `scaffolds`.
- `resolveStyle(settings, override)`: the override, else `settings.systemDesignPracticeStyle`, else `null` (which means ask).

**First-run selector.** When a design mode starts and no preference is saved, open a bottom sheet (`openSheet`) before the drill:
- Title: **"What are you practicing for?"**
- Two option rows (not cards nested in cards), each a full-width button with an icon, title and one-line description:
  - **Learn concepts**: "Get guidance, optional hints, and feedback as you go." Icon: a compass-style line icon.
  - **Interview simulation**: "Practice under realistic conditions and review feedback at the end." Icon: a stopwatch line icon.
  - Add both icons to `ICONS` in `shell.js`: 24-grid, stroke 2, no emoji.
- Helper text: **"You can change this anytime in Practice settings."**
- Choosing saves `settings.systemDesignPracticeStyle` and starts the drill. Dismissing starts nothing.

**Override before a session** (D6): a "Style: Guided" / "Style: Simulation" control next to the set detail's start button, shown only for the three design modes. It opens the same two options plus "Make this my default".

**Practice settings:** a "Practice style" row on the You tab opens the same sheet and shows the current value. Never ask every session. Both styles are available in all three modes.

Send the resolved `practiceStyle` with every new or changed drill request (optional on the server; §9).

---

## 5. Shared UI rules

Keep: the 56 px top bar; close on the left (with confirmation when there's progress); progress in the middle; the counter on the right; the scrolling body; the pinned dock; **at most one filled teal primary per screen**; outlined secondaries; both themes; Geist; keyboard support.

Use: clear hierarchy, comfortable spacing for a narrow panel, tap targets of at least 40 px, a calm and serious tone. Teal for the primary action and positive completion. Amber for incomplete, partial, risky or incorrect. **No red for learning mistakes.** Icons support labels and never replace them. No emoji, no cards inside cards, no decorative clutter, no boxed notes, no horizontal layouts with tiny text (the existing scrollable chip row is fine).

Loading copy (replace the current strings):
- Design brief: **"Building a design exercise from your cards…"**
- Estimation: **"Creating estimation questions from this set…"**
- What breaks: **"Setting up an architecture to debug…"**

Never show model details, prompts, hidden rubrics or sealed flaw data before grading. Keep the existing error, retry and exit states (a failed task call shows the error and returns; a failed grade keeps the learner's answer on screen and lets them retry).

### Shared components to build (in `shell.js` or a sibling `flows/practice-ui.js`)

Reuse them across the three modes. Don't duplicate mode logic.
- `feedbackSummary({ strongest, gap, scoreLine })`: the top of every feedback screen (§6).
- `constraintAnchor(constraints)`: §7.3.
- `styleBadge(style)`: a small muted label, e.g. under the mode label.
- `suggestionSheet(...)`: §6.1.
- `selectableRail(components, state)`: §9.1, an extension of the existing rail.
- The verdict row, top bar, progress and dock come from the existing shell.

---

## 6. The learning loop (every mode)

1. A small, concrete challenge.
2. The learner makes a decision or explains.
3. Feedback at the right time for the style (during, in Guided; at the end, in Simulation).
4. Name the **strongest part** of the response.
5. Name **one high-leverage gap**.
6. Offer to turn missed concepts into review cards.
7. Save the drill score and metadata to history.

**Every feedback screen opens with:** "Strongest part", then "Highest-leverage gap", then the score or coverage line, then the mode's detail. If the server returns `null` for either (it may; §9.6), omit that line. Never invent one on the client.

### 6.1 Turn gaps into review cards

After feedback, show a text action: **"Turn gaps into review cards"**. It is optional and never automatic.
- Tapping it calls `/v1/drill-card-suggestions` (§9.5), shows a short wait row, then opens the shared sheet with **at most 3** suggestions. Each shows its front (an active-recall question) and back (a concise explanation) with a checkbox; all start checked.
- Sheet actions: primary **"Add selected cards"**, quiet **"Not now"**.
- Sources: missed or partial rubric points, weak concepts, wrong estimation conversions, wrong units, missed bottlenecks, missing trade-offs. Estimation cards teach **transferable habits**, not the exact question.
- **No duplicates.** Before showing a suggestion, compare it with the set's cards using a pure `normalizeFront()` (lowercase, strip punctuation, collapse whitespace, drop articles) plus a token-overlap threshold (e.g. Jaccard ≥ 0.7) in a new tested module `src/storage/card-dedupe.js`. Hide matches and say how many were skipped ("1 is already in your set"). Also send the set's existing fronts (up to 50, truncated) to the server so the model avoids them.
- Save with `addCard(sessionId, front, back)`: normal default review state, no rescheduling. Record the created card ids on the drill-log row (§12).
- If the call fails or is disabled, hide or disable the action with a quiet line. The drill stays complete.

---

## 7. Design brief

### 7.1 Guided ("Learn concepts")

Replace the six blank sections with **four steps** built on the **same** brief and rubric generation (don't drop the estimates, API, data-model, components or trade-off concepts):

| Step | Question | Hint | Optional concept chips | Sent to the server as |
|---|---|---|---|---|
| 1 Requirements | "What must the system do for users?" | "Start with the main action, then add one important constraint." | Create, Read, Update, Delete, Authentication, Rate limiting | `requirements` |
| 2 Scale | "What number should shape your design first?" | "Think about requests, users, storage, or read/write ratio." | QPS, Daily active users, Read/write ratio, Storage growth, Peak traffic | `estimates` |
| 3 Architecture | "Which components would handle the request?" | "Describe the request path from user to data." | Load balancer, Cache, Queue, Database, Object storage, Worker | `components` (API and data-model ideas count here; see §9.2) |
| 4 Risks and trade-offs | "What could break first, and what would you trade off to prevent it?" | "Name one failure risk and one cost or complexity trade-off." | Hot key, Single point of failure, Consistency, Latency, Cost, Operational complexity | `tradeoffs` |

On each step:
- The question (prompt style), the one-line hint, then a **short** textarea (min 96 px, grows naturally; not 180 px).
- Concept chips are **prompts, not answers**. Tapping one shows a one-line question about that concept under the chips (a static copy table, e.g. Cache: "What would you cache, and when does it go stale?"). Tapping never inserts text into the answer.
- Secondary **"I'm not sure"** reveals progressively more specific hints: level 1 the step's generic hint, level 2 a more specific static hint, level 3 a hint pointing at the brief's own constraints from the anchor. No AI call. Guided hints never reduce the score.
- Primary **"Check my thinking"** (only when the field has text and checkpoints aren't disabled) sends only this step's answer plus brief context to `/v1/design-checkpoint` (§9.3). It shows coaching, not a grade:
  - **"You covered:"** one useful strength.
  - **"Consider adding:"** one missing high-value idea.
  - Then: secondary **"Improve this"** (focus the field) and primary **"Continue"**.
- Without a checkpoint, **"Continue"** is the primary action directly. **"Finish early"** is always available as a quiet action.
- Drafts survive moving between steps, the outline, expanding the brief, and the style sheet.

**Outline review** (after step 4): **"Your design outline"** shows the four answers as a readable outline. Tap a section to edit it (back to that step). Primary **"Submit design"**, secondary **"Finish early"**, with the line **"Unanswered areas will be marked as skipped."** when any are empty.

### 7.2 Simulation ("Interview simulation")

Keep the current six sections (Requirements, Estimates, API, Data model, Components and flow, Trade-offs) for realism:
- The mode label reads "Design brief · Interview simulation".
- An elapsed timer (D8).
- No checkpoints, no concept chips. Hints stay short and subtle (the existing one-liners).
- Sections stay optional, with per-section drafts (already there).
- A compact summary at the top: "3 of 6 sections written" next to the chip row.
- Rename **"Submit now"** to **"Finish early"**. The last section's primary stays **"Submit design"**.

### 7.3 Constraint anchor (both styles)

Once the learner starts writing (the field has focus or text), pin the brief's most important constraints near the active field: one line of up to 3–4 short pills, e.g. "5k writes/s · reads 100× writes · p99 under 50 ms". It is sticky at the top of the scroll body, uses little vertical space, and stays readable. Tapping it opens the full brief in the shared sheet. The constraints come from a new optional `constraints` field on the design task (§9.2). If it's missing (an old server), show no anchor and keep "Show full brief".

### 7.4 Feedback

Keep the rubric grading. Order:
1. Strongest part.
2. Highest-leverage gap.
3. Coverage line: "Rubric coverage: 3 of 5 points".
4. Per-section rows. Guided shows the four steps. Simulation shows six.

Status language: **Covered**, **Partly covered**, **Not addressed yet**, **Skipped**. Nothing harsh.

Rename **"See a model answer"** to **"Compare your approach"**. Never promise a written model answer; there isn't one. Expanded, it shows:
- "A strong answer covers": rubric items with covered, partial or missed states and a note tied to the learner's answer.
- "Next time": one concrete habit.

Then "Turn gaps into review cards" (§6.1).

---

## 8. Estimation

### 8.1 Both styles

Keep: one question at a time; one numeric answer field; the existing parser and suffixes; tolerance (within 2×: Correct; within 10×: Close; beyond: Not quite); unit-kind mismatch detection; worked solutions; "Don't know".

Input: label **"Your estimate"**, placeholder **"e.g. 12k QPS, 300 TB, 2.5 GB/s"**, tabular numerals, autofocus, Enter checks. The layout stays put after checking (nothing above moves).

Below the input, a disclosure: **"Show rough working (optional)"**. When open, it shows a light multiline working field. Where the question supports it, the field is prefilled with an **editable** scaffold from the question's optional `scaffold` lines (§9.4), e.g. "50M users × 20 requests/day = ?" and "? requests/day ÷ 86,400 = ? QPS". Never show correct values before checking.

Working is saved with the answer, and feeds feedback **without a model call per question**:
- Client-side deterministic diagnosis in a new tested module `src/storage/estimation-diagnose.js`. It recognises ratios near 24, 60, 3,600 and 86,400 (time-unit slips), near 8 (bits vs bytes) and near 1,000 or 1,024 (prefix slips), and peak vs average when the question flags it. It returns one plain sentence or `null`.
- Any model analysis of working is **batched once at round end**, in the existing summary call (§9.4).

### 8.2 Guided

- "Show rough working" open by default.
- One plain-language nudge per question, from the optional `nudge` field, e.g. "Convert daily totals to seconds before finding QPS.", "Estimate the size of one record before multiplying by total records.", "Separate average traffic from peak traffic."
- When the question has `traffic` set, an optional selector **"Traffic assumption: Average / Peak"** with one short line: production systems need headroom above average traffic.
- The first press of "Don't know" reveals the first-step hint (`first_step`). The second press records Don't know and shows the full working.
- After checking: the verdict, the learner's input, the likely reasoning issue (if detectable), the worked solution, the reference answer. Primary **"Next question"**.

### 8.3 Simulation

Only the numeric field shows at first. "Show rough working" stays collapsed. No scaffolding, nudges or Average/Peak guidance before answering, unless the question itself asks for peak. Keep it fast. After checking, show the full working and explanation.

### 8.4 Feedback and round summary

- Ring: teal for correct, amber for close, wrong or unit mismatch. Never red.
- One verdict label: **"Correct · within 2×"**, **"Close · right order of magnitude"**, **"Not quite"**, **"Unit mismatch"** (new: a mismatch is no longer reported as "Not quite").
- On a unit mismatch, say it plainly: "This question asks for a rate, but your answer is a data size." (from `mismatchNote`; reword it to this form).
- **Round complete:** the score, the list of results, **"Strongest habit"**, **"Most useful habit to improve"** (e.g. "Convert per-day totals into per-second values before sizing capacity.", "State whether you are estimating average or peak traffic.", "Keep data size and data rate units separate.", "Estimate one user or object first, then multiply."), then "Turn gaps into review cards".

---

## 9. What breaks

### 9.1 Interactive architecture

Keep the vertical rail in request order. **Every component row becomes a button.** Keyboard, mouse and touch all work, and `aria-pressed` reflects selection.
- States: default; selected = "Possible bottleneck" (accessible teal outline or subtle tint, plus the text "Possible bottleneck"; never colour alone); after grading, the confirmed failing component is amber. If the learner picked a different component that the grader confirms as a real issue, show it as a valid alternate concern.
- Tapping never reveals correctness or the flaw. Show the inline line **"Marked as a possible bottleneck."** Allow changing the selection and **"I think it is elsewhere"** (clears it).
- Component ids come from a new optional `components: [{id, name, detail}]` on the task (§9.5). Keep `architecture: string[]`. With an old server, derive ids client-side from the strings.

### 9.2 Structured response

**Guided:** three compact fields, with progressive disclosure:
1. **"What breaks?"**, placeholder "Name the component or behavior that fails."
2. **"Why does it fail?"**, placeholder "Describe the load, failure condition, or chain reaction."
3. **"What would you change?"**, placeholder "Propose a fix and name one trade-off."

Show the first field first. Reveal the next after meaningful input (e.g. 12 or more characters) or "Continue". Keep every draft. Send structured `parts` plus a combined labelled `answer`, so the existing grader still works.

**Simulation:** keep the single free-text field (the original requirement: the flaw, why, and a fix with its trade-off). Component selection stays available as an optional thinking aid.

### 9.3 Hints

- Guided: **"Get a hint"**. No score cost, up to 3 progressive, non-spoiling levels. The first points at a system area, never the answer.
- Simulation: keep **"Hint −½ pt"**. One hint, the cost visible but not punitive. Afterwards **"Hint used"** is muted and disabled.
- Drafts always survive a hint.

### 9.4 Feedback order

1. Overall result and score.
2. Strongest part.
3. Highest-leverage gap.
4. The rail, with the confirmed failing component amber, plus the learner's selection.
5. An alternate issue, if any: "You also spotted a real concern: …".
6. Detail rows: **Flaw**, **Why it fails**, **Fix and trade-off**, each with covered, partial or missed and a note.

Rename "See a model answer" to **"Compare your diagnosis"**. Expanded: **"The flaw"**, **"Why it fails"**, **"A good fix"**, **"Trade-off to consider"**. Then "Turn gaps into review cards".

---

## 10. Copy

Concise, specific, supportive. Use lines like: "You covered the main request path.", "Consider how cache misses affect the database.", "Your estimate is in the right range.", "The unit does not match the question.", "You identified a real reliability risk.", "Add the trade-off your fix introduces.", "This section is not addressed yet."

Avoid: "Wrong", "Fail", "Bad answer", "Perfect", excessive praise, "Great job!" and similar generic AI phrases. Never imply an answer was fully correct when it was merely plausible. Put the same rules in the server prompts (§11.4).

---

## 11. Backend

### 11.1 Principles

- **Backward compatible.** Never remove request fields, rename response fields, or change what an existing field means. New fields are optional with safe defaults. Old clients (0.3.x) keep working unchanged, and old sealed tokens stay valid.
- If a breaking change is truly required, stop. Explain it and propose an additive alternative (a new field or a new route).
- **Practice style:** `type PracticeStyle = "guided" | "simulation"`, optional everywhere. **Omitted = today's behaviour**, which is closest to `simulation`: the hint penalty applies, and scoring is unchanged.
- Keep scoring on the server where it is there today (What breaks score, design rubric). Don't trust client-sent penalties or hint flags when the token can say better (§11.2.3).
- Validate every input with zod, apply the existing auth and rate limits, keep all AI calls on the server, use structured JSON output validated and normalised the way `llm.ts` already does (`str`, `strList`, enums), and throw `LLMError` / `BadStateError`, never a bare 500.
- Don't add `schemaVersion` globally: the API has no versioning convention. You may add `schemaVersion: 2` inside new sealed tokens, so `openState` can read both.
- Prompts treat set cards and learner answers as **untrusted data** (prompt-injection hardening); `DRILL_RULES` already says so. Keep that, and add an explicit instruction hierarchy to every new prompt.

### 11.2 Changes per route (all additive)

**11.2.1 `POST /v1/design-task`**
- Request: optional `practiceStyle`.
- Response: keep `brief` and `rubric`. Add `constraints: string[]` (at most 4, each at most 40 characters, taken from the brief's own numbers) and `state`, a sealed `{ schemaVersion: 2, uid, iat, rubric, constraints, practiceStyle }`.

**11.2.2 `POST /v1/design-grade`**
- Request: keep `task`, `answer`, `rubric`, `mode`, `state`, `curveball`, `originalAnswer`. Add an optional `practiceStyle` and optional structured `answers: { requirements?, estimates?, api?, dataModel?, components?, tradeoffs? }`. Each is at most 2,000 characters, and the total stays under `MAX_DESIGN_ANSWER`, enforced on the server.
- `answer` becomes optional **only when** `answers` has text (a zod refine); old clients still send `answer`. Empty fields mean skipped.
- If `answers` exists, build a normalised internal representation and grade per section from it, keeping `answer` as the fallback. If only `answer` exists, use today's path. Sanitise without destroying technical notation (`/`, `→`, `{}`, code).
- Prefer the rubric from `state` (if valid and owned) over the client's `rubric`.
- Guided: the grader is told API and data-model content may live in the components step, and that **omitted sections are never penalised** in guided mode. The rubric-coverage formula is unchanged.
- Response: keep `rubric_evaluation`, `sections`, `next_time`. Add `key` to each section row (`requirements | estimates | api | dataModel | components | tradeoffs`), plus `strongestPart: string | null`, `highestLeverageGap: string | null` and `score` (the same rubric coverage the client computes today, so the client can show it; the client keeps logging its own `rubricScore` so history semantics don't move).

**11.2.3 What breaks**
- `/v1/bottleneck-task`: optional `practiceStyle`. Add to the response `components: [{id, name, detail}]` (ids are slugs, unique). The sealed state additionally holds `uid`, `iat`, `practiceStyle`, `flaw_component_id` (where the flaw lives; **sealed**), `tradeoff` (the model fix's trade-off; sealed), `hints: []` and `hintLevel: 0`. Ask the model for `flaw_component` and `tradeoff` in the task prompt.
- `/v1/bottleneck-hint`: optional `level`. Returns `{ hint }` as today, plus `text` (the same string), `level`, `penalty` (0 in guided, 0.5 in simulation), `revealsAnswer: false` and a **new `state`** with the hint recorded. Guided allows up to 3 levels, simulation 1 (then `HINT_LIMIT_REACHED`). Asking again for a level already given returns the stored hint without a model call. Hints are never allowed to name the flaw.
- `/v1/bottleneck-grade`: keep `state`, `answer`, `usedHint`. Add optional `practiceStyle`, `selectedComponentId` and `parts: { flaw?, reason?, fix?, tradeoff? }`.
  - `answer` is optional when `parts` has text. Rebuild a labelled combined answer for the grader.
  - **Hint usage comes from the token** when it's a v2 token (`hints.length > 0`), else from `usedHint` (old clients). **The penalty applies only when the sealed style is `simulation`, at most once.**
  - Validate `selectedComponentId` against the sealed architecture (`INVALID_COMPONENT`). It is never proof of correctness.
  - Response: keep every current field. Add `maxScore: 3`, `hintPenalty`, `finalScore` (equal to `score`), `verdict` (`correct | partly_right | not_quite`), `criteria: { foundFlaw, explainedFailure, proposedFix }`, each `{ earned, status: covered|partial|missed, note }`, plus `selectedComponentResult: { componentId, status: "flaw" | "alternate" | "not_the_flaw" } | null`, `failingComponentId`, `strongestPart`, `highestLeverageGap`, `alternateProblem: { componentId?, description } | null` (only when the grader confirms a genuinely real issue; never credit vague or imaginary concerns) and `modelAnswer: { flaw, whyItFails, goodFix, tradeoff }` (**only in the grade response**).

**11.2.4 Estimation**
- `/v1/estimation-task`: optional `practiceStyle`. Add optional public fields per question: `nudge`, `first_step`, `scaffold: string[]` (with "?" for unknown values; must not contain the answer), `traffic: "average" | "peak" | null`, `assumptions: string[]`. Keep the existing fields (D3).
- `/v1/estimation-summary`: keep `results[{question, expected, answer, grade}]`. Add optional per-result `working` (at most 800 characters) and `status` (`correct | close | not_quite | unit_mismatch`), and optional `practiceStyle`. Bound and validate everything.
  - Response: keep `habit_to_fix`. Add `strongest_habit: string | null` and `notes: [{ index, message }]` (at most 5, coaching only, grounded in the working, never a second score).
  - If working analysis fails, still return `habit_to_fix` (or a safe fallback). The client shows: **"We could not analyze the working this time, but your numerical answer was checked."**

**11.2.5 New: `POST /v1/design-checkpoint`** (D5 kill switch; `limitByUser`, plus a tighter per-user limit, e.g. 20 per hour)
- Request: `{ state (design v2), section: "requirements"|"estimates"|"components"|"tradeoffs"|"api"|"dataModel", answer (≤2000), practiceStyle }`. Validate that the section is allowed and the token belongs to the user.
- Response: `{ section, covered: string[≤2], considerAdding: string[≤2], encouragement: null, canContinue: true }`.
- Coaching only: no score, no hidden rubric text quoted, no full answer. Never required to finish.

**11.2.6 New: `POST /v1/drill-card-suggestions`** (D5 kill switch; `limitByUser`)
- Request: `{ mode: "design"|"estimation"|"bottleneck", gaps: [{ type: "missed_rubric"|"partial_rubric"|"estimation_mistake"|"unit_mismatch"|"missed_bottleneck"|"missing_tradeoff", text (≤400) }] (≤8), topic (≤200), existingFronts: string[] (≤50, each ≤200), practiceStyle? }`.
- Response: `{ suggestions: [{ id, front (≤160), back (≤400), conceptKey, sourceType, reason }] (≤3) }`.
- Cards only for real gaps (an empty `gaps` returns `[]` without a model call). One concept per card, active-recall wording, technically accurate, no unsupported claims, no pasting the whole model answer, avoid the existing fronts.
- `sourceId` is the client's drill id. It's echoed back, nothing is stored.

### 11.3 Output schemas and enums

Every AI task gets an explicit schema: required keys, enum checks, length limits, array caps. On invalid output, repair what's safe (defaults, truncation), otherwise retry at most once for transient or invalid JSON, then fall back or throw `LLMError`. Log schema failures **without** answer text. Never parse grading decisions from prose.

```ts
type DesignVerdict = "strong" | "ok" | "weak" | "missing";
type RubricStatus = "covered" | "partial" | "missed";
type EstimationStatus = "correct" | "close" | "not_quite" | "unit_mismatch";
type BottleneckStatus = "covered" | "partial" | "missed";
type PracticeStyle = "guided" | "simulation";
```

Model output never decides authorization, billing, ownership or security.

### 11.4 Prompts

Version them in `llm.ts` (`SYSTEM_DESIGN_GRADING_PROMPT_VERSION = "v2"`, `FLASHCARD_SUGGESTIONS_PROMPT_VERSION = "v1"`, and so on) and include the version in the structured log line. Each prompt separates: system instructions, exercise data, flashcard content, the learner's answer, the output schema, uncertainty rules, and a no-invented-evidence rule.

Grading prompts:
- Grade only what the learner wrote or selected, assume nothing unstated, and give no credit from the model answer alone.
- Allow valid alternative solutions, and distinguish missing from incorrect.
- Stay concise.
- Give exactly one strongest part and one high-leverage gap, or `null` when not confident.
- Follow the copy rules in §10.

Keep outputs small (the 8k tokens-per-minute budget).

### 11.5 Errors

Use the **existing** error format (`{ error: <code>, message }`). `src/sync/api.js` turns it into `new Error(data.message || data.error)`, so always send a human `message`. If the client needs to branch on a code (e.g. `feature_disabled`), keep the code on the error the way `src/sync/auth.js` does (`.code`). Add these codes where they apply: `EXERCISE_EXPIRED`, `INVALID_ANSWER`, `ANSWER_TOO_LONG`, `INVALID_COMPONENT`, `HINT_LIMIT_REACHED`, `AI_GENERATION_FAILED`, `AI_GRADING_FAILED`, `FLASHCARD_SUGGESTION_FAILED`, `feature_disabled`. (`SESSION_NOT_FOUND` and `SESSION_ACCESS_DENIED` map to token ownership: a token that isn't yours gets `EXERCISE_EXPIRED`, which doesn't confirm it exists. `INVALID_UNIT` and `DUPLICATE_FLASHCARD` are client-side here.) No stack traces or provider internals. The client words every code in plain language and never shows a raw code, as `src/ui/auth-form.js` does.

### 11.6 Cost, limits, reliability

- Never call the model per keystroke or per field. Checkpoints are user-triggered and debounced (one in flight; the button disabled while waiting).
- Batch the estimation working analysis into the summary call.
- Cache hints in the token, and keep the generated exercise in client state for the session.
- Retries: bounded backoff for transient provider errors only, never for invalid input.
- Reuse `requireQuota` / `limitByUser`. The new routes count against the same quota as the existing follow-ups.
- When an optional call fails (checkpoint, suggestions, working analysis), the drill still completes, deterministic results still show, and the learner's text is never lost.

### 11.7 Security and privacy

- Authenticate everything, bind new tokens to the user (D1), and enforce length limits on the server.
- Rendered strings go through `esc()` on the client.
- No learner answers in logs, and no flaw, rubric, keys or set contents in ordinary logs or error traces.
- Learner answers are user content. This change adds no new third-party flow (same AI provider, not stored), so re-read `privacy.ts` and update it only if something now goes somewhere new or is stored. Say which in the report.

### 11.8 Database

**Expected: no migration** (D2). If you find a real need, the migration is append-only, nullable or default-safe, does no big rewrites, comes with tests for old rows, and goes in `server/tests/migrations.test.ts` and `schema.test.ts`. Never store the hidden flaw or rubric in plain text.

---

## 12. History and data model

Keep score semantics exactly:
- **Design:** rubric coverage, partial counting half.
- **Estimation:** correct 1, close 0.5, otherwise 0. **Unit mismatch counts 0**, as today.
- **What breaks:** `score / 3`, with the 0.5 hint penalty **only in Simulation**. Guided hint use is recorded separately and doesn't lower the score.

Add **local-only** fields to the drill-log row written by `drillLogEntry` (extend it; keep `kind`, `sessionId`, `fraction`, `id`, `chainId` behaviour and tests): `practiceStyle`, `mode` (`design_brief | estimation | what_breaks`), `startedAt`, `completedAt`, `durationMs` (time spent; the field already exists on flashcard rows), `usedHint`, `hintCount`, `selectedComponentId`, `savedSuggestedCardIds`. The server strips them on sync (§1). Test that a row carrying them still passes `reviewSchema` and still syncs.

Session-only state (in memory, in the flow's state object, surviving every repaint and navigation inside the session): `sectionDrafts` (design), `checkpointFeedback` metadata, `workingText` per question, `suggestedFlashcards`.

**Don't persist answer text to the review log.**

---

## 13. Accessibility and keyboard

- Tab order follows the visual order, with visible focus rings in both themes.
- Esc leaves, with confirmation when there's progress (the shell's `exitStudy`).
- Enter checks an estimate, and Enter advances from a checked estimate.
- Cmd/Ctrl+Enter submits long-form fields.
- Architecture rows are selectable with Tab plus Enter or Space.
- Semantic buttons, inputs and labels; status updates in an `aria-live` region; sufficient contrast in both themes.
- Never colour alone: every state has text or an icon too.

---

## 14. Implementation order (commit per phase on the branch)

Each phase starts with failing tests, then implementation, then the full verification (§16).

1. **Foundations:** the Phase 0 inventory and the decisions doc; server optional fields and validation (`practiceStyle`, structured answers, v2 tokens with `uid`/`iat`/expiry, still reading old tokens); `practice-style.js`; the first-run sheet, launch override and You tab setting; shared components; renaming "model answer" to "Compare your approach" / "Compare your diagnosis"; the new loading copy.
2. **Feedback hierarchy:** server `strongestPart`, `highestLeverageGap`, `criteria`, `alternateProblem`, `components`, `failingComponentId`, `tradeoff`, section `key`; the feedback screens of all three modes rebuilt around `feedbackSummary`.
3. **Review cards:** `/v1/drill-card-suggestions` with its kill switch; the worker route; `card-dedupe.js`; the suggestion sheet; saving through `addCard`.
4. **What breaks:** selectable rail; guided three-field response; guided vs simulation hints (token-recorded, penalty from the sealed style); grading compatibility for old payloads.
5. **Estimation:** rough working, scaffolds, nudges, Average/Peak, the two-step Don't know, `estimation-diagnose.js`, "Unit mismatch", the batched working analysis, the new round summary.
6. **Design brief:** the guided four-step flow, outline review, concept chips, "I'm not sure" hints, `/v1/design-checkpoint` with its kill switch; simulation tweaks (Finish early, summary line, elapsed timer); constraint anchor.
7. **Wrap-up:** harness mocks for every new shape (`tests/harness/panel-harness.html`), a browser QA pass at 390 × 884 in both themes and both styles, **bump `manifest.json` to the next version and run `node tools/build.mjs`** (standing instruction: every change ships with a new version and fresh zips), and the report.

---

## 15. Tests (write them first)

**Extension (`tests/*.test.mjs`, normalise `\r\n`):**
- `practice-style`: the registry, flags and `resolveStyle`. Adding a style needs only a registry entry.
- `card-dedupe`: normalisation and threshold; duplicates are skipped; never more than 3 suggestions are shown.
- `estimation-diagnose`: each ratio family; `null` when unclear; no diagnosis contradicts the deterministic verdict.
- Estimation: "Unit mismatch" verdict and copy; working kept per question; the score is unchanged by working.
- Drill log: new local fields survive; the row still validates against the server's `reviewSchema` shape; score semantics as in §12 (guided hint, no penalty).
- Static guards: every new `data-action` has a router case; every new `send` type has a worker case and an `api.js` client; no `innerHTML` or inline handlers; no emoji, no red tokens, no raw hex in the new UI; the "model answer" strings are gone.
- Design: guided steps map to the `requirements/estimates/components/tradeoffs` keys; drafts survive step changes, the outline and the brief toggle.

**Server (`server/tests/*.test.ts`):**
- Compatibility: old requests (no `practiceStyle`, only `answer`, old tokens, `usedHint` from the client) behave exactly as before; new response fields don't remove or rename old ones.
- Design: structured sections map correctly; empty means skipped; limits are enforced; rubric scoring is unchanged; `state` overrides the client rubric; a checkpoint returns no score and quotes no rubric.
- What breaks: the flaw, its component and the model answer never appear in task or hint responses; component ids are validated; the hint is recorded in the token; the penalty applies once in simulation and never in guided; repeated hint requests return the cached hint with no model call; the guided limit is 3 and simulation 1; an alternate issue is credited only when the grader confirms it.
- Tokens: `uid` mismatch and age over 24 h are rejected; old tokens are accepted; tampered tokens give `BadStateError`.
- Estimation: summary bounds; working analysis failure still returns `habit_to_fix`; notes are capped.
- Suggestions: capped at 3; empty gaps means no model call; the kill switch returns `feature_disabled`.
- AI robustness: invalid JSON, bad enums and missing optional fields are normalised or rejected safely; a prompt-injection string inside a card or answer can't change a grade (with a mocked model).
- Integration (mocked model): one guided and one simulation session per mode; old frontend payloads; provider timeout; duplicate submission; repeated hint; expired token.

Never weaken, skip or delete an existing test. If one is genuinely wrong for the new design, change it in a separate commit and say why in the report.

---

## 16. Verify (paste the output in the report)

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
cd server && npx vitest run && npx tsc --noEmit
npm run typecheck
node tools/build.mjs
cd mobile && npm run typecheck && npm test
```

Then check it in the browser: the panel harness at 390 × 884, dark and light, both styles, all three modes. Confirm: no content behind the dock; one filled primary at most per screen; prompt and top bar stable across states; keyboard paths; every button and field in Geist; no emoji; no red. Clean up the `server/test-*.db` files your server run creates.

---

## 17. Acceptance

- A first-time user can choose "Learn concepts" or "Interview simulation". The choice is remembered and can be overridden before a session.
- Guided gives smaller steps, optional help and progressive structure. Simulation stays realistic and freeform, with feedback mostly after submission.
- What breaks lets the learner select a possible failing component without revealing correctness.
- Estimation captures optional rough working.
- Guided Design brief turns six blank areas into four approachable steps.
- Every feedback screen leads with one strength and one high-leverage improvement (when the grader is confident).
- No label promises a written model answer.
- Learners can save 2–3 selected review cards from missed concepts, with no duplicates and nothing automatic.
- Existing scores and grading behaviour stay valid. Hints cost points only in Interview simulation.
- Everything works at 390 px with no dock overlap or clipping, with keyboard and accessibility, and with no emoji, no red and no clutter.
- Old extension versions keep working against the new server; hidden What breaks data and the design rubric's sealed copy stay secret until grading; the server computes the scores it computes today; AI failures never destroy the learner's answers.

**Don't call it done** unless every bullet above holds and §16 is green.

---

## 18. Report

**Frontend:**
1. Changed components and files, one line each.
2. API and data-model changes the client relies on.
3. Backend TODOs it needed.
4. A manual QA checklist covering Guided and Simulation for each of the three modes.

**Backend:**
1. Files changed.
2. New and modified routes.
3. Request and response examples (old and new shapes).
4. Migrations (expected: none, and why).
5. Prompt and schema changes with versions.
6. Kill switches added and their defaults.
7. Backward-compatibility notes, including the D3/D4 exposures and when they can be removed.
8. Testing performed, with output.
9. Known limitations.
10. Frontend integration notes.
11. Deploy steps: **deploy the server before uploading the extension**; don't raise `MIN_CLIENT_VERSION`.
12. Future work deliberately not done: Adaptive style, server-side drill history, product metrics, removing the plain `rubric` and estimation references, an estimation server-check route, a written model answer.

**Plus:** the deviation table as finally decided, the new version number and zip names, and **anything you couldn't verify** (real browsers, the live model, store behaviour) stated plainly.
