import {
  BRIDGE_CAPTURE_EVENT,
  BRIDGE_COMMAND_EVENT,
  PageCommandMessageSchema,
  type PageCaptureMessage,
} from "../contracts/messages.js";

type PendingSubmission = {
  form: HTMLFormElement;
  input: HTMLTextAreaElement;
  originalContent: string;
};

export function installControlledMainWorldBridge(): () => void {
  const pending = new Map<string, PendingSubmission>();
  document.documentElement.dataset.privacyGuardHarnessReady = "true";

  const intercept = (event: Event): void => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    if (form.dataset.privacyGuardHarness !== "true") return;
    const input = form.querySelector<HTMLTextAreaElement>("textarea[data-privacy-guard-composer]");
    if (input === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const requestId = crypto.randomUUID();
    const message: PageCaptureMessage = {
      schemaVersion: 1,
      type: "PAGE_CAPTURE",
      requestId,
      content: input.value,
      sourceLabel: "controlled-harness",
    };
    pending.set(requestId, { form, input, originalContent: input.value });
    form.dataset.privacyGuardState = "captured";
    document.dispatchEvent(
      new CustomEvent(BRIDGE_CAPTURE_EVENT, { detail: JSON.stringify(message) }),
    );
  };

  const command = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== "string") return;
    let input: unknown;
    try {
      input = JSON.parse(detail) as unknown;
    } catch {
      return;
    }
    const parsed = PageCommandMessageSchema.safeParse(input);
    if (!parsed.success) return;
    const submission = pending.get(parsed.data.requestId);
    if (submission === undefined) return;
    pending.delete(parsed.data.requestId);
    if (parsed.data.type === "CANCEL") {
      submission.form.dataset.privacyGuardState = "cancelled";
      return;
    }
    submission.input.value = parsed.data.content ?? submission.originalContent;
    submission.form.dataset.privacyGuardState = "resumed";
    document.dispatchEvent(
      new CustomEvent("privacy-guard:harness-transmitted", {
        detail: { requestId: parsed.data.requestId, content: submission.input.value },
      }),
    );
  };

  document.addEventListener("submit", intercept, true);
  document.addEventListener(BRIDGE_COMMAND_EVENT, command);
  return () => {
    pending.clear();
    delete document.documentElement.dataset.privacyGuardHarnessReady;
    document.removeEventListener("submit", intercept, true);
    document.removeEventListener(BRIDGE_COMMAND_EVENT, command);
  };
}
