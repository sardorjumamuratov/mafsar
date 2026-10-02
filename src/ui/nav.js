import { nav } from "./core.js";

export let activeTab = "home";
let focusView = false;

/**
 * Show or hide the bottom nav and capture dock. `busy` is the one record of
 * "the learner is in the middle of something", which a background repaint has
 * to respect (see inFocusView): a focus view (review, a drill, teach it back)
 * hides the chrome and is busy; Set detail shows the chrome, as the design
 * does, but is busy too, or a sync would repaint the tab over it.
 */
export function showChrome(visible, busy = !visible) {
  nav.classList.toggle("hidden", !visible);
  const dock = document.getElementById("captureDock");
  if (dock) dock.classList.toggle("hidden", !visible);
  focusView = busy;
}

/** True while a focus view is open. A sync must not repaint over one. */
export function inFocusView() {
  return focusView;
}

/** Light up a tab without making it the back target (Set detail shows Sets). */
export function highlightNav(tab) {
  nav.querySelectorAll("button[data-nav]").forEach((b) => {
    const on = (/** @type {any} */ (b)).dataset.nav === tab;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

export function setNav(tab) {
  activeTab = tab;
  highlightNav(tab);
}

let registry = {};
export function registerTabs(r) { registry = r; }
/** Back-button target for focus views (set detail, exam picker, import): return to whichever bottom-nav tab was active before entering. */
export function goToActiveTab() {
  // Returns the renderer's promise so callers can await the repaint — a
  // capture holds its "Capturing…" message until the new set is on screen.
  return (registry[activeTab] || registry.home)();
}
