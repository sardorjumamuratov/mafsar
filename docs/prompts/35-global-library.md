# 35 — Global library: publish a set, find sets for you

**Depends on:** **34** (categories), **33** (the capture dock, which the new tab has to leave room for)
**Branch:** `feat/global-library`
**Touches:** `server/src/db.ts` (migration), `server/src/app.ts`, `server/src/schema.ts`, `server/src/privacy.ts`, `src/ui/panel.html`, `src/ui/panel.js`, `src/ui/nav.js`, a new `src/ui/views/global.js`, `src/ui/views/set-detail.js`, `src/ui/views/teams.js`, `src/background/service-worker.js`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## What the learner wants

> The sets I make should be able to go global. In a set's ⋯ menu there should be
> a **Make it global** button. Global sets appear in a **Global** tab, ordered by
> my interests.

## What already exists to build on

- **Share codes** (`/v1/share*` in `server/src/app.ts`, `lookupShare` /
  `importSharedSet` in `src/ui/views/sets.js`). Sharing already serves one set's
  content, with no owner identity, no ids and no progress, and adding it makes a
  fresh copy with new ids and its own schedule. Global is the same idea, made
  discoverable. Reuse that path; don't write a second copy routine.
- **The set's ⋯ menu** (`#setMenu` in `set-detail.js`, keyboard-accessible, with
  Regenerate and Delete set).
- **Categories** (prompt 34) on every set, server side only.

## The navigation decision (made here, so the tabs don't overflow)

The bottom nav already has five slots: Home, Sets, ▶ Review, Teams, You. Five is
the most a bottom bar should hold. So:

**Home · Sets · ▶ Review · Global · You.** Global takes Teams' slot, and
**Teams moves inside Global** as a second segment (`Discover | Teams`): both are
"sets from other people". `renderTeams` keeps working, just reached from there.
(Prompt 37's Stats opens from You and Home, not from a new slot.) If you think
another layout is clearly better, say so in your report before building it.

## What must be true when you're done

### Publishing
1. **"Make it global" is in the ⋯ menu** of a set the learner made. It opens a
   confirm sheet that says plainly: anyone using Mafsar can see and copy the
   cards and quiz; your name and email are never shown; your progress stays
   yours; don't publish personal or patient details; you can take it down any
   time. On confirm the set is published, and the menu item becomes **Remove
   from global**.
2. **Only your own work can be published.** Sets whose source is `quizlet`,
   `anki`/import or `shared`/global (someone else's content) can't be, and the
   menu says why instead of offering it. The server enforces this too, not just
   the UI. A set needs at least 5 cards.
3. **Published sets stay live.** The owner's later edits show up for new
   copies, the way shares already work, and deleting the set unpublishes it.
   People who already copied it keep their copy.
4. **Publishing requires sign-in.** Signed out, the item explains that and
   links to You.

### The Global tab
5. **Discover** lists published sets as cards showing title, card count, topic
   line (the prompt 34 topic may be shown here, and only here, as a
   description; the `category` key stays hidden), and how many people added it.
   Prompt 36 adds stars to these cards later. Leave room for them.
6. **Ordered for this learner.** Their interests are the categories of their
   own sets, weighted toward the ones they actually review. Work that out on
   the server from their rows. Nothing new is collected from the device. Sets
   in their categories come first, then everything else. Within each group,
   rank by how many people added the set, newest first on ties. (Prompt 36
   swaps in rating.) Never show the learner their own published sets or sets
   they've already added.
7. **Cold start works.** A learner with no sets sees the most-added sets overall,
   and a row of category chips (friendly labels, e.g. "Medicine", "Programming")
   to narrow the list. A search box filters by title.
8. **Tapping a set shows a preview** (title, a few cards, counts) with **Add to
   my sets**. Adding goes through the existing share-import path, keeps a link
   to the global set (so it's never added twice, and prompt 36 can attach
   ratings), and opens the new set.
9. **The list pages** (e.g. 20 at a time, "Show more"). Show a skeleton while
   loading and a clear message offline. It paints from a short local cache
   first, like every view.

### Safety (public content needs this on day one)
10. **Report.** Every global set has a Report action (reason: spam, wrong or
    harmful, personal info, copyright). After enough distinct reports, pick a
    small number and justify it, the set is hidden pending review. An
    admin-only route (reuse `isAdminEmail` from billing) lists reported sets and
    can remove one or restore it.
11. **Server rules.** Publishing, listing and reporting are all rate-limited
    per user. The listing never returns owner ids or emails, card schedules,
    or `category`. Titles and content are escaped on render like everything
    else (hard rule 1).

### Privacy and terms
12. **Update `server/src/privacy.ts`:** publishing makes a set's content visible
    to other users without identifying the author, and we use your sets'
    subjects to recommend others. Note in your report that the terms page
    (prompt 03, not yet done) needs a user-content clause before this goes live.

Migrations: append at the end, fingerprint in `migrations.test.ts`, count in
`schema.test.ts`. Mind the open slots from `feat/usage-counts` and prompt 34
(see 34's collision warning).

Out of scope: stars (36), the mobile app, comments, author profiles, editing
someone else's global set.

## Definition of done

- Account A publishes a medicine set. Account B, who has medicine sets, sees it
  near the top of Global, adds it, and gets an independent copy. Account C, with
  no sets, finds it through the Medicine chip.
- A Quizlet import can't be published, through the UI or the API.
- Three reports from three accounts hide a set, and the admin route restores it.
- **Tests cover:** publish and unpublish; the ownership and source rules on the
  server; interest ordering; excluding your own and already-added sets; the
  report threshold and admin actions; no owner identity or `category` in any
  listing response; the nav now has Global in Teams' slot, with Teams reachable
  inside it.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd server && npx vitest run && npx tsc --noEmit
```

Then by hand with `dist/chrome` loaded unpacked, against a local server with two
accounts: publish, discover, add, report, unpublish.

## Report

- **The ranking,** in a few lines.
- **Moderation:** the report threshold and why.
- **The migration slot(s)** you used.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **Which manual checks you ran,** and what you couldn't verify.
