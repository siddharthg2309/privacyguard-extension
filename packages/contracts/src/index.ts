import { z } from "zod";

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const RiskLevelSchema = SeveritySchema;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const DecisionActionSchema = z.enum(["allow", "warn", "redact", "block"]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const DetectionCategorySchema = z.enum([
  "email",
  "phone",
  "person_name",
  "address",
  "government_id",
  "financial_identifier",
  "api_key",
  "jwt",
  "private_key",
  "database_url",
  "credential",
  "sensitive_file",
  "personal_image",
]);
export type DetectionCategory = z.infer<typeof DetectionCategorySchema>;

export const FragmentKindSchema = z.enum(["prompt", "clipboard", "file", "ocr", "stdin"]);
export type FragmentKind = z.infer<typeof FragmentKindSchema>;

export const TextFragmentSchema = z.object({
  id: z.string().min(1),
  kind: FragmentKindSchema,
  content: z.string(),
  label: z.string().min(1).optional(),
});
export type TextFragment = z.infer<typeof TextFragmentSchema>;

export const AttachmentDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1).optional(),
  mediaType: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type AttachmentDescriptor = z.infer<typeof AttachmentDescriptorSchema>;

export const AdapterCapabilitiesSchema = z.object({
  canCaptureText: z.boolean(),
  canCaptureAttachments: z.boolean(),
  canBlockSubmission: z.boolean(),
  canResumeSubmission: z.boolean(),
});
export type AdapterCapabilities = z.infer<typeof AdapterCapabilitiesSchema>;

export const ScanContextSchema = z.object({
  locale: z.string().min(2).default("en"),
  sourceLabel: z.string().min(1),
});
export type ScanContext = z.infer<typeof ScanContextSchema>;

export const ContentEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1),
    source: z.enum(["browser", "cli"]),
    text: z.array(TextFragmentSchema),
    attachments: z.array(AttachmentDescriptorSchema).default([]),
    context: ScanContextSchema,
    capabilities: AdapterCapabilitiesSchema,
  })
  .strict();
export type ContentEnvelope = z.infer<typeof ContentEnvelopeSchema>;

export const DetectionLocationSchema = z
  .object({
    subjectId: z.string().min(1),
    subjectType: z.enum(["text", "attachment"]),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .refine(({ start, end }) => end >= start, {
    message: "Detection end must not precede its start.",
    path: ["end"],
  });
export type DetectionLocation = z.infer<typeof DetectionLocationSchema>;

export const DetectionSchema = z.object({
  id: z.string().min(1),
  category: DetectionCategorySchema,
  detectorId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  severity: SeveritySchema,
  location: DetectionLocationSchema,
  explanationCode: z.string().min(1),
  placeholder: z.string().min(1).optional(),
});
export type Detection = z.infer<typeof DetectionSchema>;

export const RiskAssessmentSchema = z.object({
  score: z.number().min(0).max(100),
  level: RiskLevelSchema,
  reasons: z.array(z.string()),
});
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

export const PolicyConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    allowCriticalOverride: z.boolean(),
    actions: z
      .object({
        low: DecisionActionSchema,
        medium: DecisionActionSchema,
        high: DecisionActionSchema,
        critical: DecisionActionSchema,
      })
      .strict(),
  })
  .strict();
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export const PrivacyDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: z.string().min(1),
  riskScore: z.number().min(0).max(100),
  riskLevel: RiskLevelSchema,
  action: DecisionActionSchema,
  detections: z.array(DetectionSchema),
  explanationCodes: z.array(z.string()),
  sanitizedContent: z.record(z.string(), z.string()).optional(),
  criticalOverrideAllowed: z.boolean(),
});
export type PrivacyDecision = z.infer<typeof PrivacyDecisionSchema>;

export type Detector = {
  readonly id: string;
  readonly version: string;
  supports(fragment: TextFragment): boolean;
  detect(fragment: TextFragment, context: ScanContext, signal?: AbortSignal): Promise<Detection[]>;
};

export const severityRank: Readonly<Record<Severity, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function createDetectionId(
  detectorId: string,
  subjectId: string,
  start: number,
  end: number,
  category: DetectionCategory,
): string {
  return `${detectorId}:${subjectId}:${start}:${end}:${category}`;
}
