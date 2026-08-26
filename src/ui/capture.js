import { queryActiveTab, send, sendToTab, toast } from "./core.js";
import { renderHome } from "./views/home.js";

// ================================================================ capture current tab
export async function captureCurrent() {
  toast("Capturing…");
  const tab = await queryActiveTab();
  if (!tab?.id) return toast("Open a page to capture first.");
  // Try the site adapter first (clean capture on AI-chat sites)…
  const resp = await sendToTab(tab.id, { type: "CAPTURE_ACTIVE" });
  let r;
  try {
    if (resp?.ok) {
      r = await send({ type: "SAVE_AND_GENERATE", payload: resp.session });
    } else {
      // …otherwise fall back to universal page-text capture on any site.
      r = await send({ type: "CAPTURE_UNIVERSAL" });
    }
    if (r.generated) toast(`${r.cards} flashcards ready`);
    else toast("Saved, but we couldn\'t make flashcards. Open the set to try again.");
    renderHome();
  } catch (e) {
    toast(e.message);
  }
}

/** Keep the toast readable — the set itself carries the full title. */
function shortTitle(title, max = 40) {
  const s = String(title || "Saved answer");
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

// ================================================================ capture last answer
export async function captureLastAnswer() {
  const tab = await queryActiveTab();
  if (!tab?.id) return toast("Open an AI chat to capture from.");

  // The content script does the extraction and every refusal check, so a
  // rejection here costs nothing — no request has been made yet.
  const resp = await sendToTab(tab.id, { type: "CAPTURE_LAST_ANSWER" });
  if (!resp) return toast("Open a ChatGPT, Claude, or Gemini tab first.");
  if (!resp.ok) return toast(resp.error || "Nothing to capture.");

  // Deliberately no CAPTURE_UNIVERSAL fallback: quietly saving the whole page
  // when the user asked for one answer gives them the opposite of what they
  // clicked, and bills them a generation for it.
  toast("Capturing…");
  try {
    const r = await send({ type: "SAVE_AND_GENERATE", payload: resp.session });
    // Two capture buttons sit side by side, so naming what was saved is what
    // makes either of them trustworthy.
    const name = shortTitle(resp.session.title);
    if (r.generated) toast(`Saved “${name}” · ${r.cards} cards`);
    else toast(`Saved “${name}”, but we couldn\'t make flashcards.`);
    renderHome();
  } catch (e) {
    toast(e.message);
  }
}
