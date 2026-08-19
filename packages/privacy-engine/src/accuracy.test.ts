import { createEnvelope } from "@privacy-guard/testing-fixtures";
import { describe, expect, it } from "vitest";

import { privacyEngine } from "./index.js";

type LabelledCase = { content: string; expected: boolean };

async function metrics(category: "email" | "phone" | "api_key", cases: LabelledCase[]) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const [index, fixture] of cases.entries()) {
    const decision = await privacyEngine.scan(
      createEnvelope(fixture.content, {
        requestId: `accuracy-${category}-${index}`,
        context: { locale: "en-US", sourceLabel: "synthetic-accuracy" },
      }),
    );
    const detected = decision.detections.some((detection) => detection.category === category);
    if (fixture.expected && detected) truePositive += 1;
    if (!fixture.expected && detected) falsePositive += 1;
    if (fixture.expected && !detected) falseNegative += 1;
  }
  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const recall = truePositive / Math.max(1, truePositive + falseNegative);
  return {
    precision,
    recall,
    f1: (2 * precision * recall) / Math.max(0.000_001, precision + recall),
  };
}

describe("published synthetic accuracy gates", () => {
  it("meets the structured email baseline", async () => {
    const result = await metrics("email", [
      { content: "Contact ada@example.com", expected: true },
      { content: "Write to first.last+tag@sub.example.co.uk", expected: true },
      { content: "Owner: security@example.org", expected: true },
      { content: "The value is user@example", expected: false },
      { content: "Use the @example decorator", expected: false },
      { content: "Explain email address parsing", expected: false },
    ]);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  it("meets the international phone baseline", async () => {
    const result = await metrics("phone", [
      { content: "Call +1 202-555-0147", expected: true },
      { content: "Phone: +44 20 7946 0958", expected: true },
      { content: "Reference 12345", expected: false },
      { content: "Version 2026.08.20", expected: false },
    ]);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
  });

  it("meets the critical API-key baseline and fully redacts selected values", async () => {
    const token = `sk-proj-${"A1b2".repeat(8)}`;
    const result = await metrics("api_key", [
      { content: `OPENAI_API_KEY=${token}`, expected: true },
      { content: `AWS_ACCESS_KEY_ID=AKIA${"A1B2".repeat(4)}`, expected: true },
      { content: "api_key=development", expected: false },
      { content: "token=placeholder", expected: false },
    ]);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);

    const decision = await privacyEngine.scan(createEnvelope(`Use ${token}`));
    expect(decision.sanitizedContent?.["fragment-1"]).not.toContain(token);
    expect(decision.sanitizedContent?.["fragment-1"]).toContain("[API_KEY]");
  });
});
