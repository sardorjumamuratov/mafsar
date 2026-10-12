import { z } from "zod";

// Client shapes mirror the extension exactly (camelCase in, camelCase out).
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = registerSchema;

export const ratingSchema = z.object({ stars: z.number().int().min(1).max(5) });
export const ratingLookupSchema = z.object({ ids: z.array(z.string()).max(200) });
export const setSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  mode: z.string().default("general"),
  examDate: z.string().nullable().optional(),
  chainOverrides: z.record(z.string()).optional(),
  // Server-computed fields come back on the pull and clients echo them on the
  // next push. They're accepted so the batch isn't rejected, and never written:
  // ratings change only through the rating routes, visibility only through
  // publish.
  yourStars: z.number().int().min(1).max(5).nullable().optional(),
  ratingAvg: z.number().nullable().optional(),
  ratingCount: z.number().int().optional(),
  isGlobal: z.boolean().optional(),
  originSetId: z.string().max(100).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deleted: z.boolean().optional(),
});

/** Epoch ms (number or numeric string) or an ISO string → ISO string. */
const isoDate = z.union([z.string(), z.number()]).transform((val) => {
  if (typeof val === "number") return new Date(val).toISOString();
  if (!Number.isNaN(Number(val)) && val.trim() !== "") return new Date(Number(val)).toISOString();
  return val;
});

export const cardSchema = z.object({
  id: z.string().min(1),
  setId: z.string().min(1),
  front: z.string(),
  back: z.string(),
  easiness: z.number().default(2.5),
  interval: z.number().default(0),
  repetitions: z.number().int().default(0),
  dueDate: isoDate.nullable().optional(),
  updatedAt: z.string(),
  deleted: z.boolean().optional(),
  stability: z.number().nullable().optional(),
  difficulty: z.number().nullable().optional(),
  state: z.string().nullable().optional(),
  lapses: z.number().int().nullable().optional(),
  lastReview: isoDate.nullable().optional(),
  originCardId: z.string().max(100).nullable().optional(),
  detached: z.boolean().optional(),
});

export const quizSchema = z.object({
  id: z.string().min(1),
  setId: z.string().min(1),
  q: z.string(),
  options: z.array(z.string()).min(2),
  answer: z.number().int().min(0),
  explain: z.string().nullable().optional(),
  updatedAt: z.string(),
  deleted: z.boolean().optional(),
});

export const activitySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(0),
});

export const reviewSchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  grade: z.number().int().min(0).max(5),
  prevInterval: z.number().default(0),
  newInterval: z.number().default(0),
  reviewedAt: z.string(),
  kind: z.string().default("flashcard"),
  stability: z.number().nullable().optional(),
  difficulty: z.number().nullable().optional(),
});

export const deleteAccountSchema = z.object({
  // Exact and case-sensitive: this is the one irreversible call in the API.
  confirm: z.literal("DELETE"),
  password: z.string().max(200).optional(),
});

// Mechanism chains (Medicine mode): one chain per condition, steps keyed by the
// template (for medicine: cause, mechanism, physiological, symptoms, signs,
// tests, diagnosis, treatment). Synced like cards.
export const chainSchema = z.object({
  id: z.string().min(1).max(100),
  setId: z.string().min(1).max(100),
  template: z.string().min(1).max(50),
  title: z.string().max(200),
  updatedAt: z.string().min(1),
  deleted: z.boolean().optional(),
});

export const chainStepSchema = z.object({
  id: z.string().min(1).max(100),
  chainId: z.string().min(1).max(100),
  key: z.string().min(1).max(40),
  statement: z.string().max(1000),
  why: z.string().max(1000).default(""),
  edited: z.boolean().optional(),
  updatedAt: z.string().min(1),
  deleted: z.boolean().optional(),
});

export const syncSchema = z.object({
  since: z.string().max(50).optional(),
  sets: z.array(setSchema).max(50, "At most 50 sets per sync batch").default([]),
  cards: z.array(cardSchema).max(500, "At most 500 cards per sync batch").default([]),
  quiz: z.array(quizSchema).max(500, "At most 500 quiz items per sync batch").default([]),
  activity: z.array(activitySchema).max(500, "At most 500 activity days per sync batch").default([]),
  reviews: z.array(reviewSchema).max(1000, "At most 1000 reviews per sync batch").default([]),
  // Clients older than Medicine mode send neither; both default to empty.
  chains: z.array(chainSchema).max(50, "At most 50 chains per sync batch").default([]),
  chainSteps: z.array(chainStepSchema).max(500, "At most 500 chain steps per sync batch").default([]),
});
export type SyncBody = z.infer<typeof syncSchema>;

// --- Phase 2: LLM proxy --------------------------------------------------------

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(30000, "Message text capped at 30k chars"),
});

export const generateSchema = z.object({
  messages: z.array(messageSchema).min(1).max(100, "At most 100 messages in conversation history"),
  title: z.string().max(200, "Title capped at 200 chars").optional(),
  // Set mode; unknown values are treated as general (see llm.ts studyMode).
  mode: z.string().max(20).optional(),
});

