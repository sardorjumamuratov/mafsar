# coding: utf-8
import os

with open("src/ui/flows/shell.js", "r", encoding="utf-8") as f:
    code = f.read()

func = """
export function feedbackSummary({ strongest, gap, scoreLine }) {
  let html = `<div style="display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:14px;background:var(--bg-surface);border:1px solid var(--border-control)">`;
  if (scoreLine) html += `<div style="font-size:15px;font-weight:650;color:var(--text-primary);border-bottom:1px solid var(--border-control);padding-bottom:12px;margin-bottom:4px">${esc(scoreLine)}</div>`;
  if (strongest) {
    html += `<div style="display:flex;gap:10px">
      <span style="color:var(--status-mastered);margin-top:2px">${icon("check", 16, 2.5)}</span>
      <span style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:13px;font-weight:650;text-transform:uppercase;letter-spacing:0.04em;color:var(--status-mastered)">Strongest part</span>
        <span style="font-size:14px;color:var(--text-primary);line-height:1.4">${esc(strongest)}</span>
      </span>
    </div>`;
  }
  if (gap) {
    html += `<div style="display:flex;gap:10px">
      <span style="color:var(--status-learning);margin-top:2px">${icon("arrow-up", 16, 2.5)}</span>
      <span style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:13px;font-weight:650;text-transform:uppercase;letter-spacing:0.04em;color:var(--status-learning)">Highest leverage gap</span>
        <span style="font-size:14px;color:var(--text-primary);line-height:1.4">${esc(gap)}</span>
      </span>
    </div>`;
  }
  html += `</div>`;
  return html;
}
"""

if "export function feedbackSummary" not in code:
    code += "\n" + func

with open("src/ui/flows/shell.js", "w", encoding="utf-8") as f:
    f.write(code)

