import {
  PolicyConfigSchema,
  type DecisionAction,
  type Detection,
  type PolicyConfig,
  type RiskAssessment,
} from "@privacy-guard/contracts";

export const defaultPolicy: PolicyConfig = {
  schemaVersion: 1,
  allowCriticalOverride: false,
  actions: {
    low: "allow",
    medium: "warn",
    high: "warn",
    critical: "block",
  },
};

export type PolicyOutcome = {
  action: DecisionAction;
  criticalOverrideAllowed: boolean;
  explanationCodes: string[];
};

export function evaluatePolicy(
  risk: RiskAssessment,
  detections: readonly Detection[],
  policyInput: PolicyConfig = defaultPolicy,
): PolicyOutcome {
  const policy = PolicyConfigSchema.parse(policyInput);
  const hasCriticalSecret = detections.some(
    ({ category, severity }) =>
      severity === "critical" &&
      ["api_key", "jwt", "private_key", "database_url", "credential"].includes(category),
  );

  const action = hasCriticalSecret ? "block" : policy.actions[risk.level];
  return {
    action,
    criticalOverrideAllowed: action === "block" && policy.allowCriticalOverride,
    explanationCodes: [...new Set([...risk.reasons, `POLICY_${action.toUpperCase()}`])],
  };
}
