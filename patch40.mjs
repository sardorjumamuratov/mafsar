import fs from "fs";
let code = fs.readFileSync("server/tests/drills.test.ts", "utf8");

// Fix Design drill mock test
code = code.replace(
  '{ section: "API", verdict: "strong", note: "" },',
  '{ section: "API", key: "components", verdict: "strong", note: "" },'
).replace(
  '{ section: "Estimates", verdict: "missing", note: "" },',
  '{ section: "Estimates", key: "components", verdict: "missing", note: "" },'
);

// Fix bottleneck scenario mock
code = code.replace(
  'architecture: ["Client", "API servers (6x)", "Postgres primary"],',
  'components: [{id: "client", name: "Client", detail: ""}, {id: "api", name: "API servers (6x)", detail: ""}, {id: "db", name: "Postgres primary", detail: ""}],\n    flaw_component: "db",'
);

code = code.replace(
  'expect(body.architecture).toEqual(SCENARIO.architecture);',
  'expect(body.components).toEqual(SCENARIO.components);'
);

// Fix "fix_works" assertions to use "proposedFix"
// Because the output schema changed to criteria!
// wait, the test expects "found_flaw", "fix_works" etc.
// The new schema outputs:
// "criteria": { "foundFlaw": { status: ... } ... }, "verdict": "correct", ...
const gradeOld = `const fetchMock = reply({ found_flaw: true, explanation_correct: true, fix_works: "yes", feedback: "Nice." });
      vi.stubGlobal("fetch", fetchMock);
      const body = await (await post("/v1/bottleneck-grade", { state, answer: "The single primary", usedHint: true })).json();
      expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain("single primary");
      expect(body.found_flaw).toBe(true);
      expect(body.fix_works).toBe(false); // only a real true counts
      expect(body.score).toBe(1.5);`;

const gradeNew = `const fetchMock = reply({ criteria: { foundFlaw: { status: "covered" }, explainedFailure: { status: "covered" }, proposedFix: { status: "ok" } }, verdict: "not_quite", feedback: "Nice." });
      vi.stubGlobal("fetch", fetchMock);
      const body = await (await post("/v1/bottleneck-grade", { state, answer: "The single primary", usedHint: true })).json();
      expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain("single primary");
      expect(body.criteria.foundFlaw.status).toBe("covered");
      expect(body.criteria.proposedFix.status).toBe("missed"); // "ok" is not "covered" or "partial"
      expect(body.score).toBe(2); // Wait, old score was 1.5 because found_flaw + explanation (2) - 0.5 for hint. But we don't penalize unless it's simulation mode!
      expect(body.usedHint).toBe(true);`;

code = code.replace(gradeOld, gradeNew);

// Fix estimation summary test
code = code.replace(
  'expect((await ok.json()).habit_to_fix).toBe("Remember replication.");',
  'expect((await ok.json()).habit_to_fix).toBe("Remember replication.");\n      expect(await practiceUnits()).toBe(0);'
);

fs.writeFileSync("server/tests/drills.test.ts", code, "utf8");
