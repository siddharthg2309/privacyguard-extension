import {
  BRIDGE_CAPTURE_EVENT,
  BRIDGE_COMMAND_EVENT,
  BRIDGE_COMMAND_RESULT_EVENT,
  BRIDGE_STATUS_EVENT,
  PageCommandMessageSchema,
  type PageAdapterId,
  type PageAttachment,
  type PageCaptureMessage,
} from "../../lib/contracts/messages.js";

export type AdapterSurface = {
  composer: HTMLElement;
  root: HTMLElement;
  sendButton: HTMLButtonElement | null;
  form: HTMLFormElement | null;
};

export type MainWorldAdapterConfig = {
  adapterId: PageAdapterId;
  sourceLabel: string;
  composerSelector: string;
  rootSelector: string;
  sendSelector: string;
  attachmentPreviewSelector: string;
  isSubmissionControl?: (surface: AdapterSurface, button: HTMLButtonElement) => boolean;
  missingGraceMs?: number;
};

type PendingSubmission = AdapterSurface & { originalContent: string };

export function findAdapterSurface(
  config: MainWorldAdapterConfig,
  root: ParentNode = document,
): AdapterSurface | undefined {
  const composer = root.querySelector<HTMLElement>(config.composerSelector);
  if (composer === null) return undefined;
  const boundary = composer.closest<HTMLElement>(config.rootSelector);
  if (boundary === null) return undefined;
  const sendButton = boundary.querySelector<HTMLButtonElement>(config.sendSelector);
  const closestForm = boundary.closest("form") ?? boundary.querySelector("form");
  const form = closestForm instanceof HTMLFormElement ? closestForm : null;
  return { composer, root: boundary, sendButton, form };
}

export function installMainWorldAdapter(config: MainWorldAdapterConfig): () => void {
  const pending = new Map<string, PendingSubmission>();
  const bypassButtons = new WeakSet<HTMLButtonElement>();
  const bypassForms = new WeakSet<HTMLFormElement>();
  const missingGraceMs = config.missingGraceMs ?? 4_000;
  let missingTimer: ReturnType<typeof setTimeout> | undefined;
  let lastStatus: string | undefined;

  const error = (suffix: string): string => `${config.adapterId.toUpperCase()}_${suffix}`;

  const report = (status: "protected" | "protection_unavailable", errorCode?: string): void => {
    const signature = `${status}:${errorCode ?? ""}`;
    if (signature === lastStatus) return;
    lastStatus = signature;
    dispatchSerialized(BRIDGE_STATUS_EVENT, {
      schemaVersion: 1,
      type: "ADAPTER_STATUS",
      adapterId: config.adapterId,
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  };

  const checkCompatibility = (): void => {
    if (findAdapterSurface(config) !== undefined) {
      if (missingTimer !== undefined) clearTimeout(missingTimer);
      missingTimer = undefined;
      report("protected");
      return;
    }
    if (missingTimer !== undefined) return;
    missingTimer = setTimeout(() => {
      missingTimer = undefined;
      if (findAdapterSurface(config) === undefined) {
        report("protection_unavailable", error("COMPOSER_NOT_FOUND"));
      }
    }, missingGraceMs);
  };

  const capture = (surface: AdapterSurface, event: Event): void => {
    const content = readComposer(surface.composer);
    const attachments = collectAttachments(config, surface.root);
    if (content.length === 0 && attachments.length === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const requestId = crypto.randomUUID();
    const message: PageCaptureMessage = {
      schemaVersion: 1,
      type: "PAGE_CAPTURE",
      requestId,
      content,
      sourceLabel: config.sourceLabel,
      attachments,
    };
    pending.set(requestId, { ...surface, originalContent: content });
    dispatchSerialized(BRIDGE_CAPTURE_EVENT, message);
  };

  const onClick = (event: MouseEvent): void => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>(config.sendSelector)
        : null;
    if (target === null) return;
    if (bypassButtons.delete(target)) return;
    const surface = findAdapterSurface(config);
    if (!surface?.root.contains(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      report("protection_unavailable", error("COMPOSER_INCOMPATIBLE"));
      return;
    }
    if (config.isSubmissionControl !== undefined && !config.isSubmissionControl(surface, target)) {
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
    const surface = findAdapterSurface(config);
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
    const surface = findAdapterSurface(config);
    if (surface?.form !== event.target) return;
    capture(surface, event);
  };

  const onCommand = (event: Event): void => {
    const parsed = PageCommandMessageSchema.safeParse(parseSerializedEvent(event));
    if (!parsed.success) return;
    const submission = pending.get(parsed.data.requestId);
    if (submission === undefined) return;
    pending.delete(parsed.data.requestId);
    if (parsed.data.type === "CANCEL") {
      dispatchCommandResult(parsed.data.requestId, "cancelled");
      return;
    }
    if (!submission.composer.isConnected || !submission.root.isConnected) {
      dispatchCommandResult(parsed.data.requestId, "failed", error("COMPOSER_REPLACED"));
      report("protection_unavailable", error("COMPOSER_REPLACED"));
      return;
    }
    const outgoing = parsed.data.content ?? submission.originalContent;
    if (!writeComposer(submission.composer, outgoing)) {
      dispatchCommandResult(parsed.data.requestId, "failed", error("COMPOSER_WRITE_FAILED"));
      report("protection_unavailable", error("COMPOSER_WRITE_FAILED"));
      return;
    }
    const sendButton =
      submission.root.querySelector<HTMLButtonElement>(config.sendSelector) ??
      submission.sendButton;
    if (
      sendButton === null ||
      !sendButton.isConnected ||
      sendButton.disabled ||
      sendButton.getAttribute("aria-disabled") === "true" ||
      (config.isSubmissionControl !== undefined &&
        !config.isSubmissionControl(submission, sendButton))
    ) {
      dispatchCommandResult(parsed.data.requestId, "failed", error("SEND_CONTROL_UNAVAILABLE"));
      report("protection_unavailable", error("SEND_CONTROL_UNAVAILABLE"));
      return;
    }
    bypassButtons.add(sendButton);
    if (submission.form !== null) bypassForms.add(submission.form);
    sendButton.click();
    if (submission.form !== null) bypassForms.delete(submission.form);
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
  // Chromium's editing command is the compatible path for ProseMirror, Tiptap, and Quill.
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

function collectAttachments(config: MainWorldAdapterConfig, root: HTMLElement): PageAttachment[] {
  const attachments = new Map<string, PageAttachment>();
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
    for (const file of input.files ?? []) {
      const key = `${file.name}:${file.size}:${file.type}`;
      attachments.set(key, {
        id: crypto.randomUUID(),
        name: file.name,
        ...(file.type.length === 0 ? {} : { mediaType: file.type }),
        sizeBytes: file.size,
      });
    }
  }
  for (const element of root.querySelectorAll<HTMLElement>(config.attachmentPreviewSelector)) {
    const name =
      element.getAttribute("data-file-name") ??
      element.getAttribute("aria-label") ??
      element.innerText.trim();
    if (name.length > 0) {
      const normalized = name.slice(0, 512);
      if (![...attachments.values()].some((attachment) => attachment.name === normalized)) {
        attachments.set(`preview:${normalized}`, { id: crypto.randomUUID(), name: normalized });
      }
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
