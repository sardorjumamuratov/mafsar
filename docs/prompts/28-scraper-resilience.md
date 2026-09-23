# 28 — Two extractors are scraping markup nobody has checked

**Depends on:** 07 (YouTube capture). **Branch:** `fix/scraper-resilience`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## The problem

Two places read someone else's DOM, and both say so in their own source:

- `extractYouTubeTranscript` in `src/background/service-worker.js` —
  "⚠ UNVERIFIED: these selectors were not checked against the live site".
  It reads `ytd-transcript-segment-renderer`, `.segment-timestamp`,
  `.segment-text`, and clicks a button found by
  `ytd-video-description-transcript-section-renderer button`.
- The AI Studio adapter, `src/content/adapters/aistudio.js` — "⚠ UNVERIFIED:
  the `<ms-chat-turn>` / `[data-turn-role]` selectors below were" not checked.

YouTube and Google ship markup changes whenever they like. When a selector goes
stale the feature doesn't error — it finds nothing and tells the learner their
video "has no transcript", which is a lie they can't act on.

## What must be true when you're done

1. **Both extractors are verified against the live sites**, and the ⚠ notes are
   removed only for what you actually checked. If you can't reach a site, say so
   and leave its note in place — do not delete a warning you didn't earn.
2. **Drift is survivable.** A single renamed class shouldn't take the feature
   out. More than one way to find each thing, in a stated order, with the reason
   for the fallback next to it.
3. **Failure is honest.** "No transcript" must mean the video genuinely has
   none. When the page has a transcript but we couldn't read it, the learner is
   told something different, and the difference is visible to us — it's the
   signal that YouTube changed something. Decide how that surfaces.
4. **Tests run off saved markup, not the network.** Save real HTML for each
   case you check — transcript open, transcript collapsed, no transcript at all;
   an AI Studio conversation with both roles — as fixtures under `tests/`, and
   parse them in a test. Keep them small: the fragment that matters, not a 3 MB
   page dump. Say where each fixture came from and when.
5. **The extractors stay self-contained.** `extractYouTubeTranscript` is
   serialised by `chrome.scripting.executeScript`, so it cannot reference
   anything outside itself; content scripts can't `import` (AGENTS.md rule 3).
   Test the parsing logic without changing that.

## Definition of done

- Fixture-driven tests for both extractors, covering success and each failure.
- Any ⚠ note still present is one you couldn't verify, and your report says why.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
```

Then by hand, with `dist/chrome` loaded unpacked:
1. a lecture with manual captions;
2. a video with auto-generated captions only;
3. a video with no captions at all;
4. a Google AI Studio conversation, captured.

## Report

- **What the live markup actually was** for each selector you checked, and the
  date you checked it.
- **Which of the four manual checks you ran**, and which you couldn't.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
