
import os

with open("src/ui/views/set-detail.js", "r", encoding="utf-8") as f:
    code = f.read()

func = """
export async function applyPracticeStyle(style, makeDefault) {
  state.practiceStyle = style;
  if (makeDefault) {
    const { setDefaultPracticeStyle } = await import("../../storage/practice-style.js");
    await setDefaultPracticeStyle(style);
  }
  closeSheet();
  paintDetail(true, true);
}
"""

if "export async function applyPracticeStyle" not in code:
    code += "\n" + func

with open("src/ui/views/set-detail.js", "w", encoding="utf-8") as f:
    f.write(code)

