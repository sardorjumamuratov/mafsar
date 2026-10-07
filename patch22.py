import re

with open('server/src/schema.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    'answer: z.string().min(1).max(MAX_DESIGN_ANSWER),',
    'answer: z.string().max(MAX_DESIGN_ANSWER).optional(),\n    selectedComponentId: z.string().max(200).optional(),\n    parts: z.object({\n      flaw: z.string().max(MAX_DESIGN_ANSWER).optional(),\n      reason: z.string().max(MAX_DESIGN_ANSWER).optional(),\n      fix: z.string().max(MAX_DESIGN_ANSWER).optional(),\n      tradeoff: z.string().max(MAX_DESIGN_ANSWER).optional(),\n    }).optional(),'
)

with open('server/src/schema.ts', 'w', encoding='utf-8') as f:
    f.write(code)
