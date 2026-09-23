# 29 — Split the three files every change has to touch

**Depends on:** nothing, but it conflicts with everything. **Branch:** `refactor/split-big-files`
**Run it alone, merge it immediately, and don't start it with other branches open.**

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## Why

Three files absorb nearly every change:

| file | lines |
|---|---|
| `server/src/llm.ts` | ~905 |
| `src/background/service-worker.js` | ~900 |
| `server/src/app.ts` | ~820 |

Most tasks this quarter touched at least two of them. That's where the merge
conflicts come from, and it's why one agent's line-ending slip rewrote whole
files in the diff. `src/ui/ai-hosts.js` is larger still (~1000 lines) but it is
mostly data, so leave it alone.

## The one rule

**No behaviour changes. None.** This is a move, not an improvement. Don't rename
exports, don't "fix" something you notice, don't reorder logic, don't touch
comments except to keep them with the code they describe. If you find a bug,
write it in your report and leave it exactly where it is.

The existing suites are the proof: they must pass **unchanged**. A test you had
to edit means you changed behaviour — stop and say so instead.

## What must be true when you're done

1. **Each file has one subject.** Suggestions, not orders:
   - `llm.ts` → the provider adapters, the study-set generation prompts, and the
     drill prompts (design / estimation / bottleneck / clinical) are three
     separate concerns sharing one `callJson`.
   - `service-worker.js` → the message router, capture (page / YouTube / PDF),
     and generation are separable; the router should read as a list.
   - `app.ts` → auth, sync, LLM routes, billing and admin are already visually
     grouped; make the groups real. Keep `createApp(db)` as the single place
     they're mounted, and keep every quota and rate-limit gate attached to its
     route — the comment in `app.ts` explains why they're inline, and that must
     stay true.
2. **The import graph stays simple.** No cycles, no barrel file that re-exports
   everything, no `index.ts` that exists only to hide the split.
3. **The constants that are duplicated across the boundary get one home each:**
   `MAX_PDF_BYTES` is declared in both `src/storage/sources.js` and
   `server/src/pdf.ts`, "15 MB" is written into three separate messages, and
   `24000` appears in `sources.js`, `service-worker.js` and
   `src/content/quizlet-import.js`. The content script genuinely can't import
   (AGENTS.md rule 3), so one copy there is unavoidable — comment it and point at
   the original. The worker has no such excuse. The client and server can't share
   a module either; make the duplication explicit and checked by a test rather
   than accidental.
4. **`node tools/build.mjs` still produces a working extension.** The build takes
   everything under `src/` and `shared/`, so new files are picked up — but a
   missed import path fails only at runtime, in the panel. Load the build and
   click through capture, review, and one drill.
5. **No file over ~400 lines** when you're done, unless it's data.

## Definition of done

- Every existing test passes, unedited.
- The panel, the worker and the server all still work when loaded and run.
- Everything in "Verify" passes.

## Verify

```bash
cd server && npx vitest run && npx tsc --noEmit
cd ..
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd mobile && npm run typecheck && npm test
```

## Report

- **The new file layout**, as a tree, with one line on what each holds.
- **Confirmation that no test file changed** — `git diff --stat` on `tests/` and
  `server/tests/` should show nothing.
- **Any bug you found and deliberately left alone.**
- **What you loaded and clicked** to check the build.
