import type { Detection, RiskAssessment } from "@privacy-guard/contracts";
import { describe, expect, it } from "vitest";

import { defaultPolicy, evaluatePolicy } from "./index.js";

const risk: RiskAssessment = { score: 90, level: "critical", reasons: ["SECRET_API_KEY"] };
const criticalSecret: Detection = {
  id: "detection-1",
  category: "api_key",
  detectorId: "test",
  confidence: 1,
  severity: "critical",
  location: { subjectId: "fragment-1", subjectType: "text", start: 0, end: 20 },
  explanationCode: "SECRET_API_KEY",
};

describe("policy evaluation", () => {
  it("blocks critical secrets regardless of a permissive risk action", () => {
    const outcome = evaluatePolicy(risk, [criticalSecret], {
      ...defaultPolicy,
      actions: { ...defaultPolicy.actions, critical: "warn" },
    });
    expect(outcome.action).toBe("block");
  });

  it("keeps critical override disabled by default", () => {
    expect(evaluatePolicy(risk, [criticalSecret]).criticalOverrideAllowed).toBe(false);
  });
});
