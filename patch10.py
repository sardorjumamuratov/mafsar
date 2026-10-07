# coding: utf-8
import os

with open("src/ui/flows/design.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("Writing the brief...", "Building a design exercise from your cards...")
code = code.replace("Writing the brief…", "Building a design exercise from your cards...")

with open("src/ui/flows/design.js", "w", encoding="utf-8") as f:
    f.write(code)

with open("src/ui/flows/estimation.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("Writing the drill...", "Creating estimation questions from this set...")
code = code.replace("Writing the drill…", "Creating estimation questions from this set...")

with open("src/ui/flows/estimation.js", "w", encoding="utf-8") as f:
    f.write(code)

with open("src/ui/flows/bottleneck.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("Writing the drill...", "Setting up an architecture to debug...")
code = code.replace("Writing the drill…", "Setting up an architecture to debug...")

with open("src/ui/flows/bottleneck.js", "w", encoding="utf-8") as f:
    f.write(code)

