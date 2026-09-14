# Mafsar Mobile — Plan, Design & Build Prompt

People study flashcards on their phones. Today Mafsar only runs in a desktop
browser, even though study sets already sync to the Railway backend. This
document covers the cross-platform (iOS + Android) review app that closes that
gap.

Three parts:
1. **The plan** — technology choices, architecture, scope, phases.
2. **The design** — screens, layout, interaction and visual system.
3. **The build prompt** — a self-contained spec to hand to a coding agent.

---

## Part 1 — The plan

### What the phone app is (and is not)
The extension is where material is **made**: capture a chat, generate cards.
The phone is where material is **studied**: short sessions on the bus, in bed,
between classes. So v1 is a **review companion**, not a port of the panel.

| In v1 | Later | Never on mobile |
|---|---|---|
| Sign in (email + Google) | Import a share link (`/s/:code`) | Chat capture (no AI-chat DOM on a phone) |
| Sync sets / cards / quiz / activity / review log | Apply / typed-answer / coding practice (LLM routes) | Quizlet DOM import |
| Today: due count, streak, exam readiness | Teams leaderboard (read-only) | Buying a plan in-app (see Billing) |
| Sets list + set detail (read-only cards) | Card edit / delete | |
| Flashcard review with SM-2 grading | Home-screen widget | |
| Multiple-choice quiz | Web build of the same app on the Railway domain | |
| Works fully offline, syncs when online | | |
| Local daily review reminder | | |

### Technology choice

**Expo (React Native) + TypeScript.** Reasons, weighed against the alternatives:

| Option | Verdict |
|---|---|
| **Expo / React Native** ✅ | One TypeScript codebase for iOS + Android. Mafsar's scheduling and sync logic (`srs.js`, `readiness.js`, `sync/map.js`) is plain JS with no `chrome.*`, so it runs **unchanged** in React Native. That code is the part that must behave the same on every device. Native feel, real push/local notifications, haptics, app-store presence. EAS builds iOS apps from Windows (no Mac needed). |
| PWA on the Railway domain | Cheapest, but iOS web push only works after the user adds the site to their home screen, storage can be evicted, and there's no store listing. Good as a *later* web target (Expo can export web). |
| Capacitor wrapping the panel | The panel builds HTML strings and relies on `chrome.storage`. Wrapping it gives a desktop side-panel squeezed into a phone. Not worth it. |
| Flutter | Good toolkit, but Dart can't reuse the JS SRS/sync logic. Two implementations of SM-2 would drift apart. |

**Stack**

| Concern | Choice | Why |
|---|---|---|
| Framework | Expo SDK (latest stable), React Native, TypeScript strict | Managed native layer; OTA updates |
| Navigation | `expo-router` (file-based, tabs + stacks) | Deep links for `/s/:code` come built-in |
| Local DB | `expo-sqlite` | Offline-first source of truth; mirrors server tables. Handles thousands of cards without loading one big JSON blob into memory |
| Server state / sync trigger | Plain module + `@tanstack/react-query` for `/v1/me` etc. | Sync itself is a hand-written push/pull, not a cache |
| Tokens | `expo-secure-store` | Keychain / Keystore; never AsyncStorage |
| Google sign-in | `expo-web-browser` + existing `/v1/auth/google/start` → `/poll` flow | **No server change**: the poll-token flow was built for a client that can't receive a redirect |
| Reminders | `expo-notifications` (local, scheduled) | "12 cards due" at the user's chosen time; no push server needed |
| Haptics / gestures / animation | `expo-haptics`, `react-native-gesture-handler`, `react-native-reanimated` | Card flip, grade feedback |
| Fonts | System sans (SF / Roboto) + one serif for card text, matching the panel's `--serif` | |
| Tests | `vitest` for shared logic + sync; `jest-expo` + React Native Testing Library for screens | |
| Builds / release | EAS Build + EAS Submit; EAS Update for JS-only fixes | Builds from Windows |
| Errors | `sentry-expo` (optional, behind env var) | |

