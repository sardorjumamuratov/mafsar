---
description: Review, test, merge and push the finished branches (docs/integrating.md)
argument-hint: "[branch names, or blank for every unmerged branch]"
---

Integrate finished work into `main`, following `docs/integrating.md` in full.

Scope: $ARGUMENTS — if that's empty, every branch `git branch --no-merged main`
reports, in the order the procedure's §1 tells you.

Hold to these in particular:

- The author's report is a claim. Re-run every suite yourself, and check any
  quoted test count against the real size of the suite.
- Delete scratch files, grep the diff for secrets, and check for mixed line
  endings before reading the code.
- Fix what you find in your own commits on top; never rewrite the author's.
- Never weaken or delete a test to get green.
- Push nothing unless every check in §6 passes, then prove the end state with
  the three commands in §7.
- Don't bump the version.

Finish with the report in §8: what each branch was, what was actually wrong
(file and line), what you changed on top, and what remains unverified.
