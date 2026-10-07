const fs = require('fs');
let code = fs.readFileSync('server/src/app.ts', 'utf8');

code = code.replace(
  /const body = designTaskSchema\.parse\(await c\.req\.json\(\)\);\n\s*return c\.json\(await generateDesignTask\(body\.concept, body\.reference, body\.mode\)\);/,
  'const body = designTaskSchema.parse(await c.req.json());\n      return c.json(await generateDesignTask(body.concept, body.reference, body.mode, c.get("userId") as string));'
);

code = code.replace(
  /const body = designGradeSchema\.parse\(await c\.req\.json\(\)\);\n\s*return c\.json\(await gradeDesignAnswer\(body\)\);/,
  'const body = designGradeSchema.parse(await c.req.json());\n      return c.json(await gradeDesignAnswer({ ...body, uid: c.get("userId") as string }));'
);

code = code.replace(
  /const body = bottleneckTaskSchema\.parse\(await c\.req\.json\(\)\);\n\s*return c\.json\(await generateBottleneckTask\(body\.concept, body\.reference\)\);/,
  'const body = bottleneckTaskSchema.parse(await c.req.json());\n      return c.json(await generateBottleneckTask(body.concept, body.reference, c.get("userId") as string));'
);

code = code.replace(
  /const body = bottleneckHintSchema\.parse\(await c\.req\.json\(\)\);\n\s*return c\.json\(await generateBottleneckHint\(body\.state\)\);/,
  'const body = bottleneckHintSchema.parse(await c.req.json());\n      return c.json(await generateBottleneckHint(body.state, c.get("userId") as string));'
);

code = code.replace(
  /const body = bottleneckGradeSchema\.parse\(await c\.req\.json\(\)\);\n\s*return c\.json\(await gradeBottleneckAnswer\(body\.state, body\.answer, body\.usedHint\)\);/,
  'const body = bottleneckGradeSchema.parse(await c.req.json());\n      return c.json(await gradeBottleneckAnswer(body.state, body.answer, body.usedHint, c.get("userId") as string));'
);

fs.writeFileSync('server/src/app.ts', code);