### Repo layout
Keep one repo. Add two folders and move pure logic so both clients share it.

```
mafsar/
  shared/                  ← NEW: pure, dependency-free logic used by BOTH clients
    srs.js                 (moved from src/storage/srs.js)
    readiness.js           (moved from src/storage/readiness.js)
    sync-map.js            (moved from src/sync/map.js)
    streak.js              (computeStreak / weekActivity / dayKey, split out of store.js)
    quiz.js                (shuffleQuiz / quickQuizLen, split out of ui/flows/quiz.js)
  src/                     extension — re-imports from ../shared (build.mjs copies shared/ into dist)
  mobile/                  ← NEW: Expo app
  server/
```
The existing `tests/srs.test.mjs`, `sync-map.test.mjs` etc. keep running against
`shared/`, which protects both clients at once.

### Architecture
```
 ┌───────────── Phone ─────────────┐
 │  Screens (expo-router)          │
 │     │ read/write                │
 │  SQLite (sets, cards, quiz,     │        POST /v1/sync
 │   activity, review_log, outbox) │ ◀────▶ Hono API on Railway ─▶ Turso
 │     │                           │        /v1/auth/*, /v1/me
 │  shared/srs.js · readiness.js   │
 └─────────────────────────────────┘
```
* **Local-first.** Every grade writes to SQLite immediately and marks the row
  dirty. The UI never waits on the network.
* **Sync** runs on app foreground, after a review session ends, on pull-to-refresh,
  and when connectivity returns. It uses the same single `POST /v1/sync` call as
  the extension: push dirty rows plus `since`, apply the response last-write-wins,
  and store `serverTime`.
* **Auth**: access token (15 min) is refreshed with the 30-day refresh token
  inside one `authedFetch` wrapper. A refresh failure signs the user out but
  **keeps local data**, same as the extension.

### Phase 0 — backend fixes that must land first
Both were found while reading the current sync code. A second device (the
phone) turns each from "latent" into "broken on day one".

1. **`dueDate` is lost on pull.** The extension pushes `dueDate` as an ISO
   string (`sync/map.js` `toServer`), the server stores that string, and
   `changesSince` returns `Number(r.due_date)`. `Number("2026-…Z")` is `NaN`,
   which JSON encodes as `null`. So every card a device *pulls* arrives with no
   due date and counts as due now. The phone would show the entire library
   as due. The server test `sync-conflicts.test.ts` misses this because it calls
   `applySync` directly with an epoch number, skipping zod and the real client
   format.
   **Fix:** accept ISO or epoch on the way in, always store ISO, always return
   ISO, and update `applyServer` to parse it. Add an HTTP-level round-trip test
   that goes through `/v1/sync` with the exact extension payload.
2. **Clock skew can hide changes from other devices.** `changesSince` filters on
   `updated_at > since`, but `updated_at` is the *client's* clock and `since` is
   the *server's* clock. A phone whose clock is 2 minutes slow pushes grades
   stamped earlier than the `serverTime` the laptop already holds, so the laptop
   never pulls them.
   **Fix:** add a `server_updated_at` column (set to `nowISO()` on every accepted
   write) to `sets`, `cards`, `quiz`, and filter `changesSince` on it. Keep
   client `updated_at` for last-write-wins decisions only. Add a migration and a
   skew test.
3. *(Small, recommended)* **Activity undercounts across devices.** Activity
   merges by taking the higher daily count, so 10 reviews on the laptop plus 5
   on the phone shows 10 for the day. Streaks stay correct. Leave it for v1 and
   note it; the durable fix is to derive counts from `review_log`.

### Billing
Apple and Google require in-app purchase for digital subscriptions bought
inside the app, and restrict pointing users to outside checkout. v1 shows the
user's plan and usage **read-only** from `/v1/me`, with no upgrade button and no
external checkout link. Reviewing synced cards uses no LLM quota, so it is free
for every plan anyway.

