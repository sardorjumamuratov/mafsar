// Content script for quizlet.com set pages. Injects an "Import to Mafsar" button
// that reads the set in three steps:
//   1. Quizlet's embedded JSON (__NEXT_DATA__) — exact, instant
//   2. A best-effort DOM scrape of the terms list
//   3. AI fallback: send the page text to the backend and let the LLM build the
//      study set (same path as universal capture — survives any DOM change)
// Written as pure ASCII (escapes for symbols) to avoid encoding corruption.
(function () {
  const BTN_ID = "mafsar-import-btn";

  // --- extraction ---
  function sideText(n) {
    if (!n) return "";
    if (Array.isArray(n)) return n.map(sideText).filter((t) => t && t.plainText).map((t) => t.plainText).join(" ");
    if (typeof n === "object" && n !== null) {
      if (typeof n.plainText === "string") return n.plainText;
      if (typeof n.text === "string") return n.text;
    }
    return "";
  }

  // Recursively walk any object looking for card-shaped data. Covers the two
  // shapes Quizlet has used: {word, definition} and {cardSides:[{label,media}]}.
  function walk(node, out, seen) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (typeof node.word === "string" && typeof node.definition === "string") {
      const front = node.word.trim();
      if (front) out.push({ front, back: node.definition.trim() });
    }
    if (Array.isArray(node.cardSides)) {
      const w = node.cardSides.find((s) => (s.label || "").toLowerCase() === "word");
      const d = node.cardSides.find((s) => (s.label || "").toLowerCase() === "definition");
      const front = sideText(w);
      if (front) out.push({ front, back: sideText(d) });
    }
    for (const k in node) walk(node[k], out, seen);
  }

  function dedupe(cards) {
    const seen = new Set();
    const out = [];
    for (const c of cards) {
      const key = c.front + "\u0000" + c.back; // escaped — a raw NUL byte here previously corrupted the file encoding
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  function fromEmbeddedJson() {
    const el = document.getElementById("__NEXT_DATA__");
    if (!el) return [];
    let data;
    try {
      data = JSON.parse(el.textContent);
    } catch {
      return [];
    }
    const out = [];
    walk(data, out, new WeakSet());
    return dedupe(out);
  }

  function fromDom() {
    const out = [];
    // Quizlet's class names are obfuscated and change; match on the stable-ish
    // term containers, then any two short text cells per row.
    document
      .querySelectorAll(
        '[class*="SetPageTerm-content"], [data-testid="set-page-term"], [class*="TermContent"]'
      )
      .forEach((row) => {
        const cells = row.querySelectorAll('[class*="TermText"], [class*="text"], [lang]');
        if (cells.length >= 2) {
          const front = ((/** @type {any} */ (cells[0])).innerText || "").trim();
          const back = ((/** @type {any} */ (cells[1])).innerText || "").trim();
          if (front) out.push({ front, back });
        }
      });
    return dedupe(out);
  }

  /** AI fallback source: visible page text (same idea as universal capture). */
  function pageText() {
    const el = document.querySelector("main, article") || document.body;
    return (el ? (/** @type {any} */ (el)).innerText : "").trim().slice(0, 24000);
  }

  function getTitle() {
    const h1 = document.querySelector("h1");
    const t = h1 ? h1.innerText.trim() : "";
    return t || (document.title || "Quizlet set").replace(/\s*[|\u2013-]\s*Quizlet\s*$/i, "").trim();
  }

  // --- button ---
  function flash(button, text, ok = true) {
    const origin = button.dataset.label;
    button.textContent = text;
    button.classList.toggle("mafsar-err", !ok);
    setTimeout(() => {
      button.textContent = origin;
      button.classList.remove("mafsar-err");
    }, 2600);
  }

  function importExact(button, cards) {
    button.textContent = "Importing\u2026";
    chrome.runtime.sendMessage(
      {
        type: "IMPORT_CARDS",
        title: getTitle(),
        url: location.href,
        source: "quizlet",
        sourceLabel: "Quizlet",
        cards,
      },
      (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          flash(button, "\u26a0 Import failed", false);
          return;
        }
        flash(button, "\u2713 Imported " + resp.count);
      }
    );
  }

  function importViaAI(button) {
    const text = pageText();
    if (text.length < 200) {
      flash(button, "\u26a0 No cards found", false);
      return;
    }
    button.textContent = "Generating\u2026";
    chrome.runtime.sendMessage(
      {
        type: "SAVE_AND_GENERATE",
        payload: {
          title: getTitle(),
          url: location.href,
          source: "quizlet",
          sourceLabel: "Quizlet",
          capturedAt: Date.now(),
          messages: [{ role: "user", text }],
        },
      },
      (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          flash(button, "\u26a0 " + ((resp && resp.error) || "failed"), false);
          return;
        }
        if (resp.generated) flash(button, "\u2713 Generated " + resp.cards + " cards");
        else flash(button, "\u26a0 Sign in to Mafsar first", false);
      }
    );
  }

  function onClick(e) {
    const button = e.currentTarget;
    const cards = dedupe(fromEmbeddedJson().concat(fromDom()));
    if (cards.length >= 3) return importExact(button, cards);
    // Scraping came up empty (Quizlet changed the page, or the set is
    // paywalled/logged-in) — let the backend LLM extract the set from page text.
    importViaAI(button);
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;
    // Only show on a set page — the presence of a terms list or set title is
    // a good-enough signal.
    const looksLikeSet =
      document.getElementById("__NEXT_DATA__") ||
      document.querySelector("h1") ||
      document.querySelector('[class*="SetPageTerm"], [class*="TermContent"]');
    if (!looksLikeSet) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.dataset.label = "\u21ea Import to Mafsar";
    btn.textContent = btn.dataset.label;
    btn.title = "Import this Quizlet set into Mafsar as a study set";
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
  }

  injectButton();
  const mo = new MutationObserver(() => injectButton());
  mo.observe(document.body, { childList: true, subtree: true });
})();
