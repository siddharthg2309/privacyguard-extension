import { createEnvelope } from "@privacy-guard/testing-fixtures";
import { privacyEngine } from "@privacy-guard/privacy-engine";
import { describe, expect, it } from "vitest";

import {
  initialProtectionState,
  transitionProtectionState,
  type ProtectionState,
} from "./protection-machine.js";

function advance(
  state: ProtectionState,
  event: Parameters<typeof transitionProtectionState>[1],
): ProtectionState {
  const result = transitionProtectionState(state, event);
  expect(result.ok).toBe(true);
  return result.state;
}

describe("protection state machine", () => {
  it("moves a safe request through a single resume path", async () => {
    const requestId = crypto.randomUUID();
    const decision = await privacyEngine.scan(
      createEnvelope("Explain binary search.", { requestId }),
    );
    let state = advance(initialProtectionState, { type: "INTERCEPT", requestId });
    state = advance(state, { type: "CAPTURE", requestId, content: "Explain binary search." });
    state = advance(state, { type: "START_SCAN", requestId });
    state = advance(state, { type: "SCAN_DECIDED", requestId, decision });
    expect(state.status).toBe("SAFE");
    state = advance(state, { type: "REQUEST_RESUME", requestId });
    state = advance(state, { type: "RESUME_SUCCEEDED", requestId });
    expect(state.status).toBe("COMPLETE");
  });

  it("cannot resume after a worker failure", () => {
    const requestId = crypto.randomUUID();
    let state = advance(initialProtectionState, { type: "INTERCEPT", requestId });
    state = advance(state, { type: "CAPTURE", requestId, content: "sensitive" });
    state = advance(state, { type: "START_SCAN", requestId });
    state = advance(state, { type: "SCAN_FAILED", requestId, errorCode: "DETECTOR_TIMEOUT" });
    state = advance(state, { type: "MARK_UNAVAILABLE", requestId, errorCode: "DETECTOR_TIMEOUT" });
    expect(transitionProtectionState(state, { type: "REQUEST_RESUME", requestId })).toMatchObject({
      ok: false,
      errorCode: "STATE_INVALID_TRANSITION",
    });
  });

  it("moves a failed adapter acknowledgement to protection unavailable", async () => {
    const requestId = crypto.randomUUID();
    const decision = await privacyEngine.scan(createEnvelope("Safe prompt", { requestId }));
    let state = advance(initialProtectionState, { type: "INTERCEPT", requestId });
    state = advance(state, { type: "CAPTURE", requestId, content: "Safe prompt" });
    state = advance(state, { type: "START_SCAN", requestId });
    state = advance(state, { type: "SCAN_DECIDED", requestId, decision });
    state = advance(state, { type: "REQUEST_RESUME", requestId });
    state = advance(state, {
      type: "RESUME_FAILED",
      requestId,
      errorCode: "ADAPTER_RESUME_FAILED",
    });
    expect(state).toMatchObject({
      status: "PROTECTION_UNAVAILABLE",
      errorCode: "ADAPTER_RESUME_FAILED",
    });
  });

  it("rejects stale request identifiers", () => {
    const requestId = crypto.randomUUID();
    const state = advance(initialProtectionState, { type: "INTERCEPT", requestId });
    expect(
      transitionProtectionState(state, {
        type: "CAPTURE",
        requestId: crypto.randomUUID(),
        content: "different request",
      }),
    ).toMatchObject({ ok: false, errorCode: "STATE_REQUEST_MISMATCH" });
  });
});
