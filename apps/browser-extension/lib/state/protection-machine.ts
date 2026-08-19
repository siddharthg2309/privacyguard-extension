import type { PrivacyDecision } from "@privacy-guard/contracts";

type Status =
  | "IDLE"
  | "INTERCEPTING"
  | "CAPTURING_CONTENT"
  | "SCANNING"
  | "SAFE"
  | "REVIEW_REQUIRED"
  | "REDACTING"
  | "BLOCKED"
  | "RESUMING"
  | "COMPLETE"
  | "CANCELLED"
  | "FAILED"
  | "PROTECTION_UNAVAILABLE";

export type ProtectionState = {
  status: Status;
  requestId?: string;
  originalContent?: string;
  decision?: PrivacyDecision;
  errorCode?: string;
};

export type ProtectionEvent =
  | { type: "INTERCEPT"; requestId: string }
  | { type: "CAPTURE"; requestId: string; content: string }
  | { type: "START_SCAN"; requestId: string }
  | { type: "SCAN_DECIDED"; requestId: string; decision: PrivacyDecision }
  | { type: "SCAN_FAILED"; requestId: string; errorCode: string }
  | { type: "MARK_UNAVAILABLE"; requestId: string; errorCode: string }
  | { type: "REQUEST_REDACTION"; requestId: string }
  | { type: "REQUEST_RESUME"; requestId: string }
  | { type: "RESUME_SUCCEEDED"; requestId: string }
  | { type: "RESUME_FAILED"; requestId: string; errorCode: string }
  | { type: "CANCEL"; requestId: string }
  | { type: "RESET" };

export type TransitionResult =
  | { ok: true; state: ProtectionState }
  | {
      ok: false;
      state: ProtectionState;
      errorCode: "STATE_INVALID_TRANSITION" | "STATE_REQUEST_MISMATCH";
    };

export const initialProtectionState: ProtectionState = { status: "IDLE" };

function sameRequest(
  state: ProtectionState,
  event: Exclude<ProtectionEvent, { type: "RESET" }>,
): boolean {
  return state.requestId === undefined || state.requestId === event.requestId;
}

function success(state: ProtectionState): TransitionResult {
  return { ok: true, state };
}

function invalid(state: ProtectionState): TransitionResult {
  return { ok: false, state, errorCode: "STATE_INVALID_TRANSITION" };
}

export function transitionProtectionState(
  state: ProtectionState,
  event: ProtectionEvent,
): TransitionResult {
  if (event.type === "RESET") {
    return ["COMPLETE", "CANCELLED", "PROTECTION_UNAVAILABLE"].includes(state.status)
      ? success(initialProtectionState)
      : invalid(state);
  }
  if (!sameRequest(state, event)) {
    return { ok: false, state, errorCode: "STATE_REQUEST_MISMATCH" };
  }

  switch (event.type) {
    case "INTERCEPT":
      return state.status === "IDLE"
        ? success({ status: "INTERCEPTING", requestId: event.requestId })
        : invalid(state);
    case "CAPTURE":
      return state.status === "INTERCEPTING"
        ? success({
            status: "CAPTURING_CONTENT",
            requestId: event.requestId,
            originalContent: event.content,
          })
        : invalid(state);
    case "START_SCAN":
      return state.status === "CAPTURING_CONTENT"
        ? success({ ...state, status: "SCANNING" })
        : invalid(state);
    case "SCAN_DECIDED": {
      if (state.status !== "SCANNING") return invalid(state);
      const status =
        event.decision.action === "allow"
          ? "SAFE"
          : event.decision.action === "block"
            ? "BLOCKED"
            : "REVIEW_REQUIRED";
      return success({ ...state, status, decision: event.decision });
    }
    case "SCAN_FAILED":
      return state.status === "SCANNING"
        ? success({ ...state, status: "FAILED", errorCode: event.errorCode })
        : invalid(state);
    case "MARK_UNAVAILABLE":
      return state.status === "FAILED"
        ? success({ ...state, status: "PROTECTION_UNAVAILABLE", errorCode: event.errorCode })
        : invalid(state);
    case "REQUEST_REDACTION":
      return state.status === "REVIEW_REQUIRED" && state.decision?.sanitizedContent !== undefined
        ? success({ ...state, status: "REDACTING" })
        : invalid(state);
    case "REQUEST_RESUME":
      return state.status === "SAFE" || state.status === "REDACTING"
        ? success({ ...state, status: "RESUMING" })
        : invalid(state);
    case "RESUME_SUCCEEDED":
      return state.status === "RESUMING"
        ? success({ ...state, status: "COMPLETE" })
        : invalid(state);
    case "RESUME_FAILED":
      return state.status === "RESUMING"
        ? success({ ...state, status: "PROTECTION_UNAVAILABLE", errorCode: event.errorCode })
        : invalid(state);
    case "CANCEL":
      return [
        "INTERCEPTING",
        "CAPTURING_CONTENT",
        "SCANNING",
        "REVIEW_REQUIRED",
        "BLOCKED",
        "FAILED",
        "PROTECTION_UNAVAILABLE",
      ].includes(state.status)
        ? success({ ...state, status: "CANCELLED" })
        : invalid(state);
  }
}
