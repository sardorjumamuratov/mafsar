
import os

with open("src/ui/panel.js", "r", encoding="utf-8") as f:
    code = f.read()

if "import { openPracticeStyleEditor, applyPracticeStyle" not in code:
    code = code.replace(
        "import { setDetail, renderSetDetail, makeSet, saveNewCard, saveCardEdit, isEditing, confirmLeaveEdit, promptAddCard, openSetExamEditor, generateSummary } from \"./views/set-detail.js\";",
        "import { setDetail, renderSetDetail, makeSet, saveNewCard, saveCardEdit, isEditing, confirmLeaveEdit, promptAddCard, openSetExamEditor, generateSummary, openPracticeStyleEditor, applyPracticeStyle } from \"./views/set-detail.js\";"
    )

if "case \"edit-practice-style\":" not in code:
    code = code.replace(
        "case \"exam-edit-set\": openSetExamEditor(); break;",
        "case \"exam-edit-set\": openSetExamEditor(); break;\n    case \"edit-practice-style\": openPracticeStyleEditor(); break;\n    case \"set-practice-style\":\n      applyPracticeStyle(t.getAttribute(\"data-style\"), document.getElementById(\"practice-style-default\")?.checked);\n      break;"
    )

with open("src/ui/panel.js", "w", encoding="utf-8") as f:
    f.write(code)

