import type { ContentEnvelope, PrivacyDecision } from "@privacy-guard/contracts";
import type { AppConfig } from "@privacy-guard/configuration";

import { WorkerScanResponseSchema, type WorkerScanRequest } from "../contracts/messages.js";
import type { ScannerPort } from "../controller/protection-controller.js";

type PendingScan = {
  resolve(decision: PrivacyDecision): void;
  reject(error: Error): void;
  removeAbortListener(): void;
};

export class WorkerScanner implements ScannerPort {
  private readonly worker: Worker;
  private readonly config: AppConfig;
  private readonly pending = new Map<string, PendingScan>();

  public constructor(worker: Worker, config: AppConfig) {
    this.worker = worker;
    this.config = config;
    worker.addEventListener("message", (event: MessageEvent<unknown>) =>
      this.handleMessage(event.data),
    );
    worker.addEventListener("error", () => this.failAll("DETECTOR_WORKER_CRASHED"));
    worker.addEventListener("messageerror", () => this.failAll("DETECTOR_WORKER_MESSAGE_INVALID"));
  }

  public scan(envelope: ContentEnvelope, signal: AbortSignal): Promise<PrivacyDecision> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException("Cancelled", "AbortError"),
        );
        return;
      }
      const abort = (): void => {
        this.pending.delete(envelope.requestId);
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException("Cancelled", "AbortError"),
        );
      };
      signal.addEventListener("abort", abort, { once: true });
      this.pending.set(envelope.requestId, {
        resolve,
        reject,
        removeAbortListener: () => signal.removeEventListener("abort", abort),
      });
      const request: WorkerScanRequest = {
        schemaVersion: 1,
        type: "SCAN_REQUEST",
        requestId: envelope.requestId,
        envelope,
        config: this.config,
      };
      this.worker.postMessage(request);
    });
  }

  public dispose(): void {
    this.failAll("DETECTOR_WORKER_DISPOSED");
    this.worker.terminate();
  }

  private handleMessage(input: unknown): void {
    const result = WorkerScanResponseSchema.safeParse(input);
    if (!result.success) {
      this.failAll("DETECTOR_WORKER_MESSAGE_INVALID");
      return;
    }
    const pending = this.pending.get(result.data.requestId);
    if (pending === undefined) return;
    this.pending.delete(result.data.requestId);
    pending.removeAbortListener();
    if (result.data.type === "SCAN_SUCCESS") pending.resolve(result.data.decision);
    else pending.reject(new Error(result.data.errorCode));
  }

  private failAll(errorCode: string): void {
    for (const pending of this.pending.values()) {
      pending.removeAbortListener();
      pending.reject(new Error(errorCode));
    }
    this.pending.clear();
  }
}
