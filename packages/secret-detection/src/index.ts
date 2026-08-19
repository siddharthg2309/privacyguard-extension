import {
  createDetectionId,
  type Detection,
  type DetectionCategory,
  type Detector,
  type Severity,
  type TextFragment,
} from "@privacy-guard/contracts";

const DETECTOR_ID = "builtin-secrets";
const DETECTOR_VERSION = "0.1.0";

type SecretPattern = {
  category: DetectionCategory;
  confidence: number;
  explanationCode: string;
  pattern: RegExp;
  placeholder: string;
  severity: Severity;
};

const secretPatterns: readonly SecretPattern[] = [
  {
    category: "private_key",
    confidence: 1,
    explanationCode: "SECRET_PRIVATE_KEY",
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/gu,
    placeholder: "[PRIVATE_KEY]",
    severity: "critical",
  },
  {
    category: "jwt",
    confidence: 0.98,
    explanationCode: "SECRET_JWT",
    pattern:
      /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_-])/gu,
    placeholder: "[JWT]",
    severity: "critical",
  },
  {
    category: "api_key",
    confidence: 0.99,
    explanationCode: "SECRET_AWS_ACCESS_KEY",
    pattern: /(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])/gu,
    placeholder: "[API_KEY]",
    severity: "critical",
  },
  {
    category: "api_key",
    confidence: 0.98,
    explanationCode: "SECRET_OPENAI_KEY",
    pattern: /(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/gu,
    placeholder: "[API_KEY]",
    severity: "critical",
  },
  {
    category: "api_key",
    confidence: 0.99,
    explanationCode: "SECRET_GITHUB_TOKEN",
    pattern:
      /(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})(?![A-Za-z0-9_])/gu,
    placeholder: "[API_KEY]",
    severity: "critical",
  },
  {
    category: "api_key",
    confidence: 0.98,
    explanationCode: "SECRET_GOOGLE_API_KEY",
    pattern: /(?<![A-Za-z0-9_-])AIza[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/gu,
    placeholder: "[API_KEY]",
    severity: "critical",
  },
  {
    category: "credential",
    confidence: 0.98,
    explanationCode: "SECRET_SLACK_TOKEN",
    pattern: /(?<![A-Za-z0-9-])xox[baprs]-[A-Za-z0-9-]{20,}(?![A-Za-z0-9-])/gu,
    placeholder: "[CREDENTIAL]",
    severity: "critical",
  },
  {
    category: "database_url",
    confidence: 0.96,
    explanationCode: "SECRET_DATABASE_URL",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/giu,
    placeholder: "[DATABASE_URL]",
    severity: "critical",
  },
];

function createDetection(
  fragment: TextFragment,
  pattern: SecretPattern,
  start: number,
  end: number,
): Detection {
  return {
    id: createDetectionId(DETECTOR_ID, fragment.id, start, end, pattern.category),
    category: pattern.category,
    detectorId: DETECTOR_ID,
    confidence: pattern.confidence,
    severity: pattern.severity,
    location: {
      subjectId: fragment.id,
      subjectType: "text",
      start,
      end,
    },
    explanationCode: pattern.explanationCode,
    placeholder: pattern.placeholder,
  };
}

export function shannonEntropy(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }

  let entropy = 0;
  for (const frequency of frequencies.values()) {
    const probability = frequency / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function detectKnownPatterns(fragment: TextFragment): Detection[] {
  const detections: Detection[] = [];
  for (const pattern of secretPatterns) {
    for (const match of fragment.content.matchAll(pattern.pattern)) {
      detections.push(
        createDetection(fragment, pattern, match.index, match.index + match[0].length),
      );
    }
  }
  return detections;
}

function detectGenericAssignments(fragment: TextFragment): Detection[] {
  const assignmentPattern =
    /\b(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret)\b\s*[:=]\s*["']?([A-Za-z0-9_./+~-]{16,})["']?/giu;
  const detections: Detection[] = [];

  for (const match of fragment.content.matchAll(assignmentPattern)) {
    const value = match[1];
    if (value === undefined || shannonEntropy(value) < 3.2) {
      continue;
    }
    const relativeStart = match[0].lastIndexOf(value);
    const start = match.index + relativeStart;
    const pattern: SecretPattern = {
      category: "credential",
      confidence: 0.86,
      explanationCode: "SECRET_CONTEXTUAL_HIGH_ENTROPY",
      pattern: /(?:)/gu,
      placeholder: "[CREDENTIAL]",
      severity: "critical",
    };
    detections.push(createDetection(fragment, pattern, start, start + value.length));
  }

  return detections;
}

export function detectSecrets(fragment: TextFragment): Detection[] {
  return [...detectKnownPatterns(fragment), ...detectGenericAssignments(fragment)];
}

export const secretDetector: Detector = {
  id: DETECTOR_ID,
  version: DETECTOR_VERSION,
  supports: () => true,
  detect: (fragment, _context, signal) => {
    signal?.throwIfAborted();
    return Promise.resolve(detectSecrets(fragment));
  },
};
