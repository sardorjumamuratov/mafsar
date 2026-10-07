# coding: utf-8
import os

with open("src/storage/practice-style.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("import { get, set } from \"./store.js\";", "import { getSettings, saveSettings } from \"./store.js\";")
func_get = """export async function getDefaultPracticeStyle() {
  const s = await getSettings();
  return s.systemDesignPracticeStyle || null;
}"""
func_set = """export async function setDefaultPracticeStyle(style) {
  if (style !== STYLES.GUIDED && style !== STYLES.SIMULATION) return;
  await saveSettings({ systemDesignPracticeStyle: style });
}"""

import re
code = re.sub(r"export async function getDefaultPracticeStyle\(\) \{[\s\S]*?\}", func_get, code)
code = re.sub(r"export async function setDefaultPracticeStyle[\s\S]*?\}", func_set, code)

with open("src/storage/practice-style.js", "w", encoding="utf-8") as f:
    f.write(code)

