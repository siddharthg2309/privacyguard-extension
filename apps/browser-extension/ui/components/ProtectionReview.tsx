import { useEffect, useMemo, useRef } from "react";

import type { ProtectionViewActions } from "../../lib/controller/protection-controller.js";
import type { ProtectionState } from "../../lib/state/protection-machine.js";

export function ProtectionReview({
  state,
  actions,
}: {
  state: ProtectionState;
  actions: ProtectionViewActions;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const visible = [
    "SCANNING",
    "REVIEW_REQUIRED",
    "REDACTING",
    "BLOCKED",
    "PROTECTION_UNAVAILABLE",
  ].includes(state.status);
  const categories = useMemo(
    () => [...new Set(state.decision?.detections.map(({ category }) => category) ?? [])],
    [state.decision],
  );

  useEffect(() => {
    if (!visible) return;
    const container = dialog.current;
    const rootNode = container?.getRootNode();
    const activeElement =
      rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
    const previous = activeElement instanceof HTMLElement ? activeElement : undefined;
    container?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        void actions.cancel();
        return;
      }
      if (event.key !== "Tab" || container === null) return;
      const focusable = [...container.querySelectorAll<HTMLElement>("button, textarea")].filter(
        (element) => !element.hasAttribute("disabled"),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      const focused =
        rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
      if (event.shiftKey && focused === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container?.addEventListener("keydown", handleKey);
    return () => {
      container?.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [actions, visible]);

  if (!visible) return null;
  const scanning = state.status === "SCANNING";
  const review = state.status === "REVIEW_REQUIRED" || state.status === "REDACTING";
  const unavailable = state.status === "PROTECTION_UNAVAILABLE";
  const title = scanning
    ? "Checking before anything leaves"
    : unavailable
      ? "Protection is unavailable"
      : state.status === "BLOCKED"
        ? "This submission is blocked"
        : "Review sensitive details";
  const unavailableDescription =
    state.errorCode?.startsWith("INPUT_") === true
      ? "An attachment could not be safely inspected within the supported format and size limits. Nothing was sent. Remove or replace it and try again."
      : state.errorCode?.startsWith("OCR_") === true || state.errorCode === "ATTACHMENT_TIMEOUT"
        ? "Local image text recognition could not finish safely. Nothing was sent. Remove or replace the attachment and try again."
        : state.errorCode === "ADAPTER_RESUME_FAILED"
          ? "The page changed before the approved content could continue. Nothing was sent; review the current composer and try again."
          : "The local scanner or page adapter could not produce a trustworthy result. The submission was cancelled.";

  return (
    <div className="backdrop">
      <div
        className="dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-guard-title"
        aria-describedby="privacy-guard-description"
      >
        <div className="circuit">Local protection circuit</div>
        <h1 id="privacy-guard-title">{title}</h1>
        <p id="privacy-guard-description" aria-live="polite">
          {scanning &&
            (state.progress?.label ??
              "The prompt is held locally while the privacy engine checks it.")}
          {review &&
            "Potentially sensitive details were found. Review the exact sanitized version before continuing."}
          {state.status === "BLOCKED" &&
            (state.decision?.explanationCodes.includes("ATTACHMENT_REQUIRES_REMOVAL") === true
              ? "Sensitive data was detected inside an attachment. Nothing was transmitted; remove or replace the file before trying again."
              : "A critical secret or credential was detected. Nothing has been transmitted.")}
          {unavailable && unavailableDescription}
        </p>
        {scanning && (
          <div
            className="progress"
            aria-label="Scanning locally"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((state.progress?.value ?? 0) * 100)}
          />
        )}
        {categories.length > 0 && (
          <ul className="risk" aria-label="Detected categories">
            {categories.map((category) => (
              <li key={category}>{category.replaceAll("_", " ")}</li>
            ))}
          </ul>
        )}
        {review && state.decision?.sanitizedContent?.content !== undefined && (
          <>
            <label className="preview-label" htmlFor="privacy-guard-preview">
              Exact outgoing content
            </label>
            <textarea
              id="privacy-guard-preview"
              readOnly
              value={state.decision.sanitizedContent.content}
            />
          </>
        )}
        <div className="actions">
          <button
            className="danger"
            data-autofocus
            type="button"
            onClick={() => void actions.cancel()}
          >
            Cancel submission
          </button>
          {review && (
            <button
              className="primary"
              type="button"
              onClick={() => void actions.redactAndContinue()}
            >
              Send sanitized version
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