### Phases
1. **Phase 0** — the backend fixes above (+ tests). Ship to Railway.
2. **Phase 1 — Foundations**: `shared/` extraction (extension still green),
   Expo scaffold, design tokens, SQLite schema + migrations, auth (email +
   Google), sync engine with tests.
3. **Phase 2 — Study loop**: Today, Sets, Set detail, Review, Quiz, done screens,
   offline behaviour, haptics.
4. **Phase 3 — Habit**: local reminders, streak details, exam readiness on Today,
   settings (theme, reminder time, sign out).
5. **Phase 4 — Ship**: icons/splash from `icons/logo-master.png`, store listing,
   privacy labels (reuse `/privacy`), TestFlight + Play internal testing, EAS Update channel.
6. **Later**: share-link import via universal links, LLM practice modes, teams,
   widget, Expo web build served at `/app` on Railway.

### Risks
* **Sync correctness** is the whole product on mobile. Phase 0 plus a sync test
  suite comes before any UI polish.
* **Large libraries**: `/v1/sync` with no `since` returns everything unpaged.
  That's fine for hundreds of cards. Add paging when someone passes ~5k.
* **Store review**: the app does nothing without an account, because sets can't
  be created on mobile, and reviewers may push back on that. Say clearly on the
  sign-in screen that sets are made in the browser extension, and give
  reviewers a demo account with sets already in it.

---

## Part 2 — The design

### Principles
1. **One thumb, one hand.** Every action in a study session sits in the bottom
   40% of the screen.
2. **Open → reviewing in one tap.** The Today screen's primary button starts the
   due queue.
3. **Same Mafsar.** Same teal ink, one warm accent for streaks, same light/dark
   tokens as `src/ui/panel.css`, so the phone and the extension look like one product.
4. **Calm, not gamey.** No confetti storms. A streak flame, a progress ring, a
   quiet "caught up" state.

### Design tokens (lifted from `panel.css`)
| Token | Light | Dark |
|---|---|---|
| `bg` | `#eff3f2` | `#0c1312` |
| `surface` | `#ffffff` | `#141d1b` |
| `surface2` | `#e9eeed` | `#1c2725` |
| `border` | `#e0e5e4` | `#293330` |
| `ink` | `#14201e` | `#e9efed` |
| `muted` | `#5b6b67` | `#96a5a0` |
| `faint` | `#8b9793` | `#6c7a76` |
| `primary` | `#0b6e77` | `#35b7b4` |
| `primarySoft` | `#e0edee` | `#123030` |
| `warm` (streak) | `#c0782f` | `#e1a251` |
| `success` | `#2e9c6a` | `#3eb77c` |
| `danger` | `#cd584e` | `#e0776d` |

Radii 16 / 12 / 9. Spacing on a 4-pt grid. Type: system sans 15/17/22/28 with
tabular numbers for counts; **serif at 22–26 for card text** (the flashcard is
the hero). Minimum touch target 48 pt. Follow system theme with a manual override.

### Navigation
Bottom tabs: **Today · Sets · You**. Review and Quiz are full-screen modals over
the tabs, with no tab bar, so nothing competes with the card.

### Screens

**1. Welcome / Sign in**
```
┌──────────────────────────┐
│        [Mafsar logo]     │
│  Review your cards       │
│  anywhere.               │
│  Sets you make in the    │
│  browser extension show  │
│  up here.                │
│                          │
│ [ G  Continue with Google ]
│ [   Sign in with email   ]│
│  Don't have sets yet? →  │  (opens landing page)
└──────────────────────────┘
```
After sign-in: a "Syncing your library…" state with a count ("214 cards").
It must not look frozen.

