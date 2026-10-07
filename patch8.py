
import os

with open("src/ui/panel.js", "r", encoding="utf-8") as f:
    code = f.read()

handler = """    case "set-first-run-style": {
      const { setDefaultPracticeStyle } = await import("../storage/practice-style.js");
      await setDefaultPracticeStyle(t.getAttribute("data-style"));
      closeSheet();
      const nextAction = t.getAttribute("data-next");
      const id = t.getAttribute("data-id");
      if (nextAction === "start-design") startDesignDrill(id);
      else if (nextAction === "start-estimation") startEstimationDrill(id);
      else if (nextAction === "start-bottleneck") startBottleneckDrill(id);
      break;
    }"""

if "case \"set-first-run-style\":" not in code:
    code = code.replace(
        "case \"set-you-practice-style\":",
        handler + "\n    case \"set-you-practice-style\":"
    )

if "import { openFirstRunSheet" not in code:
    code = code.replace(
        "openPracticeStyleEditor, applyPracticeStyle",
        "openPracticeStyleEditor, applyPracticeStyle, openFirstRunSheet"
    )

with open("src/ui/panel.js", "w", encoding="utf-8") as f:
    f.write(code)

