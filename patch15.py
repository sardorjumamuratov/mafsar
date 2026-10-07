
import os

with open("src/ui/panel.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("await import(\"./core.js\");", "await import(\"./sheet.js\");")
code = code.replace("await import(\"../core.js\");", "await import(\"../sheet.js\");")
code = code.replace("const { you } = await import(\"./views/you.js\");", "")
code = code.replace("you();", "renderYou();")

with open("src/ui/panel.js", "w", encoding="utf-8") as f:
    f.write(code)

