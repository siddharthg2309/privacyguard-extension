import {
  BRIDGE_CAPTURE_EVENT,
  BRIDGE_COMMAND_EVENT,
  BRIDGE_COMMAND_RESULT_EVENT,
  BRIDGE_STATUS_EVENT,
  PageAdapterStatusSchema,
  PageCaptureMessageSchema,
  PageCommandMessageSchema,
  PageCommandResultSchema,
  type PageAdapterStatus,
  type PageCaptureMessage,
} from "../contracts/messages.js";
import type { SubmissionPort } from "../controller/protection-controller.js";

export class DomSubmissionPort implements SubmissionPort {
  private readonly commandTimeoutMs: number;

  public constructor(commandTimeoutMs = 2_000) {
    this.commandTimeoutMs = commandTimeoutMs;
  }

  public onCapture(listener: (capture: PageCaptureMessage) => void): () => void {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string") return;
      let input: unknown;
      try {
        input = JSON.parse(detail) as unknown;
      } catch {
        return;
      }
      const parsed = PageCaptureMessageSchema.safeParse(input);
      if (parsed.success) listener(parsed.data);
    };
    document.addEventListener(BRIDGE_CAPTURE_EVENT, handler);
    return () => document.removeEventListener(BRIDGE_CAPTURE_EVENT, handler);
  }

  public onStatus(listener: (status: PageAdapterStatus) => void): () => void {
    return this.onSerializedEvent(BRIDGE_STATUS_EVENT, PageAdapterStatusSchema, listener);
  }

  public resume(requestId: string, content: string): Promise<void> {
    return this.dispatch({ schemaVersion: 1, type: "RESUME", requestId, content }, "resumed");
  }

  public cancel(requestId: string): Promise<void> {
    return this.dispatch({ schemaVersion: 1, type: "CANCEL", requestId }, "cancelled");
  }

  private dispatch(input: unknown, expected: "resumed" | "cancelled"): Promise<void> {
    const command = PageCommandMessageSchema.parse(input);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        stop();
        reject(new Error("ADAPTER_COMMAND_TIMEOUT"));
      }, this.commandTimeoutMs);
      const stop = this.onSerializedEvent(
        BRIDGE_COMMAND_RESULT_EVENT,
        PageCommandResultSchema,
        (result) => {
          if (result.requestId !== command.requestId) return;
          clearTimeout(timeout);
          stop();
          if (result.outcome === expected) resolve();
          else reject(new Error(result.errorCode ?? "ADAPTER_COMMAND_FAILED"));
        },
      );
      document.dispatchEvent(
        new CustomEvent(BRIDGE_COMMAND_EVENT, { detail: JSON.stringify(command) }),
      );
    });
  }

  private onSerializedEvent<T>(
    eventName: string,
    schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
    listener: (message: T) => void,
  ): () => void {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string") return;
      let input: unknown;
      try {
        input = JSON.parse(detail) as unknown;
      } catch {
        return;
      }
      const parsed = schema.safeParse(input);
      if (parsed.success) listener(parsed.data);
    };
    document.addEventListener(eventName, handler);
    return () => document.removeEventListener(eventName, handler);
  }
}
