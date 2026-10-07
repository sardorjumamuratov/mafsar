import os

with open('server/src/app.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "const body = designTaskSchema.parse(await c.req.json());\n      return c.json(await generateDesignTask(body.concept, body.reference, body.mode, c.get(\"userId\") as string));",
    "const body = designTaskSchema.parse(await c.req.json());\n      return c.json(await generateDesignTask(body.concept, body.reference, body.mode, c.get(\"userId\") as string, body.practiceStyle));"
)

with open('server/src/app.ts', 'w', encoding='utf-8') as f:
    f.write(code)
