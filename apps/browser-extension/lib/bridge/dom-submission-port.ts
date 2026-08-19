import {
  BRIDGE_CAPTURE_EVENT,
  BRIDGE_COMMAND_EVENT,
  PageCaptureMessageSchema,
  PageCommandMessageSchema,
  type PageCaptureMessage,
} from "../contracts/messages.js";
import type { SubmissionPort } from "../controller/protection-controller.js";

export class DomSubmissionPort implements SubmissionPort {
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

  public resume(requestId: string, content: string): Promise<void> {
    this.dispatch({ schemaVersion: 1, type: "RESUME", requestId, content });
    return Promise.resolve();
  }

  public cancel(requestId: string): Promise<void> {
    this.dispatch({ schemaVersion: 1, type: "CANCEL", requestId });
    return Promise.resolve();
  }

  private dispatch(input: unknown): void {
    const command = PageCommandMessageSchema.parse(input);
    document.dispatchEvent(
      new CustomEvent(BRIDGE_COMMAND_EVENT, { detail: JSON.stringify(command) }),
    );
  }
}
