import { installChatGptMainWorldAdapter } from "../adapters/chatgpt/main-world-adapter.js";
import { installControlledMainWorldBridge } from "../lib/bridge/main-world-bridge.js";

export default defineUnlistedScript(() => {
  if (import.meta.env.MODE === "e2e" && location.pathname === "/__privacy_guard_harness__") {
    installControlledMainWorldBridge();
    return;
  }
  if (location.hostname === "chatgpt.com" || location.hostname === "chat.openai.com") {
    const isIncompatibleHarness =
      import.meta.env.MODE === "e2e" &&
      location.pathname === "/__privacy_guard_chatgpt_incompatible__";
    installChatGptMainWorldAdapter(isIncompatibleHarness ? { missingGraceMs: 100 } : {});
  }
});