export const gradeSchema = z.object({
  question: z.string().min(1),
  reference: z.string().min(1),
  answer: z.string().min(1),
});

export const hypotheticalSchema = z.object({
  concept: z.string().min(1),
  reference: z.string().min(1),
});

export const summarizeSchema = z.object({
  messages: z.array(messageSchema).min(1),
});

export const blurbSchema = z.object({
  title: z.string().default(""),
  cardFronts: z.array(z.string()).min(1),
});

// Coding mode. The 4000-char bound on `code` is the same hard cap the panel
// enforces — re-checked here because the client is never trusted, and because
// an unbounded body is a token-cost and grading-quality problem.
export const codingTaskSchema = z.object({
  concept: z.string().min(1),
  reference: z.string().min(1),
  language: z.string().max(20).optional(),
});

export const codingGradeSchema = z.object({
  task: z.string().min(1),
  rubric: z.array(z.string().min(1)).min(1).max(4),
  language: z.string().max(20).default("text"),
  expectedLines: z.number().int().min(1).max(200).default(15),
  code: z.string().min(1).max(4000),
});

// Sharing. A share is a read-only copy handoff: one code per set, revocable.
export const shareCreateSchema = z.object({ setId: z.string().min(1) });
export const shareRevokeSchema = z.object({ code: z.string().min(1) });

// Teams. Codes are the join handle (same trust model as share codes); names
// are shown to members only, so a modest length bound is enough.
export const teamCreateSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const teamJoinSchema = z.object({ code: z.string().trim().min(1).max(32) });

export const pollSchema = z.object({ pollId: z.string().min(1).max(200), pollToken: z.string().min(20).max(200) });

// Teach it back. The client sends the whole conversation on every turn (nothing
// is stored server-side), so every size is capped here.
export const MAX_TEACH_MESSAGES = 24;

const teachCardSchema = z.object({
  id: z.string().min(1).max(100),
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(2000),
});
const teachMessageSchema = z.object({
  role: z.enum(["learner", "student"]),
  text: z.string().min(1).max(2000),
  kind: z.enum(["question", "hint", "follow_up", "wrap_up"]).optional(),
  focusCardId: z.string().max(100).optional(),
});
const teachBase = {
  topic: z.string().min(1).max(200),
  persona: z.enum(["child", "beginner", "patient"]).default("child"),
  cards: z.array(teachCardSchema).min(1).max(6),
};

export const teachTurnSchema = z
  .object({
    ...teachBase,
    messages: z.array(teachMessageSchema).min(1).max(MAX_TEACH_MESSAGES),
    wantHint: z.boolean().default(false),
  })
  .refine((b) => b.messages[b.messages.length - 1].role === "learner", {
    message: "the last message must be the learner's",
    path: ["messages"],
  });

export const teachEvaluateSchema = z
  .object({ ...teachBase, messages: z.array(teachMessageSchema).min(2).max(MAX_TEACH_MESSAGES) })
  .refine((b) => b.messages.some((m) => m.role === "learner"), { message: "nothing was taught", path: ["messages"] });

// --- System design drills (Design drill, Estimation, Find the bottleneck) ---
const drillReference = z.array(z.object({ front: z.string().max(500), back: z.string().max(2000) })).max(50);
const drillSource = { concept: z.string().min(1).max(500), reference: drillReference };
export const MAX_DESIGN_ANSWER = 4000;
/** One design section's draft (docs/prompts/38: 2,000 characters per section). */
export const MAX_DESIGN_SECTION = 2000;
// Every new field is optional: clients older than 0.3.6 send none of them.
const practiceStyle = z.enum(["guided", "simulation"]).optional();
// v2 drill tokens carry components, hints and the style, so they run longer than the old ones.
const drillState = z.string().min(1).max(12000);

export const designTaskSchema = z.object({ ...drillSource, mode: z.enum(["design", "clinical"]).default("design"), practiceStyle });

const sectionText = z.string().max(MAX_DESIGN_SECTION).optional();
const designAnswers = z.object({
  requirements: sectionText, estimates: sectionText, api: sectionText,
  dataModel: sectionText, components: sectionText, tradeoffs: sectionText,
});
const answerText = (b: { answer?: unknown; answers?: Record<string, string | undefined> }) => {
  const structured = Object.values(b.answers || {}).filter((v) => typeof v === "string" && v.trim());
  if (structured.length) return structured.join("");
  if (typeof b.answer === "string") return b.answer.trim();
  if (b.answer && typeof b.answer === "object") return Object.values(b.answer).filter((v) => typeof v === "string" && v.trim()).join("");
  return "";
};

