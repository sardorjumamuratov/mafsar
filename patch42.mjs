import fs from "fs";
let code = fs.readFileSync("server/tests/drills.test.ts", "utf8");

const toReplace = `    const fetchMock = reply({ found_flaw: true, explanation_correct: true, fix_works: "yes", feedback: "Nice." });
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await post("/v1/bottleneck-grade", { state, answer: "The single primary", usedHint: true })).json();
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain("single primary");
    expect(body.found_flaw).toBe(true);
    expect(body.fix_works).toBe(false); // only a real true counts
    expect(body.score).toBe(1.5);`;

const replacement = `    const fetchMock = reply({ criteria: { foundFlaw: { status: "covered" }, explainedFailure: { status: "covered" }, proposedFix: { status: "missed" } }, feedback: "Nice." });
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await post("/v1/bottleneck-grade", { state, answer: "The single primary", usedHint: true })).json();
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain("single primary");
    expect(body.criteria.foundFlaw.status).toBe("covered");
    expect(body.criteria.proposedFix.status).toBe("missed"); // only a real true counts
    expect(body.score).toBe(2);`;

if (code.includes(toReplace)) {
  code = code.replace(toReplace, replacement);
  fs.writeFileSync("server/tests/drills.test.ts", code, "utf8");
  console.log("Patched correctly");
} else {
  console.log("Could not find text to replace!");
}