**2. Today** (home tab)
```
┌──────────────────────────┐
│ Good evening        🔥 12 │  streak chip (warm)
│                          │
│ ┌──────────────────────┐ │
│ │  38                  │ │  big tabular number
│ │  cards due · ~15 min │ │
│ │ ▓▓▓▓▓▓░░░ 62% mastered│ │
│ └──────────────────────┘ │
│                          │
│ ┌ 🎯 Exam in 9 days ────┐ │  only if an exam date exists
│ │ Contracts · On track  │ │  pill: On track / Behind
│ │ 14 cards/day to finish│ │
│ └──────────────────────┘ │
│  This week  M T W T F S S│  7 dots, filled by activity
│                          │
│  Continue                │  up to 3 sets with due cards
│  Torts  ·  12 due     ›  │
│  Big-O  ·   6 due     ›  │
│                          │
│ [   Review 38 cards    ] │  primary, pinned above tab bar
│  Today   Sets    You     │
└──────────────────────────┘
```
Caught-up state: the button becomes a quiet "All caught up · next card in 3 h" and
offers "Study ahead" as a secondary text button.

**3. Sets** — searchable list. Each row shows title, source label (ChatGPT /
Claude / Quizlet), a due-count badge, and a thin mastery bar. Sort by most
due, then recent. Pull-to-refresh runs a sync. Empty state explains that sets
are made in the extension and links to the landing page.

**4. Set detail** — header (title, source, exam date), three stats (Due /
Learning / Mastered), then primary **Review** and secondary **Quiz · N**. Below
that, a read-only card list (front, with the back shown on tap).

**5. Review** (full-screen, the most important screen)
```
┌──────────────────────────┐
│ ✕   ▓▓▓▓░░░░░░    7 / 38 │
│                          │
│ ┌──────────────────────┐ │
│ │ QUESTION             │ │
│ │                      │ │
│ │  What does res ipsa  │ │  serif, centered vertically
│ │  loquitur establish? │ │
│ │                      │ │
│ └──────────────────────┘ │
│                          │
│   [   Show answer    ]   │  large, bottom
└──────────────────────────┘
          ↓ tap card or button
┌──────────────────────────┐
│ ✕   ▓▓▓▓░░░░░░    7 / 38 │
│ ┌──────────────────────┐ │
│ │ QUESTION             │ │
│ │ What does res ipsa…  │ │  question shrinks up
│ │ ──────────────────── │ │
│ │ ANSWER               │ │
│ │ Negligence can be    │ │  scrolls if long
│ │ inferred from the…   │ │
│ └──────────────────────┘ │
│ ┌─────┬─────┬─────┬────┐ │
│ │Again│Hard │Good │Easy│ │  4 grade buttons, equal width
│ │ 1d  │ 1d  │ 6d  │ 6d │ │  interval preview from shared/srs.js
│ └─────┴─────┴─────┴────┘ │
└──────────────────────────┘
```
* Flip is a 180 ms fade-and-rise, not a 3D spin (easier to read, respects
  Reduce Motion).
* A light haptic on reveal, a success haptic on Good/Easy, and a soft one on Again.
* Swipe shortcuts are optional and off by default: →Good, ←Again. Buttons are
  always the primary control.
* "Again" requeues the card 3 positions later, at most 2 times, matching `review.js`.
* ✕ asks "End session? Your N grades are saved." Grades are already saved.
* Offline: a small cloud-off glyph in the top bar. Nothing is blocked.

**6. Review done** — "38 cards reviewed", streak +1 animation on the flame,
then the same follow-up as the extension: if all cards came from one set that
has a quiz, show **Take a quick quiz · N questions**. Otherwise show **Done**.

**7. Quiz** — question in sans 18/600, options as full-width 56 pt tappable
rows. On tap: the correct row turns `success`, a wrong pick turns `danger`, and
the explanation slides up with a **Next** button pinned at the bottom. Question
and option order are shuffled with `shared/quiz.js`. The done screen shows the score and
a "Review missed cards" button.

**8. You** — account email, plan + usage (read-only), last synced time with
"Sync now", reminder toggle + time picker, theme (System/Light/Dark),
privacy link, sign out ("Your cards stay on this phone until you sign in again").

### States every screen must handle
Loading (skeleton, not spinner, for lists), empty, offline, sync error (inline
banner with Retry; never a modal), signed-out-token-expired (banner → sign in,
data kept), very long card text (scroll inside the card), and Dynamic Type up to
XXL without clipping.

