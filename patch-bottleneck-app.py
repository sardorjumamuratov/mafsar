import os

with open('server/src/app.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "const body = bottleneckTaskSchema.parse(await c.req.json());\n      return c.json(await generateBottleneckTask(body.concept, body.reference, c.get(\"userId\") as string));",
    "const body = bottleneckTaskSchema.parse(await c.req.json());\n      return c.json(await generateBottleneckTask(body.concept, body.reference, c.get(\"userId\") as string, body.practiceStyle));"
)

with open('server/src/app.ts', 'w', encoding='utf-8') as f:
    f.write(code)
