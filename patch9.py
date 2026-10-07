
import os

with open("src/ui/flows/design.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("\"See a model answer\"", "\"Compare your approach\"")
code = code.replace("\"Hide the model answer\"", "\"Hide your approach\"")
code = code.replace(">See a model answer<", ">Compare your approach<")

with open("src/ui/flows/design.js", "w", encoding="utf-8") as f:
    f.write(code)

with open("src/ui/flows/bottleneck.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("\"See a model answer\"", "\"Compare your approach\"")
code = code.replace("\"Hide the model answer\"", "\"Hide your approach\"")
code = code.replace(">See a model answer<", ">Compare your approach<")

with open("src/ui/flows/bottleneck.js", "w", encoding="utf-8") as f:
    f.write(code)

with open("src/ui/flows/clinical.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("\"See your answers\"", "\"Compare your diagnosis\"")
code = code.replace("\"Hide your answers\"", "\"Hide your diagnosis\"")
code = code.replace(">See your answers<", ">Compare your diagnosis<")

with open("src/ui/flows/clinical.js", "w", encoding="utf-8") as f:
    f.write(code)

