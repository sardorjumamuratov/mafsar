import fs from "fs";

let apiCode = fs.readFileSync("src/sync/api.js", "utf8");
if (!apiCode.includes("backendDrillCardSuggestions")) {
  apiCode = apiCode.replace(
    'export const backendDesignTask = (payload) => post("/v1/design-task", payload);',
    'export const backendDesignTask = (payload) => post("/v1/design-task", payload);\nexport const backendDrillCardSuggestions = (payload) => post("/v1/drill-card-suggestions", payload);'
  );
  fs.writeFileSync("src/sync/api.js", apiCode, "utf8");
}

let swCode = fs.readFileSync("src/background/service-worker.js", "utf8");
if (!swCode.includes("backendDrillCardSuggestions")) {
  swCode = swCode.replace(
    "  backendBottleneckGrade,",
    "  backendBottleneckGrade, backendDrillCardSuggestions,"
  );
  
  const routeCode = `
    case "DRILL_CARD_SUGGESTIONS":
      return backendDrillCardSuggestions({
        mode: String(msg.mode || ""),
        gaps: Array.isArray(msg.gaps) ? msg.gaps : [],
        topic: String(msg.topic || ""),
        existingFronts: Array.isArray(msg.existingFronts) ? msg.existingFronts : [],
        practiceStyle: typeof msg.practiceStyle === "string" ? msg.practiceStyle : undefined
      });
`;
  const idx = swCode.indexOf('    case "BOTTLENECK_GRADE":');
  swCode = swCode.substring(0, idx) + routeCode + swCode.substring(idx);
  fs.writeFileSync("src/background/service-worker.js", swCode, "utf8");
}
