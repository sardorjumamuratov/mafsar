# 15 — Medicine mode: mechanism chains (foundation)

**Depends on:** 13 (generation must already know a set's mode). **Branch:** `feat/medicine-chains`
**Unblocks:** 16, 17, 18, 19.

You decide the implementation: data model, storage, sync, prompts to the model,
UI structure, and tests. This file says **what** to build and the rules. Write
tests for your own code, test first, and make them fail if the feature breaks.

Read `AGENTS.md` first and follow all of it: one branch, don't push or merge,
`setHTML` + `esc()` for all HTML, no `innerHTML`, append-only migrations, no
new extension dependencies or permissions. **Commit only source and test
files.** No scratch scripts and no copies of this prompt. Check `git status`
before every commit.

## Why

Medical students remember conditions as causal chains:

**Cause → Mechanism → Physiological change → Symptoms → Signs → Tests → Diagnosis → Treatment**

Today a captured medical chat becomes loose flashcards, and the chain that makes
it memorable is lost. This task makes the chain a first-class object. Prompts
16–19 build on it.

## What the learner experiences

1. **Choosing the mode.** A **Medicine** option in a set's Study mode picker
   (with General, Coding, System design), with a hint like "Mechanism chains per
   condition". It's stored on the set and syncs.
2. **A gentle suggestion.** When a newly generated set is clearly medical, show
   a small, dismissible prompt on the set: "This looks like medicine. Organise
   it as mechanism chains?" with **Use Medicine mode** / **Not now**. Never
   switch automatically. Don't ask again for a set once dismissed.
3. **Chains are extracted.** Generating or regenerating a Medicine set also
   produces one chain per condition in the source: an ordered list of steps
   following the template above. Each step has a short statement and, where the
   source supports it, a one-sentence **why** for the link from the previous
   step.
4. **A Chains tab.** Next to Flashcards / Quiz / Summary. It lists the
   conditions, and each shows the chain as a vertical flow: step label, statement,
   and an arrow to the next. Tapping a step reveals the **why** of the link
   into it. Show coverage like "7 of 8 steps".
5. **Gaps are visible, never invented.** A step the source doesn't cover is
   shown as "Not in your source" with an **Add** action. The model must not fill
   gaps from its own knowledge.
6. **Every step is editable.** The learner can fix any statement or why, or fill
   a gap. **Their edits survive regeneration**: design how, and prove it with
   tests.
7. **It syncs.** Chains and edits reach the learner's other devices through
   `/v1/sync`, like cards do. The mobile app doesn't need to show chains yet, but
   its sync must keep working (unknown data must not break it).

## Design the model generically

Store chains against a **template** (an ordered list of step keys and labels).
Ship only the medicine template now. Law (facts → issue → rule → application →
conclusion) and drug chains (drug → target → mechanism → effect → use → side
effects) should later be new templates, not new code. Don't build those
templates, but don't make them impossible.

## Rules and constraints

- **Accuracy first.** The extraction instructions must say: use only what the
  source states; leave unsupported steps empty; no doses, protocols or
  thresholds unless the source gives them. Normalise the model's output. Drop
  malformed steps rather than guessing.
- **Framing.** The Chains tab carries a quiet, permanent line:
  "Study aid built from your notes. Not medical advice." No modal.
- **Privacy.** In Medicine sets, capture shows a one-time reminder not to include
  real patient details. Update `server/src/privacy.ts` if chains are stored
  server-side (they will be, to sync).
- **Backward compatible.** Clients that don't know about chains (the published
  0.3.0 extension, the current mobile app) must keep syncing without errors,
  and non-medicine generation must be unchanged. Test both.
- **Cost.** Chains come out of the existing generation call where possible,
  rather than a second paid call. If you need a second call, justify it and
  charge it the way generation is charged.
- **Storage.** New server tables or columns go through an append-only
  migration in `server/src/db.ts`. Deleting a set or account must remove its
  chains too: extend `deleteUserData` and its schema-discovery test.
- Accessible (the chain reads in order to a screen reader) and theme-correct at
  360px wide.

## Definition of done

- A set can be switched to Medicine, generate chains, show them, flag gaps, take
  edits that survive regeneration, and sync them to another device.
- **Tests cover:**
  - template and chain validation,
  - normalisation of bad model output,
  - edit preservation across regeneration,
  - sync round trip, including an old client that ignores chains,
  - account and set deletion removing chains,
  - unchanged generation for other modes.
- A live check: one generation against the real provider on a sample medical
  chat (for example the asthma one below). Include the resulting chain in your
  report. Pass the key inline, never save it to a file, and never paste it.
- Everything in "Verify" passes.

Sample source idea for the live check: a chat explaining asthma triggers,
airway inflammation, bronchoconstriction and mucus, difficulty exhaling,
wheeze, spirometry, and bronchodilator plus inhaled steroid treatment.

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

- **Decisions:** the data model, where chains are stored and synced, and how
  edits survive regeneration.
- **The extraction instructions,** quoted.
- **The live-check chain.**
- **Tests:** failing output first, then passing.
- **Anything left rough.**
