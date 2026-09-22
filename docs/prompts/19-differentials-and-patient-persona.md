# 19 — Medicine: compare chains (differentials) and the "worried patient" persona

**Depends on:** 15, 16 (link cards), 10 (the persona list in Teach it back).
**Branch:** `feat/differentials-patient`

You decide the implementation and write your own tests (test first). This file
says **what** to build and the rules. Follow `AGENTS.md` in full. Commit only
source and test files, with no scratch scripts and no copies of this prompt.
Check `git status` before committing.

## Part A: Compare two chains

### Why
Similar conditions share most of their chain and split at one or two points.
Asthma and COPD split at reversibility on spirometry. Exams test exactly those
forks, so learners need to see them and drill them.

### What the learner experiences
1. **Opening Compare.** On a Medicine set with at least two chains, a
   **Compare** action. The learner picks two conditions. Suggest likely pairs
   first: chains that share several steps.
2. **Side by side.** The two chains aligned step by step. Shared or near-identical
   steps are muted, and **the divergence points are highlighted**. It must work in
   the narrow panel: for example, a stacked layout per step, with the two
   conditions' statements one above the other, instead of two columns.
3. **Fork cards.** A **Make cards for the differences** action creates cards
   targeting each divergence ("What separates asthma from COPD on
   spirometry?"). They join the normal review like link cards (prompt 16), so
   they sync and schedule the same way.

### Rules
- **Deciding which steps are "the same" is a judgement.** Use the model or a
  deterministic similarity, but the learner can override: mark a step
  same or different. Their override wins and persists.
- **Fork cards are built only from filled steps** in both chains.
- **Both conditions must come from the learner's own chains.** No invented
  comparisons.

## Part B: The "worried patient" persona in Teach it back

### Why
Explaining a diagnosis and treatment in plain words to a patient is a real
clinical skill, and a strong test of understanding.

### What the learner experiences
- **The persona.** In Teach it back on a Medicine set, a third persona appears:
  **🧑‍⚕️ A worried patient** (label and emoji your choice, consistent with prompt
  10's chip). It asks what patients ask: "Is it serious?", "Will I need this
  forever?", "What are the side effects?". It reacts to jargon ("I don't know
  what that means").
- **The evaluation** adds whether the explanation was accurate against the
  learner's chain, understandable to a layperson, and reassuring without false
  promises.
- **The chip** from prompt 10 shows this persona during the session.

### Rules
- **Only in Medicine sets.** Other sets keep the existing two personas.
- **Grounded like the rest of Teach it back:** judged against the set's material,
  never inventing medical facts, no doses unless in the source.
- **Reuse the existing Teach it back routes and flow.** Extend the persona
  handling server- and client-side, rather than building a new route, unless
  you justify it.

## Definition of done

- Compare shows aligned chains with highlighted forks, supports overrides, and
  creates fork cards that review and sync.
- The patient persona is available only in Medicine sets and is shown in the
  chip. It asks patient-style questions, and the evaluation includes the
  patient-communication criteria.
- **Tests cover:**
  - alignment and divergence detection,
  - overrides persisting,
  - fork-card creation (including skipping gaps),
  - persona availability rules,
  - the server accepting and validating the new persona,
  - wiring.
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

- **Decisions:** how steps are aligned and forks detected, override storage, and
  how the persona is wired.
- **Tests:** failing output first, then passing.
- **Anything left rough.**
