import assert from "node:assert/strict";

global.document = {
  getElementById: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, insertAdjacentHTML: () => {}, innerHTML: "", onclick: null }),
  createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toDataURL: () => "" }),
  addEventListener: () => {},
  querySelector: () => ({})
};
global.window = {};
global.FileReader = class {};
global.Image = class {};
global.DOMParser = class { parseFromString() { return { body: { textContent: "" } }; } };

const stats = await import("../src/ui/views/stats.js");

const logs = [
  { reviewedAt: new Date().toISOString(), grade: 4, durationMs: 120000 },
  { reviewedAt: new Date().toISOString(), grade: 3, durationMs: 60000 },
  { reviewedAt: new Date(Date.now() - 10 * 86400000).toISOString(), grade: 5, durationMs: 60000 },
];
const weekLogs = stats.getRangeLogs(logs, "week");
assert.equal(weekLogs.length, 2);

const chartHtml = stats.renderChart(logs, "week");
assert(chartHtml.includes("Today"));

const cards = [{ id: "c1", set_id: "s1" }, { id: "c2", set_id: "s1", dueDate: new Date(0).toISOString() }];
const sets = [{ id: "s1", title: "Set 1" }];
for (let i = 0; i < 65; i++) {
  cards.push({ id: "bx" + i, set_id: "s1", dueDate: new Date(0).toISOString() });
}

const fbHtml = stats.renderFeedback(logs, cards, sets, logs);
// 05-stats.html: "Feedback", uppercased by CSS.
assert(fbHtml.includes(">Feedback<"));
assert(fbHtml.includes("Your backlog is growing"));

console.log("PASS stats logic");
