import fs from "fs";
let code = fs.readFileSync("server/src/app.ts", "utf8");

// Add imports
code = code.replace(
  "bottleneckGradeSchema, shareCreateSchema",
  "bottleneckGradeSchema, drillCardSuggestionsSchema, shareCreateSchema"
);
code = code.replace(
  "import { generateFlashcards",
  "import { generateDrillCardSuggestions, generateFlashcards"
);

// Add the route
const route = `
  app.post("/v1/drill-card-suggestions", limitByUser(limits.llmPerUser), async (c) => {
    if (process.env.DRILL_CARD_SUGGESTIONS === "off") return c.json({ error: "feature_disabled", message: "Suggestions are disabled" }, 404);
    const body = drillCardSuggestionsSchema.parse(await c.req.json());
    return c.json(await generateDrillCardSuggestions(body));
  });
`;

const index = code.lastIndexOf("return app;");
if (index !== -1) {
  code = code.substring(0, index) + route + "\n  " + code.substring(index);
  fs.writeFileSync("server/src/app.ts", code, "utf8");
  console.log("Added /v1/drill-card-suggestions");
} else {
  console.log("Could not find 'return app;'");
}
