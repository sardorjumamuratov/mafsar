import os

with open('server/src/schema.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "export const bottleneckTaskSchema = z.object({\n  concept: z.string().min(1).max(200),\n  reference: referenceSchema.array().max(10).default([])\n});",
    "export const bottleneckTaskSchema = z.object({\n  concept: z.string().min(1).max(200),\n  reference: referenceSchema.array().max(10).default([]),\n  practiceStyle: z.enum([\"guided\", \"simulation\"]).optional()\n});"
)

code = code.replace(
    "export const designTaskSchema = z.object({\n  concept: z.string().min(1).max(200),\n  reference: referenceSchema.array().max(10).default([]),\n  mode: z.enum([\"design\", \"clinical\"]).default(\"design\")\n});",
    "export const designTaskSchema = z.object({\n  concept: z.string().min(1).max(200),\n  reference: referenceSchema.array().max(10).default([]),\n  mode: z.enum([\"design\", \"clinical\"]).default(\"design\"),\n  practiceStyle: z.enum([\"guided\", \"simulation\"]).optional()\n});"
)

with open('server/src/schema.ts', 'w', encoding='utf-8') as f:
    f.write(code)
