
import os

with open("src/ui/views/set-detail.js", "r", encoding="utf-8") as f:
    code = f.read()

func = """
export function openPracticeStyleEditor() {
  const isGuided = state.practiceStyle === STYLES.GUIDED;
  openSheet("Practice style", `
    <div style="display:flex;flex-direction:column;gap:12px;padding:8px 16px 24px">
      <button type="button" data-action="set-practice-style" data-style="${STYLES.GUIDED}" class="opt-row ${isGuided ? "selected" : ""}" style="text-align:left;height:auto;padding:12px 14px">
        <span style="display:flex;flex-direction:column;gap:2px">
          <span style="font-weight:600;font-size:15px">Learn concepts</span>
          <span style="font-size:13px;color:var(--text-muted)">Step-by-step guidance and hints. Best for learning a new system.</span>
        </span>
      </button>
      <button type="button" data-action="set-practice-style" data-style="${STYLES.SIMULATION}" class="opt-row ${!isGuided ? "selected" : ""}" style="text-align:left;height:auto;padding:12px 14px">
        <span style="display:flex;flex-direction:column;gap:2px">
          <span style="font-weight:600;font-size:15px">Interview simulation</span>
          <span style="font-size:13px;color:var(--text-muted)">Blank canvas, elapsed timer, strict grading. No hints.</span>
        </span>
      </button>
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-top:8px;cursor:pointer">
        <input type="checkbox" id="practice-style-default" style="width:16px;height:16px" />
        Make this my default
      </label>
    </div>
  `, false, null, { px: 0, pb: 0 });
}
"""

if "export function openPracticeStyleEditor" not in code:
    code += "\n" + func

with open("src/ui/views/set-detail.js", "w", encoding="utf-8") as f:
    f.write(code)

