import type { ContentEnvelope, PrivacyDecision } from "@privacy-guard/contracts";

import type { PageCaptureMessage } from "../contracts/messages.js";
import {
  initialProtectionState,
  transitionProtectionState,
  type ProtectionEvent,
  type ProtectionState,
} from "../state/protection-machine.js";

export type ScannerPort = {
  scan(envelope: ContentEnvelope, signal: AbortSignal): Promise<PrivacyDecision>;
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
  submission: SubmissionPort;
  view: ProtectionViewPort;
  recorder?: DecisionRecorderPort;
  onProtectionUnavailable?: (errorCode: string) => Promise<void>;
};

function createBrowserEnvelope(capture: PageCaptureMessage, locale: string): ContentEnvelope {
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
    ],
    attachments: capture.attachments.map((attachment) => ({ ...attachment })),
    context: { locale, sourceLabel: capture.sourceLabel },
    capabilities: {
      canCaptureText: true,
      canCaptureAttachments: false,
      canBlockSubmission: true,
      canResumeSubmission: true,
    },
  };
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

  public async handleCapture(capture: PageCaptureMessage): Promise<void> {
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

    if (capture.attachments.length > 0) {
      const errorCode = "ATTACHMENT_INSPECTION_UNAVAILABLE";
      this.move({ type: "SCAN_FAILED", requestId: capture.requestId, errorCode });
      this.move({ type: "MARK_UNAVAILABLE", requestId: capture.requestId, errorCode });
      await this.options.onProtectionUnavailable?.(errorCode).catch(() => undefined);
      await this.options.submission.cancel(capture.requestId).catch(() => undefined);
      this.options.view.render(this.state, this.actions());
      return;
    }

    const controller = new AbortController();
    this.activeScan = controller;
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Local scan timed out", "TimeoutError")),
      this.options.scanTimeoutMs,
    );
    try {
      const decision = await this.options.scanner.scan(
        createBrowserEnvelope(capture, this.options.locale),
        controller.signal,
      );
      this.move({ type: "SCAN_DECIDED", requestId: capture.requestId, decision });
      await this.options.recorder?.record(decision).catch(() => undefined);
      if (this.getState().status === "SAFE") {
        await this.resume(capture.content);
      } else {
        this.options.view.render(this.state, this.actions());
      }
    } catch (error) {
      if (this.getState().status === "CANCELLED") return;
      const errorCode =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "DETECTOR_TIMEOUT"
          : "DETECTOR_EXECUTION_FAILED";
      this.move({ type: "SCAN_FAILED", requestId: capture.requestId, errorCode });
      this.move({ type: "MARK_UNAVAILABLE", requestId: capture.requestId, errorCode });
      await this.options.onProtectionUnavailable?.(errorCode).catch(() => undefined);
      await this.options.submission.cancel(capture.requestId);
      this.options.view.render(this.state, this.actions());
    } finally {
      clearTimeout(timeout);
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
