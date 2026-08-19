import { browser } from "wxt/browser";

import {
  BrowserStoredStateSchema,
  defaultBrowserStoredState,
  migrateBrowserStoredState,
  type BrowserStoredState,
} from "./schema.js";

export const STORAGE_KEY = "privacyGuardState";

export type StorageAreaPort = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export async function loadStoredState(
  storage: StorageAreaPort = browser.storage.local,
): Promise<BrowserStoredState> {
  const stored = await storage.get(STORAGE_KEY);
  return migrateBrowserStoredState(stored[STORAGE_KEY]);
}

export async function saveStoredState(
  state: BrowserStoredState,
  storage: StorageAreaPort = browser.storage.local,
): Promise<void> {
  await storage.set({ [STORAGE_KEY]: BrowserStoredStateSchema.parse(state) });
}

export async function initializeStoredState(
  storage: StorageAreaPort = browser.storage.local,
): Promise<BrowserStoredState> {
  const stored = await storage.get(STORAGE_KEY);
  const state =
    stored[STORAGE_KEY] === undefined
      ? defaultBrowserStoredState
      : migrateBrowserStoredState(stored[STORAGE_KEY]);
  await saveStoredState(state, storage);
  return state;
}

export async function updateStoredState(
  update: (state: BrowserStoredState) => BrowserStoredState,
  storage: StorageAreaPort = browser.storage.local,
): Promise<BrowserStoredState> {
  const next = BrowserStoredStateSchema.parse(update(await loadStoredState(storage)));
  await saveStoredState(next, storage);
  return next;
}
