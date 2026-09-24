let timer = null;
const listeners = new Set();
let lastContentTabId = null;

export function isMafsarUrl(url) {
  if (!url) return false;
  try {
    const base = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("") : "";
    if (base && url.startsWith(base)) return true;
  } catch {}
  return url.includes("/src/ui/panel.html") || url.startsWith("chrome-extension://") || url.startsWith("moz-extension://");
}

export function getLastContentTabId() {
  return lastContentTabId;
}

export function setLastContentTabId(id) {
  lastContentTabId = id;
}

function emit() {
  for (const fn of listeners) fn();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    emit();
  }, 150);
}

if (typeof chrome !== "undefined") {
  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const tab = await new Promise((resolve) =>
          chrome.tabs.get(activeInfo.tabId, (t) => resolve(chrome.runtime.lastError ? null : t))
        );
        if (tab && !isMafsarUrl(tab.url)) {
          lastContentTabId = tab.id;
        }
      } catch {}
      schedule();
    });
  }

  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // tab is optional in the onUpdated signature on some engines; an
      // unguarded read throws inside the listener and kills the watcher.
      if (!tab || !tab.active) return;
      if (!isMafsarUrl(tab.url)) {
        lastContentTabId = tab.id;
      }
      if (changeInfo.url || changeInfo.status === "complete") {
        schedule();
      }
    });
  }

  if (chrome.windows && chrome.windows.onFocusChanged) {
    chrome.windows.onFocusChanged.addListener(schedule);
  }
}

export function onActiveTabChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
