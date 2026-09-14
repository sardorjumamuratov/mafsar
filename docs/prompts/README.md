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

**Running in parallel:** 02, 03, 05, 06, 07 and 08 all edit
`server/src/app.ts`, and 03 to 08 all edit `server/src/privacy.ts`. Run those one
at a time and merge each before starting the next. Only 01 and 04 are safe to run
alongside another task.

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
