
import os

with open("src/ui/views/set-detail.js", "r", encoding="utf-8") as f:
    code = f.read()

func = """
export function openFirstRunSheet(nextAction, id) {
  openSheet("What are you practicing for?", `
    <div style="display:flex;flex-direction:column;gap:12px;padding:8px 16px 24px">
      <button type="button" data-action="set-first-run-style" data-style="${STYLES.GUIDED}" data-next="${nextAction}" data-id="${esc(id)}" class="opt-row" style="text-align:left;height:auto;padding:12px 14px">
        <span style="display:flex;flex-direction:column;gap:2px">
          <span style="font-weight:600;font-size:15px">Learn concepts</span>
          <span style="font-size:13px;color:var(--text-muted)">Get guidance, optional hints, and feedback as you go.</span>
        </span>
      </button>
      <button type="button" data-action="set-first-run-style" data-style="${STYLES.SIMULATION}" data-next="${nextAction}" data-id="${esc(id)}" class="opt-row" style="text-align:left;height:auto;padding:12px 14px">
        <span style="display:flex;flex-direction:column;gap:2px">
          <span style="font-weight:600;font-size:15px">Interview simulation</span>
          <span style="font-size:13px;color:var(--text-muted)">Blank canvas, elapsed timer, strict grading. No hints.</span>
        </span>
      </button>
    </div>
  `, false, null, { px: 0, pb: 0 });
}
"""

if "export function openFirstRunSheet" not in code:
    code += "\n" + func

with open("src/ui/views/set-detail.js", "w", encoding="utf-8") as f:
    f.write(code)

