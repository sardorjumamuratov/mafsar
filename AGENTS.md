# AGENTS.md — rules for AI agents working in this repo

Mafsar is an MV3 browser extension (Chrome + Firefox) that turns AI chats and web
pages into flashcards, quizzes and spaced-repetition review. It has a Hono +
libSQL (Turso) backend in `server/`, deployed on Railway.

## Layout

- `src/`: the extension, in vanilla JS ES modules with no bundler.
  - `src/background/service-worker.js`: background worker and message router.
  - `src/ui/`: the side panel. Views live in `src/ui/views/`, practice flows in `src/ui/flows/`.
  - `src/content/`: content scripts. These are classic scripts, so no `import`.
  - `src/storage/`: pure logic plus `chrome.storage` access.
  - `src/vendor/`: unmodified third-party files. This is the only place they may live.
- `shared/`: pure JS used by both the extension and the mobile app: the FSRS scheduler (`srs.js`), sync mapping, streaks, quiz, readiness. No `chrome.*` or React Native here. The server does not import it (Railway may deploy `server/` alone).
- `mobile/`: the Expo (React Native) phone app. It reviews the same cards through `/v1/sync`. Check it with `cd mobile && npm run typecheck && npm test && npx expo install --check`.
- `server/`: the TypeScript API, run with `tsx`. Database migrations are the `MIGRATIONS` list in `server/src/db.ts`.
- `landing/`: the landing page, served by the backend.
- `tests/*.test.mjs`: extension tests. Each is a self-running plain-node script.
- `server/tests/*.test.ts`: server tests (vitest).
- `tools/build.mjs`: builds `dist/mafsar-{chrome,firefox}-<version>.zip` from everything under `src/` and `shared/`.
- `docs/prompts/`: task prompts. When asked to implement `docs/prompts/NN-….md`, follow that file exactly, and read `docs/prompts/README.md` for order and dependencies.

## Hard rules

1. **No `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` in `src/`.** All markup goes through `setHTML` / `replaceHTML` / `insertHTMLBefore` in `src/ui/core.js`, and every interpolated value is wrapped in `esc()`. Firefox Add-ons rejects the extension otherwise, and `tests/ui-static.test.mjs` enforces it.
2. **No npm dependencies, bundler or transpiler for the extension.** Server dependencies go in `server/package.json`.
3. **Content scripts can't `import`.** They attach to `window.__mafsar*` globals.
4. **Every message sent to a tab needs a timeout.** Content-script `onMessage` handlers `return true`, so a message type with no reply branch would hang its caller forever. Use `sendToTab` (panel) or `askTab` (worker), never a bare `chrome.tabs.sendMessage`. Never add a message type without a reply branch.
5. **Migrations are append-only.** Never edit, reorder or delete an existing entry in `MIGRATIONS`.
6. **Don't change `manifest.json` permissions or host permissions** unless the task explicitly says to. It changes the install prompt and triggers store re-review.
7. **Never commit secrets:** API keys, tokens, passwords, or store-reviewer test credentials. Docs included.
8. **No new third-party data flows** unless the task says so. When one is added, update `server/src/privacy.ts` in the same change.
9. **Users must see an actionable error.** Provider and model failures throw `LLMError` (mapped to 502 with a message). Never let a bare 500 be the only signal.

## How to work

- **Test first.** Write the failing tests, run them, and confirm they fail for the right reason. Then implement until they pass. Don't weaken, skip or delete an existing test to get green. If you believe a test is wrong, say so in your report.
- **One branch per task,** named after it (e.g. `feat/abuse-protection`). Commit there. Don't push, merge, rebase shared branches, or force anything.
- **Stay in scope.** Change only what the task asks, and match the surrounding style and comment density. Comments explain *why*, not *what*.
- **Line endings:** the Windows working tree is CRLF (`core.autocrlf=true`). Tests that parse file text must normalize `\r\n` to `\n` first.
- **Leave other people's work alone.** If uncommitted changes you didn't make are present, don't touch them, and mention them in your report.
- **Merging is its own job.** When you're asked to check, merge or push finished
  branches, follow `docs/integrating.md` — it's the standing procedure, not a
  one-off. Only ever on request: never merge or push on your own initiative.
- **Search, don't guess.** File paths and line numbers in prompts can drift. If an anchor isn't where the prompt says, find it with a search before editing, and never guess at an import path.

## Verify before you say you're done

Run all of these and paste the output in your report:

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

## Report

- What changed, file by file.
- Test output: the failing run before you implemented, and the passing run after.
- **Anything you couldn't verify** (live websites, production, store behaviour, real payments). Say so plainly, and never claim a manual check you didn't do.
