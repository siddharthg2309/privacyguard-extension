import { installChatGptMainWorldAdapter } from "../adapters/chatgpt/main-world-adapter.js";
import { installClaudeMainWorldAdapter } from "../adapters/claude/main-world-adapter.js";
import { installGeminiMainWorldAdapter } from "../adapters/gemini/main-world-adapter.js";
import { installControlledMainWorldBridge } from "../lib/bridge/main-world-bridge.js";

export default defineUnlistedScript(() => {
  if (import.meta.env.MODE === "e2e" && location.pathname === "/__privacy_guard_harness__") {
    installControlledMainWorldBridge();
    return;
  }
  const isIncompatibleHarness =
    import.meta.env.MODE === "e2e" && location.pathname.endsWith("_incompatible__");
  const options = isIncompatibleHarness ? { missingGraceMs: 100 } : {};
  if (location.hostname === "chatgpt.com" || location.hostname === "chat.openai.com") {
    installChatGptMainWorldAdapter(options);
  } else if (location.hostname === "claude.ai") {
    installClaudeMainWorldAdapter(options);
  } else if (location.hostname === "gemini.google.com") {
    installGeminiMainWorldAdapter(options);
  }
});
