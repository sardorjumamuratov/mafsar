# 39 — Medicine practice: grounded, bite-sized cases with levels and hints

**Branch:** `feat/medicine-practice`
**Depends on:** 38 (practice styles, study shell, review cards), on `main` once `fix/system-design-practice` is merged.
**Touches:** `src/ui/flows/{clinical,chain-drill}.js`, `src/ui/practice-ui.js`, `src/storage/practice-style.js`, new pure modules in `src/storage/`, `src/ui/views/set-detail.js`, `src/background/service-worker.js`, `src/sync/api.js`, `server/src/{llm,schema,app}.ts`, `server/tests/`, `tests/`, `tests/harness/panel-harness.html`, `manifest.json` (version only).

Follow `AGENTS.md`: test first, one branch, no `innerHTML`, no inline handlers, every `send({type})` routed, migrations append-only, no new permissions, no secrets, no new third-party data flows. Bump the version and rebuild the zips at the end (standing instruction).

---

## 0. Why

A learner pasted a ChatGPT conversation about flu (symptoms, flu vs cold, home care, when to get help) and ran a Clinical case. The case was well formed, but its **tests, results and the grading key for "Tests you'd order" were invented by the model**: the chat never mentions a test. So half the assessment graded knowledge the learner was never given, against "facts" nobody checked. Clinical cases are also two long essays with feedback only at the end.

Decisions made with the user (2026-10-12):

| Topic | Decision |
|---|---|
| Grounding | Build only from what the source covers; label anything else |
| Levels | Beginner / Intermediate / Advanced, **picked by the learner** (Beginner by default), with a suggestion to move up after two strong cases |
| Beginner answers | **Multiple choice** (4 options); typing starts at Intermediate |
| Scope | **Clinical case and chain drill** in this round; System design levels later |
| Hints | Up to 3 per step, **always free** in both practice styles |
| Size | Bite-sized: one decision per step, answers are taps or one line (at most 200 characters) |

## 1. Grounding (clinical case)

- The case writer first lists what the source covers: `symptoms`, `diagnosis`, `differentials`, `tests` (with results, if given), `treatment`, `redFlags`. It uses the set's cards (up to 50) plus its chains, if any. This list travels in the sealed state.
- Steps are chosen **only from covered areas**. If the source has no tests, there is no tests step. Use a covered area instead: "Flu, cold or COVID?" (differentials) or "What should she do, and when is it urgent?" (treatment / red flags).
- Every step and explanation carries `source: "notes" | "general"`. A `general` line appears with a muted label **"General knowledge, not from your notes"**. The prompt keeps `general` to the vignette's colour details (age, setting) and never uses it for an answer key.
- Test results are shown **only for tests the learner chose**. Results for other tests appear under **"Other results"**, each marked **Not ordered**.
- If the source covers too little for a case (fewer than 2 areas), return `LLMError` with an actionable message: "These notes don't have enough clinical detail for a case yet. Add symptoms and a diagnosis, or try the chain drill." Never invent a case.

## 2. Clinical case: bite-sized steps

Each case is a short vignette followed by 3–4 steps, each one decision, with feedback right after the step:

| # | Step | Beginner | Intermediate | Advanced |
|---|---|---|---|---|
| 1 | Most likely diagnosis | 4 options | 4 options + one-line why | typed, one line |
| 2 | The finding that points to it most | tap one of the case's highlighted findings | same | same |
| 3 | What next (tests, advice or treatment, by coverage) | 4 options | 4 options + one-line why | typed, one line |
| 4 | A close differential: what tells them apart | — | optional, typed | typed |

- **Vignettes by level.** Beginner: a textbook presentation with every key feature. Intermediate: one or two distractors, one feature missing. Advanced: an atypical presentation, a comorbidity, a close differential.
- **Findings for step 2** are 4–6 short phrases from the vignette (`{id, text}`), shown as chips under the case. Tapping one answers the step. The right one(s) are sealed.
- **Session:** 3 cases, about 1–2 minutes each. Top bar: case n of 3. Within a case, a small "Step 2 of 3" label sits above the step question.
- **After the last step of a case:** a short case summary (one verdict row per step), the results block (§1), then **Next case** (or **Finish**).
- **Feedback timing follows the practice style:** Learn concepts shows each step's verdict and explanation right away. Interview simulation keeps them for the case summary (the steps still lock as answered).
- **End of session:** score, strongest and weakest step type ("You spot the key finding; differentials need work"), the level suggestion (§3), then "Turn gaps into review cards" (the 38 flow, with `type: "missed_rubric"` gaps from missed steps).

## 3. Levels

- `src/storage/practice-level.js` (pure, tested): `LEVELS = { beginner, intermediate, advanced }` with label, description and flags (`answerKind`, `whyLine`, `steps`, `chainLength`), plus `nextLevel()` and `suggestStepUp(results)`. True after two cases in a row scoring at least 0.8 at the current level, never past Advanced.
- **Chosen per set**, stored locally in `settings.practiceLevels[sessionId]` (not synced). Default `beginner`.
- **Set page:** for Medicine modes, a "Level: Beginner ▾" control next to "Style: …" opens a sheet with the three levels (title, one-line description). The style control appears for Medicine modes too.
- **The step-up suggestion** shows on the session summary: "Two strong cases. Try Intermediate next time?", with a quiet **Use Intermediate** button that changes the set's level. Never automatic.
- Level is sent with the task request and sealed into the state. It's also stored on the drill-log row (`drillMeta.level`).

