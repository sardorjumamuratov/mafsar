import re

with open('server/src/app.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    'return c.json(await generateBottleneckHint(body.state, c.get("userId") as string));',
    'return c.json(await generateBottleneckHint({ ...body, uid: c.get("userId") as string }));'
)

with open('server/src/app.ts', 'w', encoding='utf-8') as f:
    f.write(code)
