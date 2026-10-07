# coding: utf-8
import os

with open("server/src/app.ts", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    "return c.json(await generateDesignTask(body.concept, body.reference, body.mode));",
    "return c.json(await generateDesignTask(body.concept, body.reference, body.mode, c.get(\"userId\") as string, body.practiceStyle));"
)

code = code.replace(
    "return c.json(await generateBottleneckTask(body.concept, body.reference));",
    "return c.json(await generateBottleneckTask(body.concept, body.reference, c.get(\"userId\") as string, body.practiceStyle));"
)

code = code.replace(
    "return c.json(await generateBottleneckHint(body.state));",
    "return c.json(await generateBottleneckHint(body.state, c.get(\"userId\") as string));"
)

code = code.replace(
    "return c.json(await gradeBottleneckAnswer(body.state, body.answer, body.usedHint));",
    "return c.json(await gradeBottleneckAnswer(body.state, body.answer, body.usedHint, c.get(\"userId\") as string));"
)

code = code.replace(
    "return c.json(await gradeDesignAnswer(body));",
    "return c.json(await gradeDesignAnswer({ ...body, uid: c.get(\"userId\") as string }));"
)

with open("server/src/app.ts", "w", encoding="utf-8") as f:
    f.write(code)

