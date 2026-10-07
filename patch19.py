# coding: utf-8
import os

with open("src/ui/views/you.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    "import { GOOGLE_G, app, bundle, esc, send, setFor, setHTML, toast, topOfView } from \"../core.js\";",
    "import { GOOGLE_G, app, bundle, esc, send, setFor, setHTML, toast, topOfView } from \"../core.js\";\nimport { getDefaultPracticeStyle, STYLES } from \"../../storage/practice-style.js\";"
)

with open("src/ui/views/you.js", "w", encoding="utf-8") as f:
    f.write(code)

