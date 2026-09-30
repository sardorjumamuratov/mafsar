const fs = require("fs");
let panel = fs.readFileSync("src/ui/panel.js", "utf8");

panel = panel.replace('import { activeTab, setNav, showChrome } from "./nav.js";', 'import { activeTab, setNav, showChrome } from "./nav.js";\nimport { rateSet, clearRating } from "../storage/ratings.js";');

const clickEvent = `
  const starBtn = e.target.closest(".star-btn");
  if (starBtn && !starBtn.disabled) {
    const group = starBtn.closest(".rating-group");
    const rootId = group.dataset.root;
    const clientSetId = group.dataset.client;
    const val = parseInt(starBtn.dataset.val, 10);
    const checked = starBtn.getAttribute("aria-checked") === "true";
    if (checked) {
      clearRating(rootId, clientSetId);
    } else {
      rateSet(rootId, clientSetId, val);
    }
    return;
  }
`;

panel = panel.replace('document.addEventListener("click", async (e) => {', 'document.addEventListener("click", async (e) => {\n' + clickEvent);

const overEvent = `
document.addEventListener("mouseover", (e) => {
  const btn = e.target.closest(".star-btn");
  if (btn && !btn.disabled) {
    const val = parseInt(btn.dataset.val, 10);
    const group = btn.closest(".rating-group");
    const btns = group.querySelectorAll(".star-btn");
    btns.forEach((b, i) => {
      const svg = b.querySelector("svg");
      if (i < val) {
        svg.style.fill = "var(--rating-star, #f0c75e)";
        svg.style.stroke = "var(--rating-star, #f0c75e)";
      } else {
        svg.style.fill = "none";
        svg.style.stroke = "var(--rating-empty, #6d7c78)";
      }
    });
  }
});
document.addEventListener("mouseout", (e) => {
  const btn = e.target.closest(".star-btn");
  if (btn && !btn.disabled) {
    // We let mafsar-ratings-changed repaint it correctly. 
    // For now we can just dispatch it to trigger a redraw.
    window.dispatchEvent(new Event("mafsar-ratings-changed"));
  }
});

document.addEventListener("keydown", (e) => {
  if (e.target.classList.contains("star-btn")) {
    const group = e.target.closest(".rating-group");
    const rootId = group.dataset.root;
    const clientSetId = group.dataset.client;
    let val = parseInt(e.target.dataset.val, 10);
    if (e.key === "ArrowRight") {
      val = Math.min(5, val + 1);
      rateSet(rootId, clientSetId, val);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      val = Math.max(1, val - 1);
      rateSet(rootId, clientSetId, val);
      e.preventDefault();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      clearRating(rootId, clientSetId);
      e.preventDefault();
    }
  }
});
`;

panel = panel + '\n' + overEvent;
fs.writeFileSync("src/ui/panel.js", panel);
