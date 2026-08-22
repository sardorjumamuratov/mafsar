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
  createdAt: z.string(),
  updatedAt: z.string(),
  deleted: z.boolean().optional(),
});

export const cardSchema = z.object({
  id: z.string().min(1),
  setId: z.string().min(1),
  front: z.string(),
  back: z.string(),
  easiness: z.number().default(2.5),
  interval: z.number().default(0),
  repetitions: z.number().int().default(0),
  dueDate: z.string().nullable().optional(),
  updatedAt: z.string(),
  deleted: z.boolean().optional(),
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
});

export const syncSchema = z.object({
  since: z.string().optional(),
  sets: z.array(setSchema).default([]),
  cards: z.array(cardSchema).default([]),
  quiz: z.array(quizSchema).default([]),
  activity: z.array(activitySchema).default([]),
  reviews: z.array(reviewSchema).default([]),
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
