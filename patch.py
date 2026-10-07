
import os

with open("src/ui/views/set-detail.js", "r", encoding="utf-8") as f:
    code = f.read()

if "import { getDefaultPracticeStyle" not in code:
    code = code.replace(
        "import { setExamDate } from \"../../storage/sets.js\";",
        "import { setExamDate } from \"../../storage/sets.js\";\nimport { getDefaultPracticeStyle, STYLES } from \"../../storage/practice-style.js\";"
    )

if "practiceStyle: null" not in code:
    code = code.replace(
        "studyMenuOpen: false,",
        "studyMenuOpen: false,\n  practiceStyle: null,"
    )

if "await getDefaultPracticeStyle()" not in code:
    code = code.replace(
        "export async function paintDetail(updateInPlace = false, force = false) {",
        "export async function paintDetail(updateInPlace = false, force = false) {\n    if (!state.practiceStyle) state.practiceStyle = await getDefaultPracticeStyle();"
    )

code = code.replace(
    "Mode: <span style=\"color:var(--text-secondary);font-weight:600\">${esc(cta.name)}</span></div>",
    "Mode: <span style=\"color:var(--text-secondary);font-weight:600\">${esc(cta.name)}</span></div>\n        ${[\"design\", \"estimation\", \"bottleneck\"].includes(cta.mode) ? `<button type=\"button\" data-action=\"edit-practice-style\" style=\"background:transparent;border:none;padding:0;color:var(--text-secondary);font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:2px\">Style: ${state.practiceStyle === STYLES.GUIDED ? \"Learn concepts\" : \"Interview simulation\"} ${I.chevron(14, \"currentColor\")}</button>` : \"\"}"
)

with open("src/ui/views/set-detail.js", "w", encoding="utf-8") as f:
    f.write(code)

