import fs from "fs";
let code = fs.readFileSync("src/storage/design.js", "utf8");

const patchOld = `export const SECTIONS = [
  { key: "requirements", title: "Requirements", hint: "What must it do? Scale, latency, consistency?" },
  { key: "estimates", title: "Estimates", hint: "Traffic, storage, bandwidth: rough numbers." },
  { key: "api", title: "API", hint: "The main endpoints or calls." },
  { key: "dataModel", title: "Data model", hint: "Key entities and where they live." },
  { key: "components", title: "Components & flow", hint: "The parts and how a request moves through them." },
  { key: "bottlenecks", title: "Bottlenecks & trade-offs", hint: "What breaks first, and what you chose not to do." },
];`;

const patchNew = `export const SECTIONS = [
  { key: "requirements", title: "Requirements", hint: "What does the system do?" },
  { key: "estimates", title: "Estimates", hint: "QPS, storage, bandwidth?" },
  { key: "api", title: "API", hint: "Key endpoints?" },
  { key: "dataModel", title: "Data model", hint: "Schema?" },
  { key: "components", title: "Components and flow", hint: "Architecture?" },
  { key: "tradeoffs", title: "Trade-offs", hint: "Risks?" }
];

export const GUIDED_SECTIONS = [
  { key: "requirements", title: "Requirements", question: "What must the system do for users?", hint: "Start with the main action, then add one important constraint.", chips: ["Create", "Read", "Update", "Delete", "Authentication", "Rate limiting"] },
  { key: "estimates", title: "Scale", question: "What number should shape your design first?", hint: "Think about requests, users, storage, or read/write ratio.", chips: ["QPS", "Daily active users", "Read/write ratio", "Storage growth", "Peak traffic"] },
  { key: "components", title: "Architecture", question: "Which components would handle the request?", hint: "Describe the request path from user to data.", chips: ["Load balancer", "Cache", "Queue", "Database", "Object storage", "Worker"] },
  { key: "tradeoffs", title: "Risks and trade-offs", question: "What could break first, and what would you trade off to prevent it?", hint: "Name one failure risk and one cost or complexity trade-off.", chips: ["Hot key", "Single point of failure", "Consistency", "Latency", "Cost", "Operational complexity"] }
];`;

code = code.replace(patchOld, patchNew);

code = code.replace(
  'export function emptySections(mode) {',
  'export function emptySections(mode, style) {'
);

code = code.replace(
  'return Object.fromEntries(SECTIONS.map((s) => [s.key, ""]));',
  'return Object.fromEntries((style === "guided" ? GUIDED_SECTIONS : SECTIONS).map((s) => [s.key, ""]));'
);

code = code.replace(
  'export function assembleAnswer(sections, mode) {',
  'export function assembleAnswer(sections, mode, style) {'
);

code = code.replace(
  'const arr = mode === "clinical" ? CLINICAL_SECTIONS.concat(CLINICAL_FINAL_SECTIONS) : SECTIONS;',
  'const arr = mode === "clinical" ? CLINICAL_SECTIONS.concat(CLINICAL_FINAL_SECTIONS) : (style === "guided" ? GUIDED_SECTIONS : SECTIONS);'
);

fs.writeFileSync("src/storage/design.js", code, "utf8");
