import fs from "fs";
let code = fs.readFileSync("server/src/app.ts", "utf8");

code = code.replace(
  'designCurveballSchema, estimationTaskSchema',
  'designCurveballSchema, designCheckpointSchema, estimationTaskSchema'
);

const checkpointRoute = `
  app.post("/v1/design-checkpoint", limitByUser(limits.llmPerUser), async (c) => {
    const body = designCheckpointSchema.parse(await c.req.json());
    return c.json(await generateDesignCheckpoint(body.step, body.brief, body.answer));
  });
`;

code = code.replace(
  '  app.post("/v1/design-curveball", limitByUser(limits.llmPerUser), async (c) => {',
  checkpointRoute + '\n  app.post("/v1/design-curveball", limitByUser(limits.llmPerUser), async (c) => {'
);

fs.writeFileSync("server/src/app.ts", code, "utf8");
