import { DetectionCategorySchema, PrivacyDecisionSchema } from "@privacy-guard/contracts";
import { z } from "zod";

export const CliFormatSchema = z.enum(["human", "json"]);
export type CliFormat = z.infer<typeof CliFormatSchema>;

export const ScanResultSchema = z
  .object({
    path: z.string().min(1),
    status: z.enum(["scanned", "skipped"]),
    decision: PrivacyDecisionSchema.optional(),
    reasonCode: z.string().min(1).optional(),
  })
  .strict();
export type ScanResult = z.infer<typeof ScanResultSchema>;

export const ScanSummarySchema = z
  .object({
    scanned: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    detections: z.number().int().nonnegative(),
    violations: z.number().int().nonnegative(),
  })
  .strict();
export type ScanSummary = z.infer<typeof ScanSummarySchema>;

export const ScanOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    command: z.enum(["scan", "workspace.scan"]),
    status: z.enum(["success", "policy_violation"]),
    results: z.array(ScanResultSchema),
    summary: ScanSummarySchema,
  })
  .strict();
export type ScanOutput = z.infer<typeof ScanOutputSchema>;

export const RedactOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    command: z.literal("redact"),
    status: z.enum(["success", "policy_violation"]),
    path: z.string().min(1),
    decision: PrivacyDecisionSchema,
    sanitizedContent: z.string(),
  })
  .strict();

export const StatusOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    command: z.literal("status"),
    localOnly: z.literal(true),
    engine: z.literal("ready"),
    configPath: z.string().min(1),
  })
  .strict();

export const DoctorOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    command: z.literal("doctor"),
    healthy: z.boolean(),
    checks: z.array(
      z
        .object({
          id: z.string().min(1),
          status: z.enum(["pass", "fail"]),
        })
        .strict(),
    ),
  })
  .strict();

export const RunPolicyOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    command: z.literal("run"),
    status: z.literal("policy_violation"),
    launched: z.literal(false),
    adapter: z
      .object({
        id: z.literal("codex-exec"),
        version: z.literal(1),
      })
      .strict(),
    violations: z.number().int().positive(),
    categories: z.array(DetectionCategorySchema),
  })
  .strict();

export const ErrorOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    command: z.string().min(1),
    status: z.literal("error"),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type ErrorOutput = z.infer<typeof ErrorOutputSchema>;
