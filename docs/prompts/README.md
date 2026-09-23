# Task prompts

Each file is a self-contained, test-first task. Give an agent one file at a time,
for example: *"Implement docs/prompts/02-abuse-protection.md. Follow AGENTS.md."*

## Order and dependencies

| # | Prompt | Depends on | Touches |
|---|---|---|---|
| 01 | [Type check in CI](01-typecheck-ci.md) | — | `tsconfig.json`, CI, 2 small JS fixes |
| 02 | [Abuse protection](02-abuse-protection.md) | — | `server/src/app.ts`, new `server/src/ratelimit.ts` |
| 03 | [Terms, refund policy, pricing](03-legal-pages.md) | — | `server/src/app.ts`, `privacy.ts`, `landing/`, `you.js` |
| 04 | [Accurate listing and privacy text](04-listing-privacy-accuracy.md) | — | `docs/store-listing.md`, `privacy.ts`, `you.js`, `teams.js` |
| 05 | [Account deletion](05-account-deletion.md) | — | `server/src/app.ts`, billing providers, `privacy.ts`, You tab |
| 06 | [Error reporting (Sentry)](06-error-reporting.md) | — | `server/src/app.ts`, `index.ts`, `privacy.ts` |
| 07 | [YouTube and PDF capture](07-youtube-pdf-capture.md) | **02** | service worker, capture UI, new server route, `privacy.ts` |
| 08 | [Teach it back (Feynman)](08-teach-it-back.md) | **02** | new flow, new server routes, `billing/core.ts`, `privacy.ts` |
| 09 | [UX polish: delete set, Needs work, updates, delete account](09-ux-polish.md) | — | `src/ui/`, `readiness.js`, service worker, `server/src/app.ts` |
| 10 | [Teach it back: show who you're teaching](10-teach-persona-indicator.md) | 08 | `src/ui/flows/teach.js`, `src/storage/teach.js`, CSS |
| 11 | [System design: Design drill mode](11-design-drill.md) | — | new mode, new server routes, coding-style flow, `privacy.ts` |
| 12 | [System design: estimation drills](12-estimation-drills.md) | **11** | new route, unit parsing, design sets |
| 13 | [System design: trade-off cards](13-tradeoff-cards.md) | **11** | `/v1/generate` (mode-aware), worker generation path |
| 14 | [System design: find the bottleneck](14-find-the-bottleneck.md) | **11** | new routes, design sets, `privacy.ts` |
| 15 | [Medicine: mechanism chains (foundation)](15-medicine-chains.md) | **13** | new mode, chain storage + sync + migration, `/v1/generate`, Chains tab |
| 16 | [Medicine: link cards in review](16-chain-link-cards.md) | **15** | review queue, sync, mobile review |
| 17 | [Medicine: chain drills](17-chain-drills.md) | **15** | new flow, `/v1/grade` reuse |
| 18 | [Medicine: clinical cases](18-clinical-cases.md) | **15**, **11** | Design drill engine, new routes, `privacy.ts` |
| 19 | [Medicine: differentials + patient persona](19-differentials-and-patient-persona.md) | **15**, **16**, **10** | compare view, fork cards, Teach it back personas |
| 20 | [Google sign-in hangs when switching accounts](20-google-account-switch.md) | — | `src/ui/views/you.js`, `src/sync/auth.js`, `server/src/app.ts` (live bug) |
| 21 | [One device, several accounts](21-per-account-data.md) | **20** | `src/storage/store.js`, `src/sync/`, the worker (replaces 20's switch screen) |
| 22 | [The panel's top edge looks bolted on](22-panel-top-seam.md) | — | `src/ui/panel.css`, view headers (visual only) |
| 23 | [Run Mafsar in a tab](23-open-in-tab.md) | **21** | `service-worker.js`, `core.js`, You tab, `panel.css` |
| 24 | [Request limits, IP trust, signing secret](24-server-hardening.md) | — | `server/src/app.ts`, `schema.ts`, `auth.ts` (security) |
| 25 | [Saving a set destroys its tombstones](25-tombstone-loss.md) | **21** | `src/storage/store.js`, 6 panel call sites (data bug) |
| 26 | [Local data hygiene](26-local-data-hygiene.md) | **21**, after **25** | `src/storage/store.js` |
| 27 | [Sync the compare overrides](27-sync-compare-overrides.md) | **19** | `db.ts` migration, `sync-map.js`, server schema |
| 28 | [Scraper resilience](28-scraper-resilience.md) | **07** | YouTube + AI Studio extractors, HTML fixtures |
| 29 | [Split the big three](29-split-the-big-three.md) | — | `llm.ts`, `service-worker.js`, `app.ts` (run alone) |
| 30 | [Usage counts](30-usage-counts.md) | — | `server/src/app.ts`, `privacy.ts` |

**24 to 30 in order:** 24 and 25 are the two that matter; 29 rewrites the
files almost everything else touches, so run it on its own and merge it the same
day. 24, 29 and 30 all edit `server/src/app.ts` — never two at once.

**Running in parallel:** 02, 03, 05, 06, 07 and 08 all edit
`server/src/app.ts`, and 03 to 08 all edit `server/src/privacy.ts`. Run those one
at a time, and merge each before starting the next. Two combinations are safe to
run side by side:

- **01 with any other task.** It touches neither file.
- **02 with 04.** 02 edits only `app.ts` and 04 edits only `privacy.ts`.

**System design (11–14):** 11 first. Then 12, 13 and 14 one at a time, merging each
before the next: they all edit `server/src/app.ts`, `server/src/llm.ts` and the set
detail view. Prompts 11–14 leave implementation choices to the agent.

**Medicine (15–19):** 15 first. Then 16, 17, 18, 19 one at a time, merging each
before the next. Like 11–14, these leave implementation choices to the agent.

## Steps no agent can do for you

- **Before handing over 03:** fill in the legal details at the top of that prompt.
- **After 02 is deployed:**
  - Set a credit limit on the OpenRouter key.
  - Run 02's production IP check.
- **After 03 is deployed:** submit the domain for Paddle's domain review.
- **For 04:**
  - Update the live store listings.
  - Change the store-reviewer account's password. It's in git history.
  - Check OpenRouter's privacy settings, so the new privacy claim is true.
- **After 06 is deployed:** create the Sentry project and set `SENTRY_DSN` in Railway.
- **After 07:** check the YouTube selectors on real videos. Nobody has verified them yet.
