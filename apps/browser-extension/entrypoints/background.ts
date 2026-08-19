import { browser } from "wxt/browser";

import { createRuntimeMessageHandler } from "../lib/background/runtime.js";
import { initializeStoredState } from "../lib/storage/storage.js";

export default defineBackground(() => {
  const handleMessage = createRuntimeMessageHandler(browser.storage.local);
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    void handleMessage(message).then(sendResponse);
    return true;
  });

  browser.runtime.onInstalled.addListener((details) => {
    void initializeStoredState().then(async (state) => {
      if (details.reason === "install" && !state.onboardingComplete) {
        await browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html") });
      }
    });
  });

  void initializeStoredState();
});