/** Grades the first answer, or (with curveball) the adaptation to a curveball. */
export const designGradeSchema = z
  .object({
    // "clinical" reuses this route for Medicine clinical cases; state carries the
    // encrypted case (diagnosis, tests) the client must not see. For a design
    // brief, state carries the sealed rubric (0.3.6+).
    mode: z.enum(["design", "clinical"]).default("design"),
    state: z.string().max(12000).optional(),
    task: z.string().min(1).max(2000),
    // The labelled single answer old clients send; an object of sections is also read.
    answer: z.union([z.string().max(MAX_DESIGN_ANSWER), designAnswers]).optional(),
    // New clients send the sections separately; empty means skipped.
    answers: designAnswers.optional(),
    rubric: z.array(z.string().max(300)).max(10).optional(),
    curveball: z.string().max(1000).optional(),
    originalAnswer: z.string().max(MAX_DESIGN_ANSWER).optional(),
    practiceStyle,
  })
  .refine((b) => answerText(b).length > 0, { message: "Write in at least one section first.", path: ["answer"] })
  .refine((b) => answerText(b).length <= MAX_DESIGN_ANSWER, { message: `The answer is over ${MAX_DESIGN_ANSWER} characters in total.`, path: ["answer"] });

export const designCheckpointSchema = z.object({
  section: z.enum(["requirements", "estimates", "components", "tradeoffs", "api", "dataModel"]),
  answer: z.string().trim().min(1).max(MAX_DESIGN_SECTION),
  task: z.string().max(2000).optional(),
  state: z.string().max(12000).optional(),
  practiceStyle,
});

export const designCurveballSchema = z.object({
  mode: z.enum(["design", "clinical"]).default("design"),
  state: z.string().max(8000).optional(),
  task: z.string().min(1).max(2000),
  answer: z.string().min(1).max(MAX_DESIGN_ANSWER),
  previous: z.array(z.string().max(1000)).max(5).default([]),
});

export const estimationTaskSchema = z.object({ ...drillSource, practiceStyle });

export const estimationSummarySchema = z.object({
  results: z.array(z.object({
    question: z.string().max(1000),
    expected: z.string().max(200),
    answer: z.string().max(200),
    grade: z.enum(["spot_on", "ballpark", "off"]),
    // 0.3.6+: the finer verdict (a unit mismatch is graded "off") and optional rough working.
    status: z.enum(["correct", "close", "not_quite", "unit_mismatch"]).optional(),
    working: z.string().max(800).optional(),
  })).min(1).max(10),
  practiceStyle,
});

export const bottleneckTaskSchema = z.object({ ...drillSource, practiceStyle });
// state is the server-encrypted planted flaw (see crypto.ts); bounded so a
// forged blob can't be huge.
export const bottleneckHintSchema = z.object({ state: drillState, level: z.number().int().min(1).max(3).optional() });
const bottleneckParts = z.object({
  flaw: z.string().max(1500).optional(),
  reason: z.string().max(1500).optional(),
  fix: z.string().max(1500).optional(),
  tradeoff: z.string().max(1000).optional(),
});
export const bottleneckGradeSchema = z
  .object({
    state: drillState,
    answer: z.string().max(MAX_DESIGN_ANSWER).optional(),
    parts: bottleneckParts.optional(),
    usedHint: z.boolean().default(false),
    selectedComponentId: z.string().max(60).optional(),
    practiceStyle,
  })
  .refine((b) => !!b.answer?.trim() || Object.values(b.parts || {}).some((v) => typeof v === "string" && v.trim()), {
    message: "Write what breaks first.",
    path: ["answer"],
  });

export const drillCardSuggestionsSchema = z.object({
  mode: z.enum(["design", "estimation", "bottleneck", "clinical"]),
  gaps: z.array(z.object({
    type: z.enum(["missed_rubric", "partial_rubric", "estimation_mistake", "unit_mismatch", "missed_bottleneck", "missing_tradeoff"]),
    text: z.string().min(1).max(400),
  })).max(8),
  topic: z.string().max(200),
  existingFronts: z.array(z.string().max(200)).max(50).default([]),
  practiceStyle,
});

// --- Medicine practice: grounded, bite-sized clinical cases (docs/prompts/39) ---
export const PRACTICE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
/** A chain as notes: the case writer may use only what is here and in the cards. */
const caseChain = z.object({
  title: z.string().max(200),
  steps: z.array(z.object({ label: z.string().max(80), statement: z.string().max(300), why: z.string().max(300).optional() })).max(10),
});
export const clinicalCaseSchema = z.object({
  ...drillSource,
  chains: z.array(caseChain).max(20).default([]),
  level: z.enum(PRACTICE_LEVELS).default("beginner"),
  practiceStyle,
}).refine((b) => b.reference.length > 0 || b.chains.length > 0, { message: "Add some cards to this set first: a case is built from your notes.", path: ["reference"] });
/** One request holds one step (guided) or the whole case's typed steps at once (simulation). */
export const clinicalCheckSchema = z
  .object({
    state: drillState,
    answers: z.array(z.object({
      stepId: z.string().min(1).max(40),
      answer: z.string().trim().min(1).max(200),
      why: z.string().max(200).optional(),
    })).max(4).default([]),
    // The case is over: also return the results of tests the learner didn't order.
    finish: z.boolean().optional(),
    ordered: z.array(z.string().max(120)).max(6).optional(),
    practiceStyle,
  })
  .refine((b) => b.answers.length > 0 || b.finish === true, { message: "Answer a step first.", path: ["answers"] });
