// Pulls the last AI answer (plus the question that produced it) out of a
// captured message list.
//
// Written as a *classic* script rather than an ES module on purpose: this runs
// inside the content script, and MV3 content scripts can't use import. It
// attaches to a global the same way src/content/adapters/adapter.js does, and
// tests load it by evaluating the file (see tests/last-answer.test.mjs).
//
// Everything here is pure — no DOM, no chrome.* — so the extraction rules stay
// testable under plain node while the DOM reading stays in the site adapters.
(function (root) {
  "use strict";

  /**
   * Below this, an answer can't produce usable cards ("Yes, exactly."), and a
   * capture would still spend one of the free plan's 3 monthly set generations
   * (server/src/billing/core.ts, PLANS.free). Cheaper to refuse locally.
   */
  const MIN_ANSWER_CHARS = 200;
  const MAX_TITLE_CHARS = 80;

  /**
   * Whole lines that are site UI, not answer text — innerText picks these up
   * from the controls attached to code blocks. Matched only as a complete line:
   * "Copy" mid-sentence is real prose and must survive.
   */
  const CHROME_LINES = new Set(["copy", "copy code", "copy to clipboard", "edit"]);

  /** @param {string} s */
  function collapse(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  /**
   * Strip UI chrome innerText drags in from code blocks. Deliberately timid:
   * eating real content is far worse than leaving a stray "Copy code" behind,
   * so this only drops exact whole-line matches and never touches code itself.
   * @param {string} text
   * @returns {string}
   */
  function cleanAnswerText(text) {
    const lines = String(text == null ? "" : text).split(/\r?\n/);
    const kept = [];
    for (const line of lines) {
      if (CHROME_LINES.has(line.trim().toLowerCase())) continue;
      kept.push(line);
    }
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  /**
   * First sentence of an answer, used only when there's no question to title by.
   * @param {string} text
   */
  function firstSentence(text) {
    const flat = collapse(text);
    const m = flat.match(/^(.{20,}?[.!?])(?:\s|$)/);
    return m ? m[1] : flat;
  }

  /**
   * @param {string} s
   * @returns {string}
   */
  function capTitle(s) {
    const flat = collapse(s);
    if (flat.length <= MAX_TITLE_CHARS) return flat;
    const cut = flat.slice(0, MAX_TITLE_CHARS);
    const space = cut.lastIndexOf(" ");
    const body = space > 20 ? cut.slice(0, space) : cut;
    return body.replace(/[\s,;:.\-—]+$/, "") + "…";
  }

  /**
   * The question is the natural label for the answer it produced; fall back to
   * the answer's opening sentence when the thread starts with the assistant.
   * @param {string|null} question
   * @param {string} answer
   */
  function deriveTitle(question, answer) {
    return capTitle(question ? question : firstSentence(answer));
  }

  /**
   * Last assistant turn, paired with the user turn that prompted it.
   *
   * The pair matters: an answer stripped of its question loses its framing and
   * generates weaker cards, and the question is what makes a readable set title.
   *
   * @param {{role:string,text:string}[]} messages - conversation order
   * @returns {{ok:true, question:string|null, answer:string, title:string}
   *          |{ok:false, reason:"no-answer"|"too-short"}}
   */
  function extractLastAnswer(messages) {
    const list = Array.isArray(messages) ? messages : [];

    // Search backwards: the thread may end with a user message that has no
    // reply yet, so the last entry is not necessarily the last answer.
    let answerAt = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m && m.role === "assistant" && collapse(m.text)) {
        answerAt = i;
        break;
      }
    }
    if (answerAt === -1) return { ok: false, reason: "no-answer" };

    const answer = cleanAnswerText(list[answerAt].text);
    if (answer.length < MIN_ANSWER_CHARS) return { ok: false, reason: "too-short" };

    let question = null;
    for (let i = answerAt - 1; i >= 0; i--) {
      const m = list[i];
      if (m && m.role === "user" && collapse(m.text)) {
        question = collapse(m.text);
        break;
      }
    }

    return { ok: true, question, answer, title: deriveTitle(question, answer) };
  }

  /**
   * The two-message session body sent to the generator. Keeping the question in
   * `messages` (not just the title) is what gives the model the framing.
   * @param {string|null} question
   * @param {string} answer
   */
  function answerMessages(question, answer) {
    return question
      ? [{ role: "user", text: question }, { role: "assistant", text: answer }]
      : [{ role: "assistant", text: answer }];
  }

  (/** @type {any} */ (root)).__mafsarLastAnswer = {
    MIN_ANSWER_CHARS,
    MAX_TITLE_CHARS,
    cleanAnswerText,
    extractLastAnswer,
    answerMessages,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