### Accessibility
VoiceOver/TalkBack labels on grade buttons ("Good, next review in 6 days");
contrast ≥ 4.5:1 in both themes (tokens above pass); respect Reduce Motion;
never rely on colour alone in quiz feedback (add ✓ / ✕ icons).

---

## Part 3 — The build prompt (hand this to a coding agent)

> **Copy everything below this line into a fresh coding session, in the Mafsar repo.**

---

You are building **Mafsar Mobile**, a cross-platform (iOS + Android) companion
app for Mafsar. Mafsar is a Chrome/Firefox extension that turns AI-chat learning
sessions into flashcards, multiple-choice quizzes, and SM-2 spaced-repetition
reviews. Users make study sets in the extension. Those sets sync to a Hono
backend on Railway (`https://mafsar-production.up.railway.app`) backed by
Turso/libSQL. The phone app lets them **review and quiz on those synced sets**,
offline-first.

Read these files before writing code. They are the source of truth for
behaviour you must match:
- `server/src/app.ts`: routes (`/v1/auth/*`, `/v1/me`, `/v1/sync`)
- `server/src/sync.ts`, `server/src/schema.ts`: sync semantics and payload shapes
- `server/src/auth.ts`: access token 15 min, refresh token 30 days
- `src/sync/map.js`, `src/sync/sync.js`, `src/sync/auth.js`: the extension's sync client
- `src/storage/srs.js`: SM-2 (`review`, `isDue`, `byDue`, `masteryOf`)
- `src/storage/readiness.js`: `examReadiness`, `nextExam`, `weakTopics`
- `src/storage/store.js`: `dayKey`, `computeStreak`, `weekActivity`, `bumpActivity`
- `src/ui/flows/review.js`, `src/ui/flows/quiz.js`: session behaviour (relearn requeue, quick-quiz length, shuffling)
- `src/ui/panel.css`: the design tokens (top of file)
- `docs/mobile-app-build-prompt.md` Parts 1–2: the plan and design you are implementing

Work in the phases below, **in order**. Finish each phase with passing tests
and a short summary before you start the next. Stop and ask before any change
not described here.

### Phase 0 — Backend sync fixes (server/, required first)

1. **dueDate round-trip bug.** The extension sends `dueDate` as an ISO string.
   `changesSince` returns `Number(r.due_date)`, which is `NaN` for ISO strings, so the JSON
   becomes `null` and pulled cards all look due.
   - In `schema.ts`, accept `dueDate` as ISO string **or** epoch-ms number, and normalise it to ISO.
   - Store ISO in `cards.due_date`. Write a migration that converts existing
     numeric-looking values (`"1799999999999"`, `"1799999999999.0"`) to ISO.
   - `changesSince` returns ISO (or null).
   - Update `src/sync/map.js` `applyServer` to parse ISO **or** number so old
     and new servers both work.
   - Add a test that goes through the HTTP `POST /v1/sync` with the exact
     payload `toServer` produces, then pulls it back and checks the due date is kept.
     Fix `sync-conflicts.test.ts` to use the real client format.
2. **Clock-skew-safe pulls.** Add `server_updated_at TEXT` to `sets`, `cards`,
   `quiz` (migration backfills from `updated_at`, with indexes `(user_id, server_updated_at)`).
   Set it to `nowISO()` on every write that `applySync` accepts. Filter
   `changesSince` on `server_updated_at > since`. Keep last-write-wins on
   client `updated_at`. Filter `review_log` on a new `received_at` column the same way.
   Test: device A pushes with a clock 5 minutes behind the server, and device B
   with an older `since` still pulls it.
3. Run `cd server && npm test && npx tsc --noEmit` and the root
   `node tests/*.test.mjs` suites. All must pass. Do not change any other
   route's behaviour.

### Phase 1 — Shared logic + Expo foundation

