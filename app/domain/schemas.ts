import { z } from "zod";

export const IssueSchema = z.object({
  dimension: z.enum([
    "grammar",
    "word_choice",
    "naturalness",
    "idiom",
    "register",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  snippet: z.string(),
  natural_version: z.string(),
  explanation: z.string(),
  tags: z.array(z.string()),
});

export const IssueListSchema = z.object({
  issues: z.array(IssueSchema),
});

export const LessonSchema = z.object({
  intro: z.string(),
  points: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      phrase: z.string(),
    }),
  ),
});
