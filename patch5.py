
import os

with open("src/ui/views/you.js", "r", encoding="utf-8") as f:
    code = f.read()

if "import { getDefaultPracticeStyle" not in code:
    code = code.replace(
        "import { setHTML } from \"../core.js\";",
        "import { setHTML } from \"../core.js\";\nimport { getDefaultPracticeStyle, STYLES } from \"../../storage/practice-style.js\";"
    )

if "const practiceStyle =" not in code:
    code = code.replace(
        "const openInTab = !!settings.openInTab;",
        "const openInTab = !!settings.openInTab;\n  const practiceStyle = await getDefaultPracticeStyle();\n  const styleName = practiceStyle === STYLES.GUIDED ? \"Learn concepts\" : \"Interview simulation\";"
    )

if "title: \"Practice style\"" not in code:
    code = code.replace(
        "${group(\"Preferences\", row({",
        "${group(\"Preferences\", row({\n          icon: ICON.design, title: \"Practice style\", sub: styleName,\n          attrs: `data-action=\"you-practice-style\"`\n        }) + row({"
    )
    
if "export async function handleYouAction" not in code:
    # Need to add handler in panel.js for you-practice-style? 
    pass

with open("src/ui/views/you.js", "w", encoding="utf-8") as f:
    f.write(code)

