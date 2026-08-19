import type { AttachmentExtractionProgress } from "@privacy-guard/content-extraction";
import type { ContentEnvelope, PrivacyDecision, TextFragment } from "@privacy-guard/contracts";

import type { CapturedAttachment, CapturedPageSubmission } from "../contracts/messages.js";
import {
  initialProtectionState,
  transitionProtectionState,
  type ProtectionEvent,
  type ProtectionState,
} from "../state/protection-machine.js";

export type ScannerPort = {
  scan(envelope: ContentEnvelope, signal: AbortSignal): Promise<PrivacyDecision>;
};

export type AttachmentExtractorPort = {
  extract(
    attachments: readonly CapturedAttachment[],
    signal: AbortSignal,
    onProgress: (progress: AttachmentExtractionProgress) => void,
  ): Promise<TextFragment[]>;
};

export type SubmissionPort = {
  resume(requestId: string, content: string): Promise<void>;
  cancel(requestId: string): Promise<void>;
};

export type ProtectionViewActions = {
  redactAndContinue(): Promise<void>;
  cancel(): Promise<void>;
};

export type ProtectionViewPort = {
  render(state: ProtectionState, actions: ProtectionViewActions): void;
};

export type DecisionRecorderPort = {
  record(decision: PrivacyDecision): Promise<void>;
  recordRedaction?(): Promise<void>;
};

export type ProtectionControllerOptions = {
  locale: string;
  scanTimeoutMs: number;
  scanner: ScannerPort;
  attachmentExtractor?: AttachmentExtractorPort;
  submission: SubmissionPort;
  view: ProtectionViewPort;
  recorder?: DecisionRecorderPort;
  onProtectionUnavailable?: (errorCode: string) => Promise<void>;
};

function createBrowserEnvelope(
  capture: CapturedPageSubmission,
  locale: string,
  attachmentText: readonly TextFragment[],
): ContentEnvelope {
  return {
    schemaVersion: 1,
    requestId: capture.requestId,
    source: "browser",
    text: [
      {
        id: "content",
        kind: "prompt",
        content: capture.content,
        label: capture.sourceLabel,
      },
      ...attachmentText,
    ],
    attachments: capture.attachments.map((attachment) => ({ ...attachment })),
    context: { locale, sourceLabel: capture.sourceLabel },
    capabilities: {
      canCaptureText: true,
      canCaptureAttachments: true,
      canBlockSubmission: true,
      canResumeSubmission: true,
    },
  };
}

function forceAttachmentBlock(decision: PrivacyDecision): PrivacyDecision {
  const attachmentDetection = decision.detections.some(
    ({ location }) =>
      location.subjectType === "attachment" || location.subjectId.startsWith("attachment:"),
  );
  if (!attachmentDetection) return decision;
  const blocked = structuredClone(decision);
  delete blocked.sanitizedContent;
  return {
    ...blocked,
    action: "block",
    explanationCodes: [...new Set([...decision.explanationCodes, "ATTACHMENT_REQUIRES_REMOVAL"])],
    criticalOverrideAllowed: false,
  };
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return error instanceof DOMException && error.name === "TimeoutError"
    ? "DETECTOR_TIMEOUT"
    : "DETECTOR_EXECUTION_FAILED";
}

export class ProtectionController {
  private state: ProtectionState = initialProtectionState;
  private readonly options: ProtectionControllerOptions;
  private activeScan: AbortController | undefined;

  public constructor(options: ProtectionControllerOptions) {
    this.options = options;
  }

  public getState(): ProtectionState {
    return this.state;
  }

