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
  toast("Capturing…");
  try {
    const r = await send({ type: "CAPTURE_LAST_ANSWER_SMART" });
    const name = shortTitle(r.title);
    if (r.generated) toast(`Saved “${name}” · ${r.cards} cards`);
    else toast(`Saved “${name}”, but we couldn't make flashcards.`);
    renderHome();
  } catch (e) {
    toast(e.message);
  }
}
