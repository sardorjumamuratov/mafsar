import { z } from "zod";

// Client shapes mirror the extension exactly (camelCase in, camelCase out).
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = registerSchema;

export const setSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  mode: z.string().default("general"),
  examDate: z.string().nullable().optional(),
  chainOverrides: z.record(z.string()).optional(),
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
  since: z.string().optional(),
  sets: z.array(setSchema).default([]),
  cards: z.array(cardSchema).default([]),
  quiz: z.array(quizSchema).default([]),
  activity: z.array(activitySchema).default([]),
  reviews: z.array(reviewSchema).default([]),
  // Clients older than Medicine mode send neither; both default to empty.
  chains: z.array(chainSchema).default([]),
  chainSteps: z.array(chainStepSchema).default([]),
});
export type SyncBody = z.infer<typeof syncSchema>;

// --- Phase 2: LLM proxy --------------------------------------------------------

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1),
});

export const generateSchema = z.object({
  messages: z.array(messageSchema).min(1),
  title: z.string().optional(),
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

export const designTaskSchema = z.object({ ...drillSource, mode: z.enum(["design", "clinical"]).default("design") });

/** Grades the first answer, or (with curveball) the adaptation to a curveball. */
export const designGradeSchema = z.object({
  // "clinical" reuses this route for Medicine clinical cases; state carries the
  // encrypted case (diagnosis, tests) the client must not see.
  mode: z.enum(["design", "clinical"]).default("design"),
  state: z.string().max(8000).optional(),
  task: z.string().min(1).max(2000),
  answer: z.string().min(1).max(MAX_DESIGN_ANSWER),
  curveball: z.string().max(1000).optional(),
  originalAnswer: z.string().max(MAX_DESIGN_ANSWER).optional(),
});

export const designCurveballSchema = z.object({
  mode: z.enum(["design", "clinical"]).default("design"),
  state: z.string().max(8000).optional(),
  task: z.string().min(1).max(2000),
  answer: z.string().min(1).max(MAX_DESIGN_ANSWER),
  previous: z.array(z.string().max(1000)).max(5).default([]),
});

export const estimationTaskSchema = z.object(drillSource);

export const estimationSummarySchema = z.object({
  results: z.array(z.object({
    question: z.string().max(1000),
    expected: z.string().max(200),
    answer: z.string().max(200),
    grade: z.enum(["spot_on", "ballpark", "off"]),
  })).min(1).max(10),
});

export const bottleneckTaskSchema = z.object(drillSource);
// state is the server-encrypted planted flaw (see crypto.ts); bounded so a
// forged blob can't be huge.
export const bottleneckHintSchema = z.object({ state: z.string().min(1).max(4000) });
export const bottleneckGradeSchema = z.object({
  state: z.string().min(1).max(4000),
  answer: z.string().min(1).max(MAX_DESIGN_ANSWER),
  usedHint: z.boolean().default(false),
});
