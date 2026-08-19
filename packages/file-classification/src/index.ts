import {
  createDetectionId,
  type AttachmentDescriptor,
  type Detection,
  type Severity,
} from "@privacy-guard/contracts";

const DETECTOR_ID = "builtin-file-classifier";

type SensitivePathRule = {
  explanationCode: string;
  pattern: RegExp;
  severity: Severity;
};

const sensitivePathRules: readonly SensitivePathRule[] = [
  {
    explanationCode: "FILE_ENV_CONFIGURATION",
    pattern: /(?:^|\/)\.env(?:\.[^/]*)?$/iu,
    severity: "critical",
  },
  {
    explanationCode: "FILE_CREDENTIALS",
    pattern: /(?:^|\/)(?:credentials?|secrets?)(?:\.[^/]*)?$/iu,
    severity: "critical",
  },
  {
    explanationCode: "FILE_PRIVATE_KEY",
    pattern: /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx))$/iu,
    severity: "critical",
  },
  {
    explanationCode: "FILE_PRODUCTION_EXPORT",
    pattern: /(?:^|\/)(?:prod(?:uction)?|customer)[^/]*\.(?:sql|csv|json|xlsx)$/iu,
    severity: "high",
  },
];

function normalizePath(attachment: AttachmentDescriptor): string {
  return (attachment.path ?? attachment.name).replaceAll("\\", "/");
}

export function classifyAttachment(attachment: AttachmentDescriptor): Detection[] {
  const path = normalizePath(attachment);
  return sensitivePathRules.flatMap((rule) => {
    if (!rule.pattern.test(path)) {
      return [];
    }
    return [
      {
        id: createDetectionId(DETECTOR_ID, attachment.id, 0, 0, "sensitive_file"),
        category: "sensitive_file" as const,
        detectorId: DETECTOR_ID,
        confidence: 0.98,
        severity: rule.severity,
        location: {
          subjectId: attachment.id,
          subjectType: "attachment" as const,
          start: 0,
          end: 0,
        },
        explanationCode: rule.explanationCode,
      },
    ];
  });
}

export function classifyAttachments(attachments: readonly AttachmentDescriptor[]): Detection[] {
  return attachments.flatMap(classifyAttachment);
}
