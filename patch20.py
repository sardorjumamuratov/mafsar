# coding: utf-8
import os

with open("server/src/schema.ts", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    "export const designTaskSchema = z.object({ ...drillSource, mode: z.enum([\"design\", \"clinical\"]).default(\"design\") });",
    "export const designTaskSchema = z.object({ ...drillSource, mode: z.enum([\"design\", \"clinical\"]).default(\"design\"), practiceStyle: z.enum([\"guided\", \"simulation\"]).optional() });"
)

code = code.replace(
    "export const bottleneckTaskSchema = z.object(drillSource);",
    "export const bottleneckTaskSchema = z.object({ ...drillSource, practiceStyle: z.enum([\"guided\", \"simulation\"]).optional() });"
)

with open("server/src/schema.ts", "w", encoding="utf-8") as f:
    f.write(code)

