import { z } from "zod";

export const createFormInputSchema = z.object({
  title: z.string().trim().min(1).max(255)
});

export const updateDraftInputSchema = z.object({
  schema: z.unknown(),
  actor: z.string().trim().min(1).max(128).optional()
});

export const publishInputSchema = z.object({
  actor: z.string().trim().min(1).max(128).optional()
});

export const dbTargetInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65_535),
  user: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(4096),
  databaseName: z.string().trim().min(1).max(255)
});

export const startSessionInputSchema = z.object({
  resumeToken: z
    .string()
    .trim()
    .min(16)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional()
});

export const saveAnswerInputSchema = z.object({
  questionId: z.string().trim().min(1).max(128),
  value: z.unknown().optional()
});

export const navigateInputSchema = z.object({
  direction: z.enum(["back", "forward"])
});

export const submissionsQuerySchema = z.object({
  status: z.enum(["completed", "in_progress"]).optional(),
  version: z.coerce.number().int().min(1).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  branchContains: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional()
});

export const loginInputSchema = z.object({
  password: z.string().min(1).max(2048),
  next: z.string().trim().max(1024).optional()
});
