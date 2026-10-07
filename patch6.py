
import os

with open("src/ui/panel.js", "r", encoding="utf-8") as f:
    code = f.read()

handler = """    case "you-practice-style": {
      const { STYLES, getDefaultPracticeStyle, setDefaultPracticeStyle } = await import("../storage/practice-style.js");
      const current = await getDefaultPracticeStyle();
      const isGuided = current === STYLES.GUIDED;
      openSheet("Practice style", `
        <div style="display:flex;flex-direction:column;gap:12px;padding:8px 16px 24px">
          <button type="button" data-action="set-you-practice-style" data-style="${STYLES.GUIDED}" class="opt-row ${isGuided ? "selected" : ""}" style="text-align:left;height:auto;padding:12px 14px">
            <span style="display:flex;flex-direction:column;gap:2px">
              <span style="font-weight:600;font-size:15px">Learn concepts</span>
              <span style="font-size:13px;color:var(--text-muted)">Step-by-step guidance and hints. Best for learning a new system.</span>
            </span>
          </button>
          <button type="button" data-action="set-you-practice-style" data-style="${STYLES.SIMULATION}" class="opt-row ${!isGuided ? "selected" : ""}" style="text-align:left;height:auto;padding:12px 14px">
            <span style="display:flex;flex-direction:column;gap:2px">
              <span style="font-weight:600;font-size:15px">Interview simulation</span>
              <span style="font-size:13px;color:var(--text-muted)">Blank canvas, elapsed timer, strict grading. No hints.</span>
            </span>
          </button>
        </div>
      `, false, null, { px: 0, pb: 0 });
      break;
    }
    case "set-you-practice-style": {
      const { setDefaultPracticeStyle } = await import("../storage/practice-style.js");
      await setDefaultPracticeStyle(t.getAttribute("data-style"));
      closeSheet();
      you();
      break;
    }"""

if "case \"you-practice-style\":" not in code:
    code = code.replace(
        "case \"you-signin\": renderAuthGate(); break;",
        "case \"you-signin\": renderAuthGate(); break;\n" + handler
    )

with open("src/ui/panel.js", "w", encoding="utf-8") as f:
    f.write(code)

