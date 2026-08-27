let timer = null;
const listeners = new Set();

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
    chrome.tabs.onActivated.addListener(schedule);
  }

  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!tab.active) return;
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

