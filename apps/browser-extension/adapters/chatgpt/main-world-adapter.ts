import {
  BRIDGE_CAPTURE_EVENT,
  BRIDGE_COMMAND_EVENT,
  BRIDGE_COMMAND_RESULT_EVENT,
  BRIDGE_STATUS_EVENT,
  PageCommandMessageSchema,
  type PageAttachment,
  type PageCaptureMessage,
} from "../../lib/contracts/messages.js";

const COMPOSER_SELECTOR = '#prompt-textarea[contenteditable="true"][role="textbox"]';
const SEND_SELECTOR = '[data-testid="send-button"], button[aria-label="Send prompt"]';
const ATTACHMENT_SELECTOR = '[data-file-name], [data-testid*="attachment"], [data-testid*="file"]';

type ComposerSurface = {
  composer: HTMLElement;
  form: HTMLFormElement;
  sendButton: HTMLButtonElement | null;
};

type PendingSubmission = ComposerSurface & {
  originalContent: string;
};

export function findChatGptComposer(root: ParentNode = document): ComposerSurface | undefined {
  const composer = root.querySelector<HTMLElement>(COMPOSER_SELECTOR);
  if (composer === null) return undefined;
  const form = composer.closest("form");
  if (!(form instanceof HTMLFormElement)) return undefined;
  const sendButton = form.querySelector<HTMLButtonElement>(SEND_SELECTOR);
  return { composer, form, sendButton };
}

