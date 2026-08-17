# Build prompt — Universal "Save to Mafsar" (capture any page/chat via AI)

Goal: let users capture **any** page or chat — not just ChatGPT/Claude/Gemini —
by grabbing the page text (or their selection) and letting the LLM extract the
learnable content into flashcards + a quiz. Hand the section below to GLM.

> Approach in one line: specialized DOM adapters stay for the big AI sites (clean
> capture); for everywhere else, extract raw text on demand and let AI do the rest.

---

You are extending the **Mafsar** MV3 browser extension (Chrome + Firefox, vanilla
JS ES modules, no build step). Today, "Save to Mafsar" only works on chatgpt.com,
claude.ai, gemini.google.com (via per-site content-script adapters in
`src/content/adapters/`). Add **universal capture** that works on any website,
using AI to turn arbitrary page text into a study set. Keep the existing adapters
and floating button on those three sites unchanged. Match the existing code style,
cross-browser `chrome.*` callback usage, and the teal design system.

## How capture currently flows (reuse this)
- Content script sends a `session` to the service worker via `SAVE_AND_GENERATE`.
- `session = { source, sourceLabel, title, url, capturedAt, messages:[{role,text}] }`.
- The worker calls `generateStudySet(settings, session)` in `src/llm/generate.js`,
  which turns `messages` into a transcript and asks the LLM for `{flashcards, quiz}`.
- So: **universal capture just needs to produce a `session` from any page's text.**

## What to build

### 1. On-demand text extraction (works on any tab)
Add a function that runs in the active tab via `chrome.scripting.executeScript`
(no persistent content script, no `<all_urls>` — uses `activeTab` granted on a user
gesture). It extracts the best available text:
```js
function extractPage() {
  const sel = (window.getSelection && window.getSelection().toString().trim()) || "";
  let text = sel;
  if (text.length < 40) {                        // no meaningful selection → main content
    const el = document.querySelector("main, article") || document.body;
    text = (el.innerText || "").trim();
  }
  return { title: document.title || location.hostname, url: location.href, text: text.slice(0, 24000) };
}
```
Build the session from it:
```js
session = {
  source: "web",
  sourceLabel: new URL(url).hostname.replace(/^www\./, ""),
  title, url, capturedAt: Date.now(),
  messages: [{ role: "user", text }],
};
```
Then hand it to the existing `SAVE_AND_GENERATE` worker message (unchanged).

### 2. Right-click context menu (primary universal entry point — most reliable)
In the service worker, register `chrome.contextMenus` items (add the
`"contextMenus"` permission to `manifest.json`):
- **"Save page to Mafsar"** (context: `page`)
- **"Save selection to Mafsar"** (context: `selection`)

On click: `chrome.scripting.executeScript({ target:{tabId}, func: extractPage })`,
build the session, send `SAVE_AND_GENERATE`, and show a `chrome.notifications`
toast ("Saved · N cards" / "Saved — add an API key"). The context-menu click is a
user gesture, so `activeTab` grants access to that tab without broad host permissions.

### 3. Panel "Capture current chat" → works on any site
Make the panel's existing capture button universal: first try the site adapter
(send `CAPTURE_ACTIVE` to the tab's content script); if there's no content script
(non-AI site → no response), fall back to `chrome.scripting.executeScript` with
`extractPage` on the active tab, build the session, and `SAVE_AND_GENERATE`.
Rename the button to **"Capture this page"**.

### 4. Let the LLM handle non-conversation content
In `src/llm/generate.js`, relax the system prompt so it accepts **any learning
source** — an AI chat transcript, an article, docs, or pasted notes — and extracts
the durable, factual knowledge into flashcards + quiz. Keep the existing grounding
rule: use only the provided text; never invent facts. (No structural change to the
request/response shape.)

### 5. Graceful failures
- On restricted pages (`chrome://`, `about:`, the web store, PDF viewer,
  `view-source:`) `executeScript` throws — catch it and toast:
  "Can't capture this page — try a normal web page."
- If extracted `text` is too short (< ~200 chars), toast "Not enough text to capture."

## Permissions
- Add `"contextMenus"` to `permissions`. `scripting` and `activeTab` are already present.
- **Do not add `<all_urls>` host permissions** — rely on `activeTab` + user gestures
  (context menu / toolbar / panel). If the panel button can't get `activeTab` in some
  case, request `optional_host_permissions: ["<all_urls>"]` on demand instead of a
  blanket grant.

## Cross-browser
- `chrome.contextMenus`, `chrome.scripting.executeScript`, and `chrome.notifications`
  all work in Chrome and Firefox (128+). Keep callback style.

## Acceptance criteria
- On a random article/blog: right-click → **Save page to Mafsar** → a study set is
  generated from the article.
- Select a paragraph on any site → right-click → **Save selection to Mafsar** → cards
  from just that selection.
- On chatgpt.com the existing floating button + adapters still work (no regression).
- On a `chrome://` page, capture fails with a clear toast, not a silent error.
- Captured web sets show their site as the source label and sync like any other set.

Build order: (1) `extractPage` + wire into the panel button fallback, (2) context
menu, (3) prompt tweak, (4) failure handling.
