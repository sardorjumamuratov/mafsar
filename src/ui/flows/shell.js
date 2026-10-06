import { esc } from "../core.js";

export function paintShell({ mode, prompt, progress, counter, body, dock, promptClass = "prompt-short" }) {
  // We use inline styles that map to the requirements, but some things rely on global CSS.
  // Assuming panel.css already has some of the variables, but we'll inline what we must
  // or define them in panel.css later.
  return `
    <div style="background:var(--bg);display:flex;flex-direction:column;height:100%">
      <div style="height:56px;display:flex;align-items:center;gap:12px;padding:0 16px 0 8px;flex-shrink:0">
        <button data-action="return-focus" aria-label="End session" style="width:40px;height:40px;border-radius:12px;background:transparent;border:none;color:var(--secondary);display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer">
          <svg style="width:20px;height:20px;stroke-width:2;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div style="flex:1;height:4px;border-radius:2px;background:var(--border-card);overflow:hidden">
          <div style="height:100%;background:var(--accent);width:${Math.max(0, Math.min(100, progress))}%"></div>
        </div>
        <div style="min-width:44px;text-align:right;font-size:13px;font-weight:600;color:var(--secondary);font-variant-numeric:tabular-nums">${esc(counter)}</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column">
        <div style="font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)">${esc(mode)}</div>
        ${prompt ? `<div class="prompt ${promptClass}" style="margin-top:12px;font-weight:650;letter-spacing:-0.02em;text-wrap:pretty">${esc(prompt)}</div>` : ''}
        ${body}
      </div>
      <div style="flex-shrink:0;padding:12px 16px 24px;border-top:1px solid var(--divider);display:flex;gap:8px">
        ${dock}
      </div>
    </div>
  `;
}
