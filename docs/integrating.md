# Integrating finished branches

The standing procedure for taking finished work — usually one or more
`docs/prompts/NN-*.md` tasks built on their own branches — and getting it into
`main`.

**This runs only when someone asks for it.** "Check the branches", "merge and
push", "integrate what's done" all mean this. Never start it on your own
initiative, and never push in the middle of doing something else.

It is not a task prompt: it doesn't get used up, and it applies to every
integration from now on. Keep it current — when an integration turns up a new
way for work to arrive broken, add it to the checklist in §4.

---

## 0. The rules that don't bend

- **Nothing is pushed unless every check in §6 passes.** A green integration
  that skipped a suite is worse than no integration.
- **Never weaken, skip or delete a test to get green.** If a test is wrong, say
  so in the report and leave it failing until it's discussed.
- **Fix problems in your own commits on top.** Don't rewrite, squash or amend
  the author's commits — their history is evidence of what they did.
- **Don't bump the version** unless asked. Releasing is a separate decision.
- **Never commit secrets.** API keys, tokens, passwords, store-reviewer
  credentials. This repo is public.
- **If the fixing is bigger than the integration, stop and ask.** Rewriting a
  feature under the banner of "merging it" hides work the owner should decide
  about.

## 1. Survey before touching anything

```bash
git status --short
git branch --no-merged main -v
git diff --stat main..<branch>
git merge-base main <branch>
```

Know, for each branch: which prompt it claims to implement, what it touches,
whether it forked from current `main`, and whether two branches touch the same
files (that's your merge order).

Also check whether anyone is **mid-task in the working tree right now** —
uncommitted changes you didn't make belong to someone else. Don't touch them;
if you must switch branches, stash with a named message or copy the files aside
first, and say so in the report.

## 2. The author's report is a claim, not evidence

Re-run everything yourself. Reports have claimed passing runs that came from a
different repo entirely — one pasted "6 files, 59 tests" for a suite that has 34
files and 341 tests. **Compare any quoted test count against the real suite
size.** A count that's suspiciously small usually means a stale paste, and
everything else in that report is then worth nothing.

## 3. Scan the branch before you read the code

- **Scratch files.** `patch_*.cjs`, `*_report.md`, `notes.txt`, one-off scripts
  in the repo root. Delete them; they're not supposed to be committed.
- **Secrets.** Grep the diff for keys, tokens and passwords before anything else.
- **Line endings.** The working tree is CRLF (`core.autocrlf=true`) and the
  blobs are LF. A branch committed with mixed CRLF/CR/LF rewrites whole files:

  ```bash
  git diff --stat -w --ignore-cr-at-eol main..<branch>
  ```

  If that is dramatically smaller than the plain `--stat`, the diff is inflated.
  Normalise the affected files in a commit of its own so the real change is
  readable.

## 4. Read the diff against the prompt

Not "does it look fine" — does it do what the prompt asked, and does it hold up.
Things that have actually shipped broken here:

**Dead on arrival**
- A feature gated on a flag nothing ever sets (a persona option keyed on
  `isMedicine`, which was never assigned).
- A handler wired to a `data-action` the UI never renders, or vice versa.

**Data that can't survive**
- New cards or rows missing fields the rest of the system requires: `dueDate`,
  `updatedAt`, `grade`, a non-empty `cardId`. One bad row fails an entire sync
  batch, forever.
- A record written back from a **filtered** read, erasing tombstones.
- New state that `shared/sync-map.js` doesn't map — its field list is a
  whitelist, so anything not in it never leaves the device.

**Markup**
- `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` anywhere in
  `src/` — Firefox rejects the add-on. Everything goes through
  `setHTML`/`replaceHTML`, and **every interpolated value** is wrapped in `esc()`.
- New UI: every `data-action` has a handler, every `send({type})` is routed,
  every CSS variable and `btn-*` class exists, and a focus view has a way out.

**Server**
- A new route without its quota gate and rate limit.
- An unbounded request body or an uncapped array in a schema.
- Errors that reach the user as a bare 500 instead of `LLMError` / `BadStateError`.
- A new third-party data flow without the matching `server/src/privacy.ts` change.
- A migration that edits or reorders an existing `MIGRATIONS` entry — that list
  is append-only.

**Everywhere**
- Comments describing behaviour the change removed.
- A claim in the report of a manual check nobody could have run.

## 5. Integrate

Work on an integration branch, never directly on `main`:

```bash
git switch -c integrate/<what> main
git merge --no-ff <branch> -m "Merge branch '<branch>'"
```

One branch at a time, in the order §1 told you. Fix what you found in **separate
commits with your own message**, so the owner can see the difference between
what arrived and what you changed. If the working tree belongs to someone else,
use `git worktree add` instead of switching branches under them.

## 6. Verify — all of it, every time

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
```

```bash
cd server && npx vitest run && npx tsc --noEmit
```

```bash
npm run typecheck
```

```bash
node tools/build.mjs
```

```bash
cd mobile && npm run typecheck && npm test
```

If a suite fails intermittently, run it again and **say so in the report** —
don't quietly accept the second result.

## 7. Merge and push

```bash
git switch main
git merge --ff-only integrate/<what>
git push origin main
git push origin <branch> [<branch>...]
git branch -d integrate/<what>
```

Then prove it, rather than assuming:

```bash
git status --short
git rev-parse HEAD origin/main
git branch --no-merged main
```

Clean tree, the two revisions equal, and nothing listed as unmerged.

## 8. Report

- **What each branch was**, and whether it did what its prompt asked.
- **What was actually wrong**, concretely, with file and line — including
  anything the author's report got wrong.
- **What you changed on top**, and why.
- **What's still unverified**: live sites, real devices, two-account flows,
  anything needing a browser or a paid provider. Never claim a check you didn't
  run.
