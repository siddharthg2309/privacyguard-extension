import { PolicyConfigSchema, type PolicyConfig } from "@privacy-guard/contracts";
import { defaultPolicy } from "@privacy-guard/policy-engine";
import { z } from "zod";

export const AppConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.string().min(2),
    policy: PolicyConfigSchema,
    scan: z
      .object({
        maxTextCharacters: z.number().int().positive(),
        maxAttachmentBytes: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const CliScanConfigSchema = z
  .object({
    maxFileBytes: z.number().int().positive(),
    maxTotalBytes: z.number().int().positive(),
    maxFiles: z.number().int().positive(),
    concurrency: z.number().int().min(1).max(32),
    respectGitignore: z.boolean(),
    privacyIgnoreFile: z.string().min(1),
  })
  .strict();
export type CliScanConfig = z.infer<typeof CliScanConfigSchema>;

export const CliConfigSchema = AppConfigSchema.extend({
  cli: CliScanConfigSchema,
}).strict();
export type CliConfig = z.infer<typeof CliConfigSchema>;

export const defaultConfig: AppConfig = {
  schemaVersion: 1,
  locale: "en",
  policy: defaultPolicy,
  scan: {
    maxTextCharacters: 1_000_000,
    maxAttachmentBytes: 25_000_000,
  },
};

export const defaultCliConfig: CliConfig = {
  ...defaultConfig,
  cli: {
    maxFileBytes: 1_000_000,
    maxTotalBytes: 50_000_000,
    maxFiles: 10_000,
    concurrency: 8,
    respectGitignore: true,
    privacyIgnoreFile: ".aiprivacyignore",
  },
};

export function parseConfig(input: unknown): AppConfig {
  return AppConfigSchema.parse(input);
}

export function parsePolicy(input: unknown): PolicyConfig {
  return PolicyConfigSchema.parse(input);
}

export function parseCliConfig(input: unknown): CliConfig {
  return CliConfigSchema.parse(input);
}
