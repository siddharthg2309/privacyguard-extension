import { defaultConfig } from "@privacy-guard/configuration";
import { PolicyConfigSchema } from "@privacy-guard/contracts";
import { z } from "zod";

export const AdapterIdSchema = z.enum(["chatgpt", "claude", "gemini"]);
export type AdapterId = z.infer<typeof AdapterIdSchema>;

export const CompatibilityStatusSchema = z
  .object({
    status: z.enum(["protected", "protection_unavailable", "unsupported"]),
    checkedAt: z.number().int().nonnegative(),
    errorCode: z.string().min(1).optional(),
  })
  .strict();

export const BrowserStoredStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    settings: z
      .object({
        enabled: z.boolean(),
        policy: PolicyConfigSchema,
        locale: z.string().min(2),
      })
      .strict(),
    onboardingComplete: z.boolean(),
    compatibility: z.partialRecord(AdapterIdSchema, CompatibilityStatusSchema),
    counters: z
      .object({
        scans: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative(),
        blocks: z.number().int().nonnegative(),
        redactions: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type BrowserStoredState = z.infer<typeof BrowserStoredStateSchema>;

export const defaultBrowserStoredState: BrowserStoredState = {
  schemaVersion: 1,
  settings: {
    enabled: true,
    policy: defaultConfig.policy,
    locale: defaultConfig.locale,
  },
  onboardingComplete: false,
  compatibility: {},
  counters: {
    scans: 0,
    warnings: 0,
    blocks: 0,
    redactions: 0,
  },
};

const LegacyStateSchema = z.looseObject({
  enabled: z.boolean().optional(),
  allowCriticalOverride: z.boolean().optional(),
});

export function migrateBrowserStoredState(input: unknown): BrowserStoredState {
  const current = BrowserStoredStateSchema.safeParse(input);
  if (current.success) return current.data;
  const legacy = LegacyStateSchema.safeParse(input);
  if (!legacy.success) return defaultBrowserStoredState;
  return {
    ...defaultBrowserStoredState,
    settings: {
      ...defaultBrowserStoredState.settings,
      enabled: legacy.data.enabled ?? true,
      policy: {
        ...defaultBrowserStoredState.settings.policy,
        allowCriticalOverride: legacy.data.allowCriticalOverride ?? false,
      },
    },
  };
}
