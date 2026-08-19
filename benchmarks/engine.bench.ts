import { createEnvelope } from "@privacy-guard/testing-fixtures";
import { privacyEngine } from "@privacy-guard/privacy-engine";
import { bench, describe } from "vitest";

describe("privacy engine baseline", () => {
  const safePrompt = createEnvelope("Explain this function without exposing private information.");
  const sensitivePrompt = createEnvelope(
    `Contact person@example.com and use api_key=sk-proj-${"A1b2".repeat(8)}`,
  );

  bench("safe prompt", async () => {
    await privacyEngine.scan(safePrompt);
  });

  bench("sensitive prompt", async () => {
    await privacyEngine.scan(sensitivePrompt);
  });
});
