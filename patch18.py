# coding: utf-8
import os

with open("src/ui/views/you.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    "import { setHTML } from \"../core.js\";",
    "import { setHTML } from \"../core.js\";\nimport { getDefaultPracticeStyle, STYLES } from \"../../storage/practice-style.js\";"
)

with open("src/ui/views/you.js", "w", encoding="utf-8") as f:
    f.write(code)

