import {
  defaultAttachmentProcessingLimits,
  validateAttachmentSet,
  type AttachmentExtractionProgress,
} from "@privacy-guard/content-extraction";
import type { TextFragment } from "@privacy-guard/contracts";

import type {
  AttachmentWorkerRequest,
  AttachmentWorkerResponse,
  CapturedAttachment,
} from "../contracts/messages.js";
import type { AttachmentExtractorPort } from "../controller/protection-controller.js";

type Pending = {
  attachmentId: string;
  resolve(fragment: TextFragment): void;
  reject(error: Error): void;
  onProgress(progress: AttachmentExtractionProgress): void;
};

export class AttachmentWorkerClient implements AttachmentExtractorPort {
  private readonly pending = new Map<string, Pending>();

  public constructor(
    private readonly worker: Worker,
    private readonly extensionBaseUrl: string,
    private readonly timeoutMs = 45_000,
  ) {
    worker.addEventListener("message", (event: MessageEvent<AttachmentWorkerResponse>) =>
      this.handleMessage(event.data),
    );
    worker.addEventListener("error", () => this.failAll("ATTACHMENT_WORKER_CRASHED"));
    worker.addEventListener("messageerror", () =>
      this.failAll("ATTACHMENT_WORKER_MESSAGE_INVALID"),
    );
  }

  public async extract(
    attachments: readonly CapturedAttachment[],
    signal: AbortSignal,
    onProgress: (progress: AttachmentExtractionProgress) => void,
  ): Promise<TextFragment[]> {
    validateAttachmentSet(attachments, defaultAttachmentProcessingLimits);
    const fragments: TextFragment[] = [];
    for (let index = 0; index < attachments.length; index += 1) {
      signal.throwIfAborted();
      const attachment = attachments[index];
      if (attachment?.file === undefined) {
        throw Object.assign(new Error("The selected attachment is no longer readable."), {
          code: "INPUT_ATTACHMENT_UNREADABLE",
        });
      }
      onProgress({
        stage: "reading",
        attachmentId: attachment.id,
        completed: index,
        total: attachments.length,
        progress: 0,
      });
      const data = await attachment.file.arrayBuffer();
      fragments.push(
        await this.extractOne(attachment, data, index, attachments.length, signal, onProgress),
      );
    }
    return fragments;
  }

  public dispose(): void {
    this.failAll("ATTACHMENT_WORKER_DISPOSED");
    this.worker.terminate();
  }

  private extractOne(
    attachment: CapturedAttachment,
    data: ArrayBuffer,
    completed: number,
    total: number,
    signal: AbortSignal,
    onProgress: (progress: AttachmentExtractionProgress) => void,
  ): Promise<TextFragment> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const abort = (): void => {
        cleanup();
        this.worker.postMessage({ schemaVersion: 1, type: "CANCEL_ATTACHMENT", requestId });
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException("Cancelled", "AbortError"),
        );
      };
      const timeout = setTimeout(() => {
        cleanup();
        this.worker.postMessage({ schemaVersion: 1, type: "CANCEL_ATTACHMENT", requestId });
        reject(
          Object.assign(new DOMException("Attachment inspection timed out", "TimeoutError"), {
            code: "ATTACHMENT_TIMEOUT",
          }),
        );
      }, this.timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        this.pending.delete(requestId);
      };
      signal.addEventListener("abort", abort, { once: true });
      this.pending.set(requestId, {
        attachmentId: attachment.id,
        resolve: (fragment) => {
          cleanup();
          resolve(fragment);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
        onProgress: (progress) => onProgress({ ...progress, completed, total }),
      });
      const request: AttachmentWorkerRequest = {
        schemaVersion: 1,
        type: "EXTRACT_ATTACHMENT",
        requestId,
        attachment: {
          id: attachment.id,
          name: attachment.name,
          ...(attachment.mediaType === undefined ? {} : { mediaType: attachment.mediaType }),
          ...(attachment.sizeBytes === undefined ? {} : { sizeBytes: attachment.sizeBytes }),
        },
        data,
        extensionBaseUrl: this.extensionBaseUrl,
      };
      this.worker.postMessage(request, [data]);
    });
  }

  private handleMessage(message: AttachmentWorkerResponse): void {
    const pending = this.pending.get(message.requestId);
    if (pending === undefined) return;
    if (message.type === "ATTACHMENT_PROGRESS") {
      pending.onProgress({
        stage: "ocr",
        attachmentId: pending.attachmentId,
        completed: 0,
        total: 1,
        progress: Math.max(0, Math.min(1, message.progress)),
        ocr: { stage: message.stage, progress: message.progress },
      });
    } else if (message.type === "ATTACHMENT_SUCCESS") {
      pending.resolve(message.fragment);
    } else {
      pending.reject(Object.assign(new Error(message.errorCode), { code: message.errorCode }));
    }
  }

  private failAll(errorCode: string): void {
    for (const pending of [...this.pending.values()]) {
      pending.reject(Object.assign(new Error(errorCode), { code: errorCode }));
    }
  }
}
