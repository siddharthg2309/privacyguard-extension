import { defaultConfig, type AppConfig } from "@privacy-guard/configuration";
import { normalizeEnvelope } from "@privacy-guard/content-extraction";
import {
  PrivacyDecisionSchema,
  severityRank,
  type ContentEnvelope,
  type Detection,
  type Detector,
  type PrivacyDecision,
} from "@privacy-guard/contracts";
import { classifyAttachments } from "@privacy-guard/file-classification";
import { piiDetector } from "@privacy-guard/pii-detection";
import { evaluatePolicy } from "@privacy-guard/policy-engine";
import { redactFragments } from "@privacy-guard/redaction-engine";
import { assessRisk } from "@privacy-guard/risk-engine";
import { noOpLogger, type SafeLogger } from "@privacy-guard/safe-logging";
import { secretDetector } from "@privacy-guard/secret-detection";

export type PrivacyEngineErrorCode =
  "INPUT_TEXT_LIMIT_EXCEEDED" | "INPUT_ATTACHMENT_LIMIT_EXCEEDED" | "DETECTOR_EXECUTION_FAILED";

export class PrivacyEngineError extends Error {
  public readonly code: PrivacyEngineErrorCode;

  public constructor(code: PrivacyEngineErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PrivacyEngineError";
    this.code = code;
  }
}

export type PrivacyEngineOptions = {
  config?: AppConfig;
  detectors?: readonly Detector[];
  logger?: SafeLogger;
};

function validateLimits(envelope: ContentEnvelope, config: AppConfig): void {
  const totalCharacters = envelope.text.reduce(
    (total, fragment) => total + fragment.content.length,
    0,
  );
  if (totalCharacters > config.scan.maxTextCharacters) {
    throw new PrivacyEngineError(
      "INPUT_TEXT_LIMIT_EXCEEDED",
      "Text input exceeds the configured local scan limit.",
    );
  }

  const oversizedAttachment = envelope.attachments.some(
    ({ sizeBytes }) => sizeBytes !== undefined && sizeBytes > config.scan.maxAttachmentBytes,
  );
  if (oversizedAttachment) {
    throw new PrivacyEngineError(
      "INPUT_ATTACHMENT_LIMIT_EXCEEDED",
      "An attachment exceeds the configured local scan limit.",
    );
  }
}

function deduplicateDetections(detections: readonly Detection[]): Detection[] {
  const byId = new Map<string, Detection>();
  for (const detection of detections) {
    const existing = byId.get(detection.id);
    if (
      existing === undefined ||
      severityRank[detection.severity] > severityRank[existing.severity] ||
      detection.confidence > existing.confidence
    ) {
      byId.set(detection.id, detection);
    }
  }

  return [...byId.values()].sort((left, right) => {
    const subjectDifference = left.location.subjectId.localeCompare(right.location.subjectId);
    return subjectDifference !== 0 ? subjectDifference : left.location.start - right.location.start;
  });
}

export function createPrivacyEngine(options: PrivacyEngineOptions = {}): {
  scan(input: unknown, signal?: AbortSignal): Promise<PrivacyDecision>;
} {
  const config = options.config ?? defaultConfig;
  const detectors = options.detectors ?? [piiDetector, secretDetector];
  const logger = options.logger ?? noOpLogger;

  return {
    scan: async (input, signal) => {
      const envelope = normalizeEnvelope(input);
      validateLimits(envelope, config);
      signal?.throwIfAborted();

      const detected: Detection[] = [];
      try {
        for (const fragment of envelope.text) {
          for (const detector of detectors) {
            if (detector.supports(fragment)) {
              detected.push(...(await detector.detect(fragment, envelope.context, signal)));
            }
          }
        }
      } catch (error) {
        if (signal?.aborted === true) {
          throw error;
        }
        logger.error({
          event: "detector_failure",
          requestId: envelope.requestId,
          errorCode: "DETECTOR_EXECUTION_FAILED",
        });
        throw new PrivacyEngineError(
          "DETECTOR_EXECUTION_FAILED",
          "A local detector failed before a privacy decision could be completed.",
          { cause: error },
        );
      }

      detected.push(...classifyAttachments(envelope.attachments));
      const detections = deduplicateDetections(detected);
      const risk = assessRisk(detections);
      const policy = evaluatePolicy(risk, detections, config.policy);
      const shouldSanitize =
        policy.action !== "allow" &&
        detections.some(({ placeholder }) => placeholder !== undefined);
      const decision: PrivacyDecision = {
        schemaVersion: 1,
        requestId: envelope.requestId,
        riskScore: risk.score,
        riskLevel: risk.level,
        action: policy.action,
        detections,
        explanationCodes: policy.explanationCodes,
        ...(shouldSanitize ? { sanitizedContent: redactFragments(envelope.text, detections) } : {}),
        criticalOverrideAllowed: policy.criticalOverrideAllowed,
      };

      logger.info({
        event: "scan_completed",
        requestId: envelope.requestId,
        count: detections.length,
      });
      return PrivacyDecisionSchema.parse(decision);
    },
  };
}

export const privacyEngine = createPrivacyEngine();
