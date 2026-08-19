import { installControlledMainWorldBridge } from "../lib/bridge/main-world-bridge.js";

export default defineUnlistedScript(() => {
  if (import.meta.env.MODE === "e2e" && location.pathname === "/__privacy_guard_harness__") {
    installControlledMainWorldBridge();
  }
});
