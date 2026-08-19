import { describe, expect, it } from "vitest";

import { defaultBrowserStoredState } from "../storage/schema.js";
import { STORAGE_KEY, type StorageAreaPort } from "../storage/storage.js";
import { createRuntimeMessageHandler } from "./runtime.js";

function memoryStorage(): StorageAreaPort {
  const values: Record<string, unknown> = { [STORAGE_KEY]: defaultBrowserStoredState };
  return {
    get: (key) => Promise.resolve({ [key]: values[key] }),
    set: (items) => {
      Object.assign(values, items);
      return Promise.resolve();
    },
  };
}

describe("background runtime", () => {
  it("serializes concurrent aggregate updates without storing content", async () => {
    const handle = createRuntimeMessageHandler(memoryStorage(), () => 42);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        handle({ schemaVersion: 1, type: "RECORD_DECISION", action: "warn" }),
      ),
    );
    const response = (await handle({ schemaVersion: 1, type: "GET_STATE" })) as {
      state: typeof defaultBrowserStoredState;
    };
    expect(response.state.counters).toMatchObject({ scans: 10, warnings: 10 });
    expect(JSON.stringify(response)).not.toContain("prompt");
  });

  it("rejects unknown boundary messages", async () => {
    const handle = createRuntimeMessageHandler(memoryStorage());
    await expect(handle({ type: "RAW_PROMPT", content: "secret" })).resolves.toEqual({
      ok: false,
      errorCode: "INPUT_RUNTIME_MESSAGE_INVALID",
    });
  });

  it("preserves state when the Manifest V3 service worker restarts", async () => {
    const storage = memoryStorage();
    const firstWorker = createRuntimeMessageHandler(storage, () => 42);
    await firstWorker({ schemaVersion: 1, type: "UPDATE_SETTINGS", enabled: false });
    await firstWorker({ schemaVersion: 1, type: "RECORD_DECISION", action: "block" });

    const restartedWorker = createRuntimeMessageHandler(storage, () => 84);
    const response = (await restartedWorker({ schemaVersion: 1, type: "GET_STATE" })) as {
      state: typeof defaultBrowserStoredState;
    };
    expect(response.state.settings.enabled).toBe(false);
    expect(response.state.counters).toMatchObject({ scans: 1, blocks: 1 });
  });

  it("records a user-approved redaction without retaining its content", async () => {
    const handle = createRuntimeMessageHandler(memoryStorage());
    await handle({ schemaVersion: 1, type: "RECORD_REDACTION" });
    const response = (await handle({ schemaVersion: 1, type: "GET_STATE" })) as {
      state: typeof defaultBrowserStoredState;
    };
    expect(response.state.counters.redactions).toBe(1);
    expect(JSON.stringify(response)).not.toContain("content");
  });
});
