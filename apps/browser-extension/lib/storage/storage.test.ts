import { describe, expect, it } from "vitest";

import { defaultBrowserStoredState, migrateBrowserStoredState } from "./schema.js";
import {
  initializeStoredState,
  loadStoredState,
  STORAGE_KEY,
  updateStoredState,
  type StorageAreaPort,
} from "./storage.js";

function memoryStorage(initial: Record<string, unknown> = {}): StorageAreaPort {
  const values = { ...initial };
  return {
    get: (key) => Promise.resolve({ [key]: values[key] }),
    set: (items) => {
      Object.assign(values, items);
      return Promise.resolve();
    },
  };
}

describe("browser local storage", () => {
  it("migrates legacy settings deterministically", () => {
    expect(
      migrateBrowserStoredState({ enabled: false, allowCriticalOverride: true }),
    ).toMatchObject({
      schemaVersion: 1,
      settings: { enabled: false, policy: { allowCriticalOverride: true } },
    });
  });

  it("initialization is idempotent across service-worker restarts", async () => {
    const storage = memoryStorage();
    expect(await initializeStoredState(storage)).toEqual(defaultBrowserStoredState);
    expect(await initializeStoredState(storage)).toEqual(defaultBrowserStoredState);
    expect(await loadStoredState(storage)).toEqual(defaultBrowserStoredState);
  });

  it("persists only schema-valid aggregate state", async () => {
    const storage = memoryStorage({ [STORAGE_KEY]: defaultBrowserStoredState });
    const updated = await updateStoredState(
      (state) => ({ ...state, counters: { ...state.counters, scans: state.counters.scans + 1 } }),
      storage,
    );
    expect(updated.counters.scans).toBe(1);
    expect(JSON.stringify(updated)).not.toContain("prompt");
  });
});
