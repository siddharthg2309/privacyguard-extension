import type { DecisionAction } from "@privacy-guard/contracts";

import { RuntimeMessageSchema } from "../contracts/messages.js";
import {
  initializeStoredState,
  updateStoredState,
  type StorageAreaPort,
} from "../storage/storage.js";

export function createRuntimeMessageHandler(
  storage: StorageAreaPort,
  clock: () => number = Date.now,
): (input: unknown) => Promise<unknown> {
  let queue = Promise.resolve();
  return async (input: unknown) => {
    const parsed = RuntimeMessageSchema.safeParse(input);
    if (!parsed.success) return { ok: false, errorCode: "INPUT_RUNTIME_MESSAGE_INVALID" };
    const operation = queue.then(async () => {
      const message = parsed.data;
      if (message.type === "GET_STATE") {
        return { ok: true, state: await initializeStoredState(storage) };
      }
      const state = await updateStoredState((current) => {
        switch (message.type) {
          case "UPDATE_SETTINGS":
            return {
              ...current,
              settings: {
                ...current.settings,
                enabled: message.enabled ?? current.settings.enabled,
                locale: message.locale ?? current.settings.locale,
                policy: {
                  ...current.settings.policy,
                  allowCriticalOverride:
                    message.allowCriticalOverride ?? current.settings.policy.allowCriticalOverride,
                },
              },
            };
          case "RECORD_DECISION":
            return {
              ...current,
              counters: incrementCounters(current.counters, message.action),
            };
          case "RECORD_REDACTION":
            return {
              ...current,
              counters: {
                ...current.counters,
                redactions: current.counters.redactions + 1,
              },
            };
          case "SET_COMPATIBILITY":
            return {
              ...current,
              compatibility: {
                ...current.compatibility,
                [message.adapterId]: {
                  status: message.status,
                  checkedAt: clock(),
                  ...(message.errorCode === undefined ? {} : { errorCode: message.errorCode }),
                },
              },
            };
          case "COMPLETE_ONBOARDING":
            return { ...current, onboardingComplete: true };
        }
      }, storage);
      return { ok: true, state };
    });
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
}

function incrementCounters(
  counters: { scans: number; warnings: number; blocks: number; redactions: number },
  action: DecisionAction,
): typeof counters {
  return {
    ...counters,
    scans: counters.scans + 1,
    warnings: counters.warnings + (action === "warn" ? 1 : 0),
    blocks: counters.blocks + (action === "block" ? 1 : 0),
    redactions: counters.redactions + (action === "redact" ? 1 : 0),
  };
}
