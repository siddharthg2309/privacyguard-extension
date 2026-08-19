import { ContentEnvelopeSchema, PrivacyDecisionSchema } from "@privacy-guard/contracts";
import { AppConfigSchema } from "@privacy-guard/configuration";
import { z } from "zod";

export const BRIDGE_CAPTURE_EVENT = "privacy-guard:submission-captured";
export const BRIDGE_COMMAND_EVENT = "privacy-guard:submission-command";

export const PageCaptureMessageSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("PAGE_CAPTURE"),
    requestId: z.uuid(),
    content: z.string().max(1_000_000),
    sourceLabel: z.string().min(1).max(120),
  })
  .strict();
export type PageCaptureMessage = z.infer<typeof PageCaptureMessageSchema>;

export const PageCommandMessageSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.enum(["RESUME", "CANCEL"]),
    requestId: z.uuid(),
    content: z.string().max(1_000_000).optional(),
  })
  .strict()
  .superRefine((message, context) => {
    if (message.type === "RESUME" && message.content === undefined) {
      context.addIssue({
        code: "custom",
        message: "Resume commands require exact outgoing content.",
      });
    }
    if (message.type === "CANCEL" && message.content !== undefined) {
      context.addIssue({ code: "custom", message: "Cancel commands cannot include content." });
    }
  });
export type PageCommandMessage = z.infer<typeof PageCommandMessageSchema>;

export const WorkerScanRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("SCAN_REQUEST"),
    requestId: z.uuid(),
    envelope: ContentEnvelopeSchema,
    config: AppConfigSchema,
  })
  .strict();
export type WorkerScanRequest = z.infer<typeof WorkerScanRequestSchema>;

export const WorkerScanResponseSchema = z.discriminatedUnion("type", [
  z
    .object({
      schemaVersion: z.literal(1),
      type: z.literal("SCAN_SUCCESS"),
      requestId: z.uuid(),
      decision: PrivacyDecisionSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      type: z.literal("SCAN_FAILURE"),
      requestId: z.uuid(),
      errorCode: z.string().min(1),
    })
    .strict(),
]);
export type WorkerScanResponse = z.infer<typeof WorkerScanResponseSchema>;

export const RuntimeMessageSchema = z.discriminatedUnion("type", [
  z.object({ schemaVersion: z.literal(1), type: z.literal("GET_STATE") }).strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      type: z.literal("UPDATE_SETTINGS"),
      enabled: z.boolean().optional(),
      allowCriticalOverride: z.boolean().optional(),
      locale: z.string().min(2).max(24).optional(),
    })
    .strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("RECORD_REDACTION") }).strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      type: z.literal("RECORD_DECISION"),
      action: z.enum(["allow", "warn", "redact", "block"]),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      type: z.literal("SET_COMPATIBILITY"),
      adapterId: z.enum(["chatgpt", "claude", "gemini"]),
      status: z.enum(["protected", "protection_unavailable", "unsupported"]),
      errorCode: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("COMPLETE_ONBOARDING") }).strict(),
]);
export type RuntimeMessage = z.infer<typeof RuntimeMessageSchema>;
