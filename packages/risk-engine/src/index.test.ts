import type { Detection } from "@privacy-guard/contracts";
import { describe, expect, it } from "vitest";

import { assessRisk } from "./index.js";

function detection(overrides: Partial<Detection> = {}): Detection {
  return {
    id: "detection-1",
    category: "email",
    detectorId: "test",
    confidence: 1,
    severity: "medium",
    location: { subjectId: "fragment-1", subjectType: "text", start: 0, end: 4 },
    explanationCode: "TEST",
    ...overrides,
  };
}

describe("risk assessment", () => {
  it("returns a safe baseline for no detections", () => {
    expect(assessRisk([])).toEqual({ score: 0, level: "low", reasons: [] });
  });

  it("raises critical detections to the critical threshold", () => {
    const risk = assessRisk([
      detection({ category: "api_key", severity: "critical", explanationCode: "SECRET_API_KEY" }),
    ]);
    expect(risk.level).toBe("critical");
    expect(risk.score).toBeGreaterThanOrEqual(81);
  });

  it("adds combination risk for distinct categories", () => {
    const one = assessRisk([detection()]);
    const combined = assessRisk([
      detection(),
      detection({ id: "detection-2", category: "phone", explanationCode: "PHONE" }),
    ]);
    expect(combined.score).toBeGreaterThan(one.score);
  });
});
