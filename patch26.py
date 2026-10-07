import re

with open('server/src/schema.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    'export const bottleneckHintSchema = z.object({ state: z.string().min(1).max(4000) });',
    'export const bottleneckHintSchema = z.object({ state: z.string().min(1).max(4000), level: z.number().int().min(1).max(3).optional() });'
)

with open('server/src/schema.ts', 'w', encoding='utf-8') as f:
    f.write(code)
