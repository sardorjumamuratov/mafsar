# coding: utf-8
import os

with open("src/storage/practice-style.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("import { getLocal, setLocal } from \"./local.js\";", "import { get, set } from \"./store.js\";")
code = code.replace("getLocal", "get")
code = code.replace("setLocal", "set")

with open("src/storage/practice-style.js", "w", encoding="utf-8") as f:
    f.write(code)

