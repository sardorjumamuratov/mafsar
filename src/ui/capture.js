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