1. **Extract `shared/`** at the repo root: move `srs.js`, `readiness.js`,
   `sync/map.js` → `shared/sync-map.js`; split `dayKey`/`computeStreak`/
   `weekActivity` into `shared/streak.js` and `shuffled`/`shuffleQuiz`/
   `quickQuizLen` into `shared/quiz.js`. These files must stay dependency-free
   ES modules with no `chrome.*` and no DOM, and keep their JSDoc types. Update
   extension imports and `tools/build.mjs` so `shared/` ships in the Chrome and
   Firefox builds. Point existing tests at `shared/`. CI globs must still find
   them. The extension must behave identically (load it unpacked and smoke-test review + quiz).
2. **Scaffold `mobile/`** with the latest stable Expo SDK, TypeScript strict,
   `expo-router`. Dependencies: `expo-sqlite`, `expo-secure-store`,
   `expo-web-browser`, `expo-notifications`, `expo-haptics`,
   `react-native-gesture-handler`, `react-native-reanimated`,
   `@react-native-community/netinfo`, `@tanstack/react-query`. Configure Metro
   so `mobile/` can import `../shared/*.js`. Add `mobile/app.config.ts` with
   `API_BASE` from `EXPO_PUBLIC_API_BASE` (default the Railway URL), bundle id
   `com.mafsar.app`, scheme `mafsar`, icons from `icons/icon512.png`.
3. **Theme**: `mobile/src/theme/tokens.ts` with the exact light/dark palette,
   radii, spacing, type scale from Part 2. `useTheme()` follows the system and
   supports a stored override. No hard-coded colours in components.
4. **Local database** (`mobile/src/db/`): SQLite tables mirroring the server
   (`sets`, `cards`, `quiz`, `activity`, `review_log`), plus `dirty INTEGER` on
   mutable rows and a `meta` key/value table (`lastSync`, `userId`). Store
   `dueDate`/`examDate` as epoch ms locally (what `shared/srs.js` expects) and
   convert at the sync boundary only. Versioned migrations. Index
   `cards(set_id)`, `cards(due_date) WHERE deleted = 0`.
5. **Auth** (`mobile/src/auth/`):
   - Email: `POST /v1/auth/login` / `register`.
   - Google: `POST /v1/auth/google/start` → `WebBrowser.openAuthSessionAsync(authUrl)`
     → poll `POST /v1/auth/google/poll` every 2 s (max 10 min, stop on
     `ready|error|expired`, and stop if the user closes the browser and presses Cancel).
     No server changes needed.
   - Tokens in SecureStore. `authedFetch` adds the bearer token and on 401 refreshes once
     via `/v1/auth/refresh`, retries, and signs out on a second failure. Signing
     out clears tokens and `lastSync` but **keeps** local study data. If a
     *different* user signs in, ask before wiping local data.
6. **Sync engine** (`mobile/src/sync/`), matching the semantics of `server/src/sync.ts`:
   - Push: all `dirty = 1` rows in server shapes (ISO timestamps), plus all
     `activity`, plus `review_log` rows not yet sent. Send `since = lastSync`.
   - Apply the response in one SQLite transaction, last-write-wins on `updatedAt`
     (only overwrite a local row if the incoming `updatedAt` is newer; tombstones
     win the same way). Activity takes the higher count. Review log dedupes by id.
   - Clear `dirty` only for rows whose `updatedAt` hasn't changed since the push
     was built, so a grade made during an in-flight sync is not lost.
   - Save `serverTime` as `lastSync`. Allow one sync at a time (a mutex that
     coalesces requests).
   - Triggers: app start, app → foreground, NetInfo reconnect, end of a review
     or quiz, pull-to-refresh, "Sync now".
   - Tests (vitest, in-memory SQLite or a fake DB adapter): first full pull,
     incremental pull, local edit during sync, remote tombstone, stale remote
     write ignored, activity max-merge, 401 → refresh → retry.

### Phase 2 — Study loop screens

Build to the Part 2 wireframes. Tabs: `app/(tabs)/today.tsx`, `sets.tsx`,
`you.tsx`. Modals: `app/review.tsx`, `app/quiz.tsx`. Stack: `app/sets/[id].tsx`.
Auth: `app/(auth)/welcome.tsx`, `sign-in.tsx`.

