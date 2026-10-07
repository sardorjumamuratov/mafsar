import re

with open('server/src/schema.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    'answer: z.string().max(200),\n    grade: z.enum(["spot_on", "ballpark", "off"]),\n  })).min(1).max(10),',
    'answer: z.string().max(200),\n      grade: z.enum(["spot_on", "ballpark", "off"]),\n      working: z.string().max(800).optional(),\n      status: z.enum(["correct", "close", "not_quite", "unit_mismatch"]).optional(),\n    })).min(1).max(10),'
)

with open('server/src/schema.ts', 'w', encoding='utf-8') as f:
    f.write(code)
