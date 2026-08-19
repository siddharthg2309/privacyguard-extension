import { createEnvelope } from "@privacy-guard/testing-fixtures";
import { describe, expect, it } from "vitest";

import { createPrivacyEngine, privacyEngine, type PrivacyEngineError } from "./index.js";

describe("privacy engine", () => {
  it("allows content without meaningful detections", async () => {
    const decision = await privacyEngine.scan(createEnvelope("Explain how binary search works."));
    expect(decision).toMatchObject({ action: "allow", riskLevel: "low", riskScore: 0 });
    expect(decision.detections).toEqual([]);
  });

  it("blocks and redacts a synthetic critical secret", async () => {
    const key = `sk-proj-${"A1b2".repeat(8)}`;
    const decision = await privacyEngine.scan(createEnvelope(`api_key=${key}`));
    expect(decision.action).toBe("block");
    expect(decision.criticalOverrideAllowed).toBe(false);
    expect(decision.sanitizedContent?.["fragment-1"]).toBe("api_key=[API_KEY]");
    expect(JSON.stringify(decision)).not.toContain(key);
  });

  it("warns and redacts ordinary PII", async () => {
    const decision = await privacyEngine.scan(createEnvelope("Email person@example.com"));
    expect(decision.action).toBe("warn");
    expect(decision.sanitizedContent?.["fragment-1"]).toBe("Email [EMAIL]");
  });

  it("classifies sensitive attachments even without text", async () => {
    const decision = await privacyEngine.scan(
      createEnvelope("Review configuration", {
        attachments: [{ id: "attachment-1", name: ".env.production" }],
      }),
    );
    expect(decision.detections.map(({ category }) => category)).toContain("sensitive_file");
  });

  it("fails before scanning when configured limits are exceeded", async () => {
    const engine = createPrivacyEngine({
      config: {
        schemaVersion: 1,
        locale: "en",
        policy: {
          schemaVersion: 1,
          allowCriticalOverride: false,
          actions: { low: "allow", medium: "warn", high: "warn", critical: "block" },
        },
        scan: { maxTextCharacters: 4, maxAttachmentBytes: 100 },
      },
    });
    await expect(engine.scan(createEnvelope("too long"))).rejects.toMatchObject({
      code: "INPUT_TEXT_LIMIT_EXCEEDED",
    } satisfies Partial<PrivacyEngineError>);
  });
});
