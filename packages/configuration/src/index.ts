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

export const defaultConfig: AppConfig = {
  schemaVersion: 1,
  locale: "en",
  policy: defaultPolicy,
  scan: {
    maxTextCharacters: 1_000_000,
    maxAttachmentBytes: 25_000_000,
  },
};

export function parseConfig(input: unknown): AppConfig {
  return AppConfigSchema.parse(input);
}

export function parsePolicy(input: unknown): PolicyConfig {
  return PolicyConfigSchema.parse(input);
}
