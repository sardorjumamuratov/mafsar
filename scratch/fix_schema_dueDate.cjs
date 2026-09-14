const fs = require("fs");
let s = fs.readFileSync("server/src/schema.ts", "utf8");
s = s.replace(
  /dueDate: z\.string\(\)\.nullable\(\)\.optional\(\),/,
  `dueDate: z.union([z.string(), z.number()])
    .transform(val => {
      if (typeof val === "number") return new Date(val).toISOString();
      if (!Number.isNaN(Number(val)) && val.trim() !== "") return new Date(Number(val)).toISOString();
      return val;
    })
    .nullable().optional(),`
);
fs.writeFileSync("server/src/schema.ts", s);
