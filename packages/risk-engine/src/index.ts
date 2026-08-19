import type {
  Detection,
  DetectionCategory,
  RiskAssessment,
  RiskLevel,
  Severity,
} from "@privacy-guard/contracts";

const categoryWeights: Readonly<Record<DetectionCategory, number>> = {
  email: 30,
  phone: 30,
  person_name: 28,
  address: 32,
  government_id: 45,
  financial_identifier: 45,
  api_key: 55,
  jwt: 55,
  private_key: 70,
  database_url: 55,
  credential: 55,
  sensitive_file: 45,
  personal_image: 20,
};

const severityMultipliers: Readonly<Record<Severity, number>> = {
  low: 0.5,
  medium: 0.75,
  high: 1,
  critical: 1.25,
};

export function levelForScore(score: number): RiskLevel {
  if (score >= 81) {
    return "critical";
  }
  if (score >= 51) {
    return "high";
  }
  if (score >= 21) {
    return "medium";
  }
  return "low";
}

export function assessRisk(detections: readonly Detection[]): RiskAssessment {
  if (detections.length === 0) {
    return { score: 0, level: "low", reasons: [] };
  }

  let rawScore = 0;
  const categories = new Set<DetectionCategory>();
  const reasons = new Set<string>();

  for (const detection of detections) {
    categories.add(detection.category);
    reasons.add(detection.explanationCode);
    const confidenceFactor = 0.5 + detection.confidence * 0.5;
    rawScore +=
      categoryWeights[detection.category] *
      severityMultipliers[detection.severity] *
      confidenceFactor;
  }

  if (categories.size >= 2) {
    rawScore += Math.min(15, (categories.size - 1) * 5);
  }

  const hasCritical = detections.some(({ severity }) => severity === "critical");
  const score = Math.min(100, Math.round(hasCritical ? Math.max(rawScore, 81) : rawScore));

  return {
    score,
    level: levelForScore(score),
    reasons: [...reasons].sort(),
  };
}
