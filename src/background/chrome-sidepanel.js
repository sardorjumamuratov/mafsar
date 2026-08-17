// Chrome-only side panel wiring.
//
// This module is deliberately excluded from the Firefox package (see
// tools/build.mjs): chrome.sidePanel has no Gecko equivalent, and Firefox
// drives the same UI through sidebar_action instead — service-worker.js
// registers that toggle separately.

/** Make a click on the toolbar icon open the side panel. */
export function openPanelOnActionClick() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
