# coding: utf-8
import os

with open("src/ui/panel.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("openFirstRunSheet(action, id);", "openFirstRunSheet(a, id);")
code = code.replace("if (action === \"start-design\") startDesignDrill(id);", "if (a === \"start-design\") startDesignDrill(id);")
code = code.replace("else if (action === \"start-estimation\") startEstimationDrill(id);", "else if (a === \"start-estimation\") startEstimationDrill(id);")
code = code.replace("else if (action === \"start-bottleneck\") startBottleneckDrill(id);", "else if (a === \"start-bottleneck\") startBottleneckDrill(id);")

code = code.replace("applyPracticeStyle(t.getAttribute(\"data-style\"), el && el.checked);", "applyPracticeStyle(t.getAttribute(\"data-style\"), el ? /** @type {HTMLInputElement} */ (el).checked : false);")

with open("src/ui/panel.js", "w", encoding="utf-8") as f:
    f.write(code)

