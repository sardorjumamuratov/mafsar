import { setHTML, app, esc } from "../core.js";
import { PrimaryButton } from "../components.js";
import { setNav } from "../nav.js";

export function renderDiscover() {
  setNav("discover");
  setHTML(app, `
    <div style="padding: 16px;">
      <h1 style="font-size:24px; font-weight:650; letter-spacing:-0.02em;">Discover</h1>
      <div style="font-size:13px; color:var(--text-muted); margin-bottom: 20px;">Sets shared by other learners, picked for you</div>
      <div style="font-size:14px; color:var(--text-muted); text-align:center;">Shared sets are on their way.</div>
    </div>
  `);
}

export function renderStats() {
  setNav("stats");
  setHTML(app, `
    <div style="padding: 16px;">
      <h1 style="font-size:24px; font-weight:650; letter-spacing:-0.02em;">Stats</h1>
      <div style="font-size:13px; color:var(--text-muted); margin-bottom: 20px;">Your learning progress</div>
      <div style="margin-bottom: 20px;">Start reviewing to see your stats here.</div>
      ${PrimaryButton("Start review", "", false)}
    </div>
  `);
}
