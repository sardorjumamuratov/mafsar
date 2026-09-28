// Which tab a capture reads. Pure apart from the tabs API it's handed, so it's
// unit tested (tests/capture-target.test.mjs).
//
// The panel knows the answer: it can sit in the sidebar beside the page, or run
// in a tab of its own, and in that case the active tab is Mafsar itself. So the
// panel sends the tab id, and the worker only falls back to the active tab when
// a caller doesn't say.

/** A page of this extension, e.g. the panel opened as a tab. */
export function isOwnPage(url, ownOrigin) {
  return Boolean(url && ownOrigin && String(url).startsWith(ownOrigin));
}

/**
 * @param {{ tabId?: number }} msg
 * @param {{ get(id: number): Promise<any>, query(q: object): Promise<any[]> }} tabs
 * @param {string} ownOrigin chrome.runtime.getURL("")
 */
export async function resolveCaptureTab(msg, tabs, ownOrigin) {
  const tab = Number.isInteger(msg?.tabId)
    ? await tabs.get(msg.tabId)
    : (await tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id) throw new Error("No page to capture. Open the page, then try again.");
  if (isOwnPage(tab.url, ownOrigin)) {
    throw new Error("Switch to the page you want to capture, then try again.");
  }
  return tab;
}
