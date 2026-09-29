const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");

// Old to new token mappings
const map = {
  "--bg": "--bg-app",
  "--surface": "--bg-surface",
  "--surface-2": "--bg-surface2",
  "--border": "--border-control",
  "--ink": "--text-primary",
  "--muted": "--text-muted",
  "--faint": "--text-faint",
  "--primary": "--accent",
  "--primary-strong": "--accent-hover",
  "--primary-soft": "--accent-chip-bg",
  "--danger": "--danger-text",
  "--success": "--status-mastered",
  "--warm": "--status-learning",
  "--warm-soft": "--status-new",
  "--sans": '"Geist", system-ui, sans-serif'
};

for (const [oldVar, newVar] of Object.entries(map)) {
  const regex = new RegExp(`var\\(${oldVar}\\)`, "g");
  css = css.replace(regex, `var(${newVar})`);
}

// Ensure all remaining usages are cleaned up
// e.g., --sans might be used without var if it was a custom property for font-family
css = css.replace(/var\(--sans\)/g, '"Geist", system-ui, sans-serif');
css = css.replace(/font-family:\s*var\(--sans\);?/g, 'font-family: "Geist", system-ui, sans-serif;');
// Wait, --bg was replaced to --bg-app, --bg-surface2 etc might match if we're not careful.
// Regex used `var(--bg)` exactly, so it's fine.

fs.writeFileSync("src/ui/panel.css", css);
