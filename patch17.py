# coding: utf-8
import os

with open("src/ui/panel.js", "r", encoding="utf-8") as f:
    code = f.read()

if "openPracticeStyleEditor" not in code.split("import {")[0]:
    code = code.replace(
        "import { confirmLeaveEdit",
        "import { confirmLeaveEdit, openPracticeStyleEditor, applyPracticeStyle, openFirstRunSheet"
    )

with open("src/ui/panel.js", "w", encoding="utf-8") as f:
    f.write(code)

with open("src/ui/views/set-detail.js", "r", encoding="utf-8") as f:
    code = f.read()

if "practice-style.js" not in code.split("const byId")[0]:
    code = code.replace(
        "import { addCard, updateCard, updateStudySet, setExamDate, saveSettings } from \"../../storage/store.js\";",
        "import { addCard, updateCard, updateStudySet, setExamDate, saveSettings } from \"../../storage/store.js\";\nimport { getDefaultPracticeStyle, STYLES } from \"../../storage/practice-style.js\";"
    )

with open("src/ui/views/set-detail.js", "w", encoding="utf-8") as f:
    f.write(code)

with open("src/ui/views/you.js", "r", encoding="utf-8") as f:
    code = f.read()

if "practice-style.js" not in code.split("export async function")[0]:
    code = code.replace(
        "import { setHTML } from \"../core.js\";",
        "import { setHTML } from \"../core.js\";\nimport { getDefaultPracticeStyle, STYLES } from \"../../storage/practice-style.js\";"
    )

with open("src/ui/views/you.js", "w", encoding="utf-8") as f:
    f.write(code)

