
import os

with open("src/ui/panel.js", "r", encoding="utf-8") as f:
    code = f.read()

handler = """    case "start-design":
    case "start-estimation":
    case "start-bottleneck": {
      const { getDefaultPracticeStyle } = await import("../storage/practice-style.js");
      const current = await getDefaultPracticeStyle();
      if (!current) {
        const { openFirstRunSheet } = await import("./views/set-detail.js");
        openFirstRunSheet(action, id);
      } else {
        if (action === "start-design") startDesignDrill(id);
        else if (action === "start-estimation") startEstimationDrill(id);
        else if (action === "start-bottleneck") startBottleneckDrill(id);
      }
      break;
    }"""

if "case \"start-design\":" in code and "openFirstRunSheet" not in code:
    code = code.replace(
        "case \"start-design\": startDesignDrill(id); break;\n    case \"design-submit\": submitDesign(); break;",
        handler + "\n    case \"design-submit\": submitDesign(); break;"
    )
    code = code.replace("case \"start-estimation\": startEstimationDrill(id); break;\n", "")
    code = code.replace("case \"start-bottleneck\": startBottleneckDrill(id); break;\n", "")

with open("src/ui/panel.js", "w", encoding="utf-8") as f:
    f.write(code)

