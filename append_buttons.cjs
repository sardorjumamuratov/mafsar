const fs = require("fs");
let c = fs.readFileSync("src/ui/views/sets.js", "utf8");

const buttonsHtml = `
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px">
        <button class="btn btn-ghost btn-block hidden" id="captureAnswerBtn" data-action="capture-last-answer" style="border: 1px solid var(--border-card); background: var(--bg-surface); color: var(--text-primary); border-radius: 12px; height: 50px; font-weight: 600">Capture last answer</button>
        <button class="btn btn-ghost btn-block" id="captureCurrentBtn" data-action="capture-current" style="border: 1px solid var(--border-card); background: var(--bg-surface); color: var(--text-primary); border-radius: 12px; height: 50px; font-weight: 600">Capture this page</button>
      </div>`;

c = c.replace(/<\/div>\s*<\/div>\s*`;/, buttonsHtml + "\n    </div>\n  `;");

const functions = `
let captureAnswerToken = 0;
import { isAIChatTab } from "../core.js";
import { classifyUrl } from "../../storage/sources.js";
import { queryActiveTab } from "../core.js";

export async function refreshCaptureCurrentButton() {
  const btn = document.getElementById("captureCurrentBtn");
  if (!btn) return;
  const tab = await queryActiveTab();
  const source = classifyUrl(tab?.url || "");
  if (source.kind === "page") {
    delete btn.dataset.kind;
    delete btn.dataset.origin;
    return;
  }
  btn.dataset.kind = source.kind;
  btn.dataset.origin = source.origin;
}

export async function refreshCaptureAnswerButton() {
  const btn = document.getElementById("captureAnswerBtn");
  if (!btn) return;
  
  const token = Math.random();
  captureAnswerToken = token;
  
  const chatTab = await isAIChatTab();
  if (captureAnswerToken !== token) return;
  
  btn.classList.toggle("hidden", !chatTab.ok);
  if (chatTab.url) {
    btn.dataset.origin = new URL(chatTab.url).origin;
  } else {
    delete btn.dataset.origin;
  }
}
`;

c += functions;
c = c.replace(/showChrome\(\);/, "showChrome();\n  refreshCaptureAnswerButton().catch(() => {});\n  refreshCaptureCurrentButton().catch(() => {});");

fs.writeFileSync("src/ui/views/sets.js", c);
