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
  options: z.array(z.string()),
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
