import { nav } from "./core.js";
import { detail } from "./views/set-detail.js";

export let activeTab = "home";
export function showChrome(visible) {
  nav.classList.toggle("hidden", !visible);
}
export function setNav(tab) {
  activeTab = tab;
  nav.querySelectorAll("button[data-nav]").forEach((b) => b.classList.toggle("on", (/** @type {any} */ (b)).dataset.nav === tab));
}
/** Back-button target for focus views (set detail, exam picker, import): return to whichever bottom-nav tab was active before entering. */
let registry = {};
export function registerTabs(r) { registry = r; }
/** Back-button target for focus views (set detail, exam picker, import): return to whichever bottom-nav tab was active before entering. */
export function goToActiveTab() {
  (registry[activeTab] || registry.home)();
}