- **Today**: due count + estimate (`~max(1, round(due * 0.4))` min, as in
  `home.js`), mastery %, streak chip, 7-day activity dots, exam card using
  `examReadiness` over sets with a future exam date, "Continue" sets with due
  cards, and a pinned primary "Review N cards" button. Handle the caught-up state (next
  due time + "Study ahead").
- **Sets**: search, due badge, mastery bar, pull-to-refresh, empty state.
- **Set detail**: stats, Review (due first, or study ahead when none are due,
  as in `startSetReview`), Quiz with `quickQuizLen`, read-only card list.
- **Review**: queue sorted with `byDue`; tap to reveal; four grade buttons
  (grades 0/3/4/5) showing `review(card, g, now, examDate).interval` in days.
  On grade, in one transaction: update the card with `review(...)`, set `updatedAt`, mark dirty; add
  `review_log` row (`uuid`, `prevInterval`, `newInterval`, ISO `reviewedAt`);
  bump `activity[dayKey()]`. Relearn requeue: grade < 3 goes back in 3 positions later, at most 2 times per card.
  Done screen counts distinct cards reviewed and offers a quick quiz when the queue
  came from one set that has a quiz. Haptics as specified. Respect Reduce Motion.
- **Quiz**: `shuffleQuiz`, tappable option rows, correct/incorrect with icon + colour,
  explanation, Next, and a score screen. Quiz answers are not synced (same as the extension).
- **Every screen** handles loading / empty / offline / sync-error / long text / large Dynamic Type.
- Component tests for Review (reveal → grade → next, relearn requeue) and Quiz
  (shuffle keeps the correct answer, scoring).

### Phase 3 — Habit + settings
- Local reminder with `expo-notifications`: user picks a time (default 19:00).
  Ask for notification permission only when the user turns reminders on. Each day
  at that time, show "N cards due" computed from SQLite when the app last
  ran, and reschedule after every sync or review. If nothing is due, don't
  notify.
- **You** screen: email, plan/usage read-only from `/v1/me` (**no purchase or
  checkout links**, per app-store rules), last synced + Sync now, reminder
  toggle/time, theme, privacy link (`/privacy`), sign out.

### Phase 4 — Release readiness
- App icon + splash from `icons/logo-master.png` on `#0b6e77`; dark splash variant.
- `eas.json` with `development`, `preview`, `production` profiles; EAS Update channel per profile.
- Accessibility pass (labels, contrast, Dynamic Type, Reduce Motion).
- Add a `mobile` job to `.github/workflows/ci.yml`: `npm ci`, `tsc --noEmit`, tests, `expo-doctor`.
- `mobile/README.md`: run on device with Expo Go / dev client, env vars, build and submit.

### Constraints
- **Offline-first.** Nothing in the study loop may block on the network.
- **One implementation of the scheduling logic.** Import `shared/srs.js`,
  `readiness.js`, `streak.js`, `quiz.js`. Never re-implement SM-2 or streak
  math in TypeScript. Add `.d.ts` declarations if needed.
- **Match the existing wire format** in `server/src/schema.ts` exactly. The
  extension and phone must be able to sync the same account back and forth
  without data loss. Write an end-to-end test that does exactly this against a
  local server (`cd server && npm run dev`).
- **No new server routes** beyond the Phase 0 fixes. No LLM calls in v1.
- **Security**: tokens only in SecureStore; never log tokens or card content;
  HTTPS only.
- Match the repo's comment style: brief comments that explain *why*, not what.
- Don't commit secrets. Don't bump the extension version.

### Definition of done (v1)
A user who made sets in the extension installs the app, signs in with Google,
sees their library with correct due counts (not "everything due"), reviews 20
cards in airplane mode, reconnects, and sees those grades, the streak, and the
activity on the extension after its next sync. All server, shared, extension, and
mobile tests pass in CI.