## 4. Hints (both modes)

- Up to **3 per step**, free in both styles. **Get a hint** sits by the step; after 3, it reads "No more hints".
  1. **Where to look:** highlights a phrase or finding in the case (clinical), or names the step's category (chain).
  2. **Narrowing:** rules out two options (choice steps), or names the area ("think infectious and seasonal").
  3. **The key idea:** the decisive finding or the link's `why`, never the answer word for word.
- Hints are written with the case (one model call) and returned **in the task response**. They're coaching, not answer keys, so a hint never contains the correct option's text. Chain drill hints come from the chain itself (no model call).
- Hint use is counted per step and stored in the log meta (`hintCount`). It doesn't change the score.

## 5. Chain drill

The chains come from the learner's own source, so the drill is already grounded. Changes:

| | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Chain length | up to 4 steps | up to 6 | the whole chain |
| Answer | pick the missing step from 4 options | type one line | type one line |
| Distractors | other steps of the same type from the set's other chains, then other steps of this chain; no model call | — | — |

- **Hints:** 1) the step's type ("Mechanism"); 2) the link's `why` from the source, if any, else the first and last steps around the gap; 3) the first two words of the statement.
- **Grading:** option steps are checked on the device (no model call). Typed steps keep `GRADE_ANSWER`, one short call per step, as now.
- **Answers capped at 200 characters;** the field is a short single text box (min height 72).
- **The end screen** shows the rebuilt chain with each step's verdict, the step-up suggestion, and "Turn gaps into review cards".

## 6. Server

New routes. The old `DESIGN_TASK` and `DESIGN_GRADE` clinical paths stay unchanged for 0.3.x clients.

- `POST /v1/clinical-case` (`requireQuota(db, "practice")`): `{ concept, reference, chains?, level, practiceStyle? }` → `{ vignette, findings[{id,text}], steps[{id, kind: "choice"|"finding"|"short", question, options?, hints[3], source}], coverage, state }`. The state seals correct options, finding ids, model answers, explanations, test results, `level`, `practiceStyle`, `uid`, `iat` (the v2 token rules from 38).
- `POST /v1/clinical-check` (`limitByUser(limits.llmPerUser)`): `{ state, stepId, answer }` → `{ stepId, verdict: "correct"|"partial"|"not_quite", explanation, source, results? }`.
  - Choice and finding steps are checked from the token, with **no model call**.
  - Short typed steps make one small grading call (Learn concepts), or are batched by `POST /v1/clinical-check` with `answers[]` at case end (Interview simulation): one call for the case.
  - `results` returns the chosen test's result, plus "Other results" once the case ends.
- Prompts: an instruction hierarchy (38's `DATA_RULES`), the coverage-first rule, no answer keys from general knowledge, short outputs (Groq's 8k tokens per minute limit). Prompt versions are logged.
- Validation: zod for every field, answers ≤ 200 characters, `stepId` and the finding id checked against the token, `level` and `practiceStyle` enums.

## 7. Client

- `flows/clinical.js` rebuilt on the shell: the vignette (clamped once steps start, with "Show full case"), finding chips, step blocks, verdict rows, the results block, hints. Old helpers stay only if still used.
- `flows/chain-drill.js`: levels, options, hints, the 200-character field, the end screen.
- `practice-ui.js`: the level sheet and `levelFor(sessionId)`; `startWithStyle` extended to Medicine modes (first-run sheet included).
- The worker routes `CLINICAL_CASE` and `CLINICAL_CHECK`, and `api.js` gets the two clients. Each new case forwards every field (the 38 static guard covers this).
- Harness mocks for both routes, all three levels.

## 8. Tests

- **Server:** coverage gating (no tests step when the source has none; refusal when coverage is too thin); choice and finding checks with no model call; sealed answers are absent from the task response; hints never contain the correct option; level, style and the token rules; batched short answers; old clinical routes unchanged.
- **Extension:** `practice-level` (labels, flags, `suggestStepUp` edges); chain distractor picking (pure, deterministic with a seed, never the correct statement, no duplicates); hint ladders; static guards (imports exist, actions routed, fields forwarded, copy present, no "Tests you'd order" step without coverage).
- **Browser:** the harness at 390 × 884, dark and light, all three levels × both styles for both modes, keyboard paths, no dock overlap.

## 9. Acceptance

- A flu chat with no tests produces cases with **no tests step**. Every answer key comes from the notes, and any general-knowledge line is labelled.
- Results appear only for chosen tests; the rest sit under "Other results · Not ordered".
- Each step is one decision answered with a tap or one line. A case takes 1–2 minutes.
- The level is picked per set, defaults to Beginner, and moving up is suggested after two strong cases, never automatic.
- Every step has up to 3 free hints that never give away the answer text.
- Beginner chain drills need no model call. Beginner clinical cases need one per case.
- 0.3.x clients still run the old clinical case.
- All suites green; version bumped; zips rebuilt.

## 10. Report

Changed files; routes and request/response examples; model calls per session at each level (before and after); what was checked in the browser; and anything not verified (real model output, real browsers, the live server).
