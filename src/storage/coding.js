// Coding-mode submission sizing.
//
// Two different jobs, deliberately separated:
//   - the CAP is a system limit (token cost, and grading quality degrades on a
//     wall of code). Hitting it blocks submission, with a stated reason.
//   - the TARGET is pedagogy. Going over it never blocks — it is passed to the
//     grader so verbosity becomes feedback ("68 lines for a 15-line task")
//     rather than a rejected-but-correct answer.
//
// Characters, not lines, for the cap: formatting-independent, and it is what
// actually maps to tokens. A line cap would be wrong across languages, since
// Java needs roughly 3x the lines of Python for the same idea.

/** Must match `MAX_CODE_CHARS` in server/src/llm.ts and the bound in schema.ts. */
export const MAX_CODE_CHARS = 4000;

/**
 * Non-blank, non-comment-only lines. Mirrors `codeLineCount` on the server so
 * the counter the user sees matches the number the grader is given.
 */
export function codeLineCount(code) {
  return String(code || "")
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return t && !/^(\/\/|#|--|\/\*|\*\/|\*)/.test(t);
    }).length;
}

/**
 * Size a submission for the editor's live counter.
 * @param {string} code
 * @param {number} expectedLines target from the task
 * @returns {{chars:number, lines:number, cap:number, overCap:boolean, remaining:number,
 *            expected:number, ratio:number, verbose:boolean, empty:boolean}}
 */
export function codeSize(code, expectedLines = 15) {
  const text = String(code || "");
  const chars = text.length;
  const lines = codeLineCount(text);
  const expected = Math.max(1, Number(expectedLines) || 15);
  return {
    chars,
    lines,
    cap: MAX_CODE_CHARS,
    overCap: chars > MAX_CODE_CHARS,
    remaining: MAX_CODE_CHARS - chars,
    expected,
    ratio: lines / expected,
    // Advisory only — shown as a hint, never used to disable the button.
    verbose: lines > expected * 2,
    empty: text.trim().length === 0,
  };
}