  public async handleCapture(capture: CapturedPageSubmission): Promise<void> {
    if (this.state.status === "COMPLETE" || this.state.status === "CANCELLED") {
      this.move({ type: "RESET" });
    }
    if (this.state.status !== "IDLE") {
      await this.options.submission.cancel(capture.requestId);
      return;
    }
    this.move({ type: "INTERCEPT", requestId: capture.requestId });
    this.move({ type: "CAPTURE", requestId: capture.requestId, content: capture.content });
    this.move({ type: "START_SCAN", requestId: capture.requestId });
    this.options.view.render(this.state, this.actions());

    const controller = new AbortController();
    this.activeScan = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const attachmentExtractor = this.options.attachmentExtractor;
      let attachmentText: TextFragment[] = [];
      if (capture.attachments.length > 0) {
        if (attachmentExtractor === undefined) {
          throw Object.assign(new Error("Attachment extraction is unavailable."), {
            code: "ATTACHMENT_INSPECTION_UNAVAILABLE",
          });
        }
        attachmentText = await attachmentExtractor.extract(
          capture.attachments,
          controller.signal,
          (progress) => {
            const current = progress.completed + progress.progress;
            this.move({
              type: "SCAN_PROGRESS",
              requestId: capture.requestId,
              label: `Inspecting attachment ${Math.min(progress.completed + 1, progress.total)} of ${progress.total} locally`,
              value: progress.total === 0 ? 0 : current / progress.total,
            });
            this.options.view.render(this.state, this.actions());
          },
        );
      }
      this.move({
        type: "SCAN_PROGRESS",
        requestId: capture.requestId,
        label: "Checking locally for sensitive data",
        value: capture.attachments.length === 0 ? 0 : 0.95,
      });
      timeout = setTimeout(
        () => controller.abort(new DOMException("Local scan timed out", "TimeoutError")),
        this.options.scanTimeoutMs,
      );
      const scanned = await this.options.scanner.scan(
        createBrowserEnvelope(capture, this.options.locale, attachmentText),
        controller.signal,
      );
      const decision = forceAttachmentBlock(scanned);
      this.move({ type: "SCAN_DECIDED", requestId: capture.requestId, decision });
      await this.options.recorder?.record(decision).catch(() => undefined);
      if (this.getState().status === "SAFE") {
        await this.resume(capture.content);
      } else {
        this.options.view.render(this.state, this.actions());
      }
    } catch (error) {
      if (this.getState().status === "CANCELLED") return;
      const code = errorCode(error);
      this.move({ type: "SCAN_FAILED", requestId: capture.requestId, errorCode: code });
      this.move({ type: "MARK_UNAVAILABLE", requestId: capture.requestId, errorCode: code });
      await this.options.onProtectionUnavailable?.(code).catch(() => undefined);
      await this.options.submission.cancel(capture.requestId);
      this.options.view.render(this.state, this.actions());
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (this.activeScan === controller) this.activeScan = undefined;
    }
  }

  public async redactAndContinue(): Promise<void> {
    const requestId = this.state.requestId;
    const sanitized = this.state.decision?.sanitizedContent?.content;
    if (requestId === undefined || sanitized === undefined) return;
    this.move({ type: "REQUEST_REDACTION", requestId });
    this.options.view.render(this.state, this.actions());
    await this.options.recorder?.recordRedaction?.().catch(() => undefined);
    await this.resume(sanitized);
  }

  public async cancel(): Promise<void> {
    const requestId = this.state.requestId;
    if (requestId === undefined) return;
    this.activeScan?.abort(new DOMException("Cancelled", "AbortError"));
    this.move({ type: "CANCEL", requestId });
    await this.options.submission.cancel(requestId);
    this.options.view.render(this.state, this.actions());
  }

  private actions(): ProtectionViewActions {
    return {
      redactAndContinue: () => this.redactAndContinue(),
      cancel: () => this.cancel(),
    };
  }

  private async resume(content: string): Promise<void> {
    const requestId = this.state.requestId;
    if (requestId === undefined) return;
    this.move({ type: "REQUEST_RESUME", requestId });
    try {
      await this.options.submission.resume(requestId, content);
      this.move({ type: "RESUME_SUCCEEDED", requestId });
    } catch {
      const errorCode = "ADAPTER_RESUME_FAILED";
      this.move({ type: "RESUME_FAILED", requestId, errorCode });
      await this.options.onProtectionUnavailable?.(errorCode).catch(() => undefined);
    }
    this.options.view.render(this.state, this.actions());
  }

  private move(event: ProtectionEvent): void {
    const result = transitionProtectionState(this.state, event);
    if (!result.ok) throw new Error(result.errorCode);
    this.state = result.state;
  }
}
