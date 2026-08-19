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
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
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
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
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
          {scanning && "The prompt is held locally while the privacy engine checks it."}
          {review &&
            "Potentially sensitive details were found. Review the exact sanitized version before continuing."}
          {state.status === "BLOCKED" &&
            "A critical secret or credential was detected. Nothing has been transmitted."}
          {unavailable &&
            "The local scanner could not produce a trustworthy decision. The submission was cancelled."}
        </p>
        {scanning && <div className="progress" aria-label="Scanning locally" />}
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