export function installChatGptMainWorldAdapter(
  options: { missingGraceMs?: number } = {},
): () => void {
  const pending = new Map<string, PendingSubmission>();
  const bypassButtons = new WeakSet<HTMLButtonElement>();
  const bypassForms = new WeakSet<HTMLFormElement>();
  const missingGraceMs = options.missingGraceMs ?? 4_000;
  let missingTimer: ReturnType<typeof setTimeout> | undefined;
  let lastStatus: string | undefined;

  const report = (status: "protected" | "protection_unavailable", errorCode?: string): void => {
    const signature = `${status}:${errorCode ?? ""}`;
    if (signature === lastStatus) return;
    lastStatus = signature;
    dispatchSerialized(BRIDGE_STATUS_EVENT, {
      schemaVersion: 1,
      type: "ADAPTER_STATUS",
      adapterId: "chatgpt",
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  };

  const checkCompatibility = (): void => {
    if (findChatGptComposer() !== undefined) {
      if (missingTimer !== undefined) clearTimeout(missingTimer);
      missingTimer = undefined;
      report("protected");
      return;
    }
    if (missingTimer !== undefined) return;
    missingTimer = setTimeout(() => {
      missingTimer = undefined;
      if (findChatGptComposer() === undefined) {
        report("protection_unavailable", "CHATGPT_COMPOSER_NOT_FOUND");
      }
    }, missingGraceMs);
  };

  const capture = (surface: ComposerSurface, event: Event): void => {
    const content = readComposer(surface.composer);
    const attachments = collectAttachments(surface.form);
    if (content.length === 0 && attachments.length === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const requestId = crypto.randomUUID();
    const message: PageCaptureMessage = {
      schemaVersion: 1,
      type: "PAGE_CAPTURE",
      requestId,
      content,
      sourceLabel: "chatgpt-composer",
      attachments,
    };
    pending.set(requestId, { ...surface, originalContent: content });
    dispatchSerialized(BRIDGE_CAPTURE_EVENT, message);
  };

  const onClick = (event: MouseEvent): void => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>(SEND_SELECTOR)
        : null;
    if (target === null) return;
    if (bypassButtons.delete(target)) return;
    const surface = findChatGptComposer();
    if (!surface?.form.contains(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      report("protection_unavailable", "CHATGPT_COMPOSER_INCOMPATIBLE");
      return;
    }
    capture({ ...surface, sendButton: target }, event);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return;
    }
    const surface = findChatGptComposer();
    if (
      surface === undefined ||
      !(event.target instanceof Node) ||
      !surface.composer.contains(event.target)
    ) {
      return;
    }
    capture(surface, event);
  };

  const onSubmit = (event: SubmitEvent): void => {
    if (!(event.target instanceof HTMLFormElement)) return;
    if (bypassForms.delete(event.target)) return;
    const surface = findChatGptComposer();
    if (surface?.form !== event.target) return;
    capture(surface, event);
  };

  const onCommand = (event: Event): void => {
    const input = parseSerializedEvent(event);
    const parsed = PageCommandMessageSchema.safeParse(input);
    if (!parsed.success) return;
    const submission = pending.get(parsed.data.requestId);
    if (submission === undefined) return;
    pending.delete(parsed.data.requestId);
    if (parsed.data.type === "CANCEL") {
      dispatchCommandResult(parsed.data.requestId, "cancelled");
      return;
    }
    if (!submission.composer.isConnected || !submission.form.isConnected) {
      dispatchCommandResult(parsed.data.requestId, "failed", "CHATGPT_COMPOSER_REPLACED");
      report("protection_unavailable", "CHATGPT_COMPOSER_REPLACED");
      return;
    }
    const outgoing = parsed.data.content ?? submission.originalContent;
    if (!writeComposer(submission.composer, outgoing)) {
      dispatchCommandResult(parsed.data.requestId, "failed", "CHATGPT_COMPOSER_WRITE_FAILED");
      report("protection_unavailable", "CHATGPT_COMPOSER_WRITE_FAILED");
      return;
    }
    const sendButton = findChatGptComposer()?.sendButton ?? submission.sendButton;
    if (sendButton === null || !sendButton.isConnected || sendButton.disabled) {
      dispatchCommandResult(parsed.data.requestId, "failed", "CHATGPT_SEND_CONTROL_UNAVAILABLE");
      report("protection_unavailable", "CHATGPT_SEND_CONTROL_UNAVAILABLE");
      return;
    }
    bypassButtons.add(sendButton);
    bypassForms.add(submission.form);
    sendButton.click();
    bypassForms.delete(submission.form);
    dispatchCommandResult(parsed.data.requestId, "resumed");
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener(BRIDGE_COMMAND_EVENT, onCommand);
  const observer = new MutationObserver(checkCompatibility);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  checkCompatibility();

  return () => {
    if (missingTimer !== undefined) clearTimeout(missingTimer);
    pending.clear();
    observer.disconnect();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("submit", onSubmit, true);
    document.removeEventListener(BRIDGE_COMMAND_EVENT, onCommand);
  };
}

function readComposer(composer: HTMLElement): string {
  return composer.innerText.replace(/\n+$/u, "");
}

function writeComposer(composer: HTMLElement, content: string): boolean {
  composer.focus();
  const selection = getSelection();
  if (selection !== null) {
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  // execCommand remains the only Chromium API that updates ProseMirror like trusted editor input.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const inserted = document.execCommand("insertText", false, content);
  if (!inserted || readComposer(composer) !== content) {
    const paragraph = document.createElement("p");
    paragraph.textContent = content;
    composer.replaceChildren(paragraph);
    composer.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: content }),
    );
  }
  return readComposer(composer) === content;
}

function collectAttachments(form: HTMLFormElement): PageAttachment[] {
  const attachments = new Map<string, PageAttachment>();
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
    for (const file of input.files ?? []) {
      attachments.set(file.name, {
        id: crypto.randomUUID(),
        name: file.name,
        ...(file.type.length === 0 ? {} : { mediaType: file.type }),
        sizeBytes: file.size,
      });
    }
  }
  for (const element of form.querySelectorAll<HTMLElement>(ATTACHMENT_SELECTOR)) {
    const name = element.getAttribute("data-file-name") ?? element.innerText.trim();
    if (name.length > 0 && !attachments.has(name)) {
      attachments.set(name, { id: crypto.randomUUID(), name: name.slice(0, 512) });
    }
  }
  return [...attachments.values()].slice(0, 32);
}

function parseSerializedEvent(event: Event): unknown {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== "string") return undefined;
  try {
    return JSON.parse(detail) as unknown;
  } catch {
    return undefined;
  }
}

function dispatchCommandResult(
  requestId: string,
  outcome: "resumed" | "cancelled" | "failed",
  errorCode?: string,
): void {
  dispatchSerialized(BRIDGE_COMMAND_RESULT_EVENT, {
    schemaVersion: 1,
    type: "COMMAND_RESULT",
    requestId,
    outcome,
    ...(errorCode === undefined ? {} : { errorCode }),
  });
}

function dispatchSerialized(eventName: string, message: unknown): void {
  document.dispatchEvent(new CustomEvent(eventName, { detail: JSON.stringify(message) }));
}
