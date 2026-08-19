import { useCallback, useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { BrowserStoredStateSchema, type BrowserStoredState } from "../lib/storage/schema.js";

export function useStoredState(): {
  state: BrowserStoredState | undefined;
  refresh: () => Promise<void>;
  error: boolean;
} {
  const [state, setState] = useState<BrowserStoredState>();
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = (await browser.runtime.sendMessage({
        schemaVersion: 1,
        type: "GET_STATE",
      })) as unknown;
      const parsed = BrowserStoredStateSchema.safeParse(
        typeof response === "object" && response !== null && "state" in response
          ? response.state
          : undefined,
      );
      if (!parsed.success) throw new Error("STORAGE_RESPONSE_INVALID");
      setState(parsed.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { state, refresh, error };
}

export async function updateSettings(input: {
  enabled?: boolean;
  allowCriticalOverride?: boolean;
  locale?: string;
}): Promise<void> {
  await browser.runtime.sendMessage({ schemaVersion: 1, type: "UPDATE_SETTINGS", ...input });
}
