# 38 System Design Practice - Phase 0 Inventory

## 1. Current Relevant Endpoints
- `POST /v1/design-task`
- `POST /v1/design-grade`
- `POST /v1/design-curveball`
- `POST /v1/estimation-task`
- `POST /v1/estimation-summary`
- `POST /v1/bottleneck-task`
- `POST /v1/bottleneck-hint`
- `POST /v1/bottleneck-grade`

## 2. Request and Response Shapes (Verified)
- **`design-task`**:
  - Request: `designTaskSchema` (`concept`, `reference`, `mode`)
  - Response: `{ task: string, rubric: string[], state?: string }`
- **`design-grade`**:
  - Request: `designGradeSchema` (`mode`, `state`, `task`, `answer`, `curveball`, `originalAnswer`)
  - Response: `{ rubric_evaluation: [...], sections: [...], next_time: string, model_answer?: string }`
- **`design-curveball`**:
  - Request: `designCurveballSchema` (`mode`, `state`, `task`, `answer`, `previous`)
  - Response: `{ curveball: string }`
- **`estimation-task`**:
  - Request: `estimationTaskSchema` (`concept`, `reference`)
  - Response: `{ questions: [{question, reference_value, reference_unit, worked_solution}] }`
- **`estimation-summary`**:
  - Request: `estimationSummarySchema` (`results: [{question, expected, answer, grade}]`)
  - Response: `{ habit_to_fix: string }`
- **`bottleneck-task`**:
  - Request: `bottleneckTaskSchema` (`concept`, `reference`)
  - Response: `{ narrative, architecture: string[], state }`
- **`bottleneck-hint`**:
  - Request: `bottleneckHintSchema` (`state`)
  - Response: `{ hint }`
- **`bottleneck-grade`**:
  - Request: `bottleneckGradeSchema` (`state`, `answer`, `usedHint`)
  - Response: `{ found_flaw, explanation_correct, fix_works, other_valid_issue, feedback, score, usedHint, planted_flaw, why_it_fails, model_solution, failing_component? }`

## 3. Existing Fields That Can Be Reused
- Tokens (`state` blobs): We currently use tokens to hold `planted_flaw` (bottleneck) and `diagnosis`/`management` (clinical cases). We can expand these to hold `practiceStyle`, `uid`, and `iat`.
- `score` in bottleneck grade.
- `drillLogEntry` fields: we can add `practiceStyle`, `mode`, `durationMs`, etc., because Zod ignores extra fields.

## 4. Frontend-only Changes
- Estimation grading is entirely frontend (2x / 10x boundaries).
- Local states like `sectionDrafts`, `checkpointFeedback`, `workingText` in memory.
- `practiceStyle` override screen and choice persistence.
- Design brief checkpoint UI and horizontal flow chips.
- Rendering of new response fields (`strongestPart`, etc.) without breaking old payloads.

## 5. Required Backend Changes
- Expand sealed `state` tokens to include `uid` and `iat`.
- Change `design-task` to include `state` carrying the rubric and constraints instead of relying purely on plaintext `rubric` (though `rubric` must still be returned for older clients).
- Add `highestLeverageGap`, `strongestPart`, `criteria`, `components`, `failingComponentId`, `tradeoff` to the LLM schemas for grading.
- Update `bottleneck-hint` to verify hint usage boundaries (guided vs simulation).
- Endpoints for `v1/drill-card-suggestions` and `v1/design-checkpoint`.
- Record hint usage centrally in the bottleneck token (server-side tracking) instead of trusting client blindly in Simulation mode.
- Modify `v1/sync` to ensure new extra fields added locally do not break the schema. (Already verified: Zod's `z.object` strips extra fields by default).

## 6. Compatibility Risks
- Old clients expect `rubric` from `design-task`. We must continue sending it.
- Old tokens lack `uid` and `iat`. The server must gracefully fall back to accepting them (no expiry checks for old tokens).
- The client sends `usedHint` in `bottleneck-grade`. The server currently trusts it; if we track it in the token, we must ensure it doesn't break older workflows where the hint wasn't tracked token-side.
- Adding fields to local `drillLogEntry` could break `reviewSchema` if we use `z.strict()`. Currently `z.object` is used, so it strips, which is safe.

# Decision Table

| # | Requirement as written | Reality | Recommendation |
|---|---|---|---|
| D1 | `POST /study-sessions/:id/...`, session ownership checks | No sessions; stateless routes plus sealed tokens | ★ Keep the `/v1/*` routes; add new routes as `/v1/design-checkpoint` and `/v1/drill-card-suggestions`. Make new tokens carry `uid` (the authenticated user) and `iat`. Reject a token whose `uid` differs, or one older than 24 h, as `EXERCISE_EXPIRED`. Tokens without `uid` (old) stay accepted. |
| D2 | Persist `practiceStyle` and session metadata on the server; DB migration | No drill table; review rows strip extra fields | ★ No migration. Keep metadata on the local drill-log row (§ 12). Server-side storage of drill metadata is future work. |
| D3 | Estimation: re-parse and grade on the server; don't send reference answers before submission | Graded client-side; references already on the client | ★ Keep deterministic client-side grading as the source of truth (it is personal study history, not a competitive score). Validate and bound the summary payload on the server. Record the exposure as a known limitation. |
| D4 | Hidden rubric not exposed before submission | `rubric` is returned in plain text today | ★ Add a sealed `state` (rubric, constraints, `practiceStyle`, `uid`, `iat`) to the design-task response. `/v1/design-grade` prefers `state` over `rubric`. **Keep returning `rubric`** for old clients; the new client ignores it and never displays it. Removing it is future work, after `MIN_CLIENT_VERSION` passes this release. |
| D5 | Feature flags (`systemDesignCheckpoints` and others) | No flag system | ★ Server env kill switches, read once: `DESIGN_CHECKPOINTS` and `DRILL_CARD_SUGGESTIONS` (both default **on**; `off` returns `404 {error:"feature_disabled"}`). The client hides the matching action when it gets `feature_disabled`. Checkpoints are only ever user-triggered ("Check my thinking"), never automatic. |
| D6 | Launch-screen override of the practice style | Modes start straight from the set detail's study button | ★ A compact "Style: Learn concepts ▾" control next to the start button for the three design modes. It opens the style sheet with a "Make this my default" checkbox (unchecked = this session only). |
| D7 | Observability metrics | No analytics; privacy promises minimal data | ★ No client analytics. Server: one structured log line per drill operation (operation label, latency, success or failure, practiceStyle), with no answer text. Product metrics (completion rate, save rate) become future work. |
| D8 | Timer in Interview simulation | No time limits exist | ★ An elapsed timer only (mm:ss under the mode label, from `Date.now()` stored in state, so repaints don't reset it). No hard limit. |
| D9 | `POST /flashcards/from-suggestions` with server-side ownership | Cards are created locally | ★ The server only *suggests* (`/v1/drill-card-suggestions`, user-triggered). Saving goes through local `addCard`, with client-side duplicate checks. No save endpoint. |
| D10 | Bottleneck hint tracked via token (server-side tracking) | Hint response only returns `{ hint }` currently | **Open Decision**: We need `/v1/bottleneck-hint` to return the updated token `{ hint, state }` so the client can send it to `/v1/bottleneck-grade`. Is this approach approved? |
