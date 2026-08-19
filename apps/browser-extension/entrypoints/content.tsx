import { defaultConfig } from "@privacy-guard/configuration";
import { browser } from "wxt/browser";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { injectScript } from "wxt/utils/inject-script";

import ScannerWorker from "../workers/scanning.worker?worker&inline";
import { DomSubmissionPort } from "../lib/bridge/dom-submission-port.js";
import { ProtectionController, type ScannerPort } from "../lib/controller/protection-controller.js";
import { loadStoredState } from "../lib/storage/storage.js";
import { WorkerScanner } from "../lib/workers/worker-scanner.js";
import shadowStyles from "../ui/shadow.css?inline";
import { mountProtectionView } from "../ui/mount-protection-view.js";

const matches = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
];

function adapterForHost(hostname: string): "chatgpt" | "claude" | "gemini" {
  if (hostname === "claude.ai") return "claude";
  if (hostname === "gemini.google.com") return "gemini";
  return "chatgpt";
}

export default defineContentScript({
  matches,
  runAt: "document_start",
  cssInjectionMode: "ui",
  main: async (ctx) => {
    const stored = await loadStoredState();
    const adapterId = adapterForHost(location.hostname);
    const isControlledHarness =
      import.meta.env.MODE === "e2e" && location.pathname === "/__privacy_guard_harness__";
    if (!stored.settings.enabled) {
      await browser.runtime.sendMessage({
        schemaVersion: 1,
        type: "SET_COMPATIBILITY",
        adapterId,
        status: "unsupported",
        errorCode: "ADAPTER_PROTECTION_DISABLED",
      });
      return;
    }
    const ui = await createShadowRootUi(ctx, {
      name: "privacy-guard-review",
      position: "modal",
      zIndex: 2_147_483_647,
      css: shadowStyles,
      isolateEvents: true,
      onMount: (container) => mountProtectionView(container),
      onRemove: (mounted) => mounted?.unmount(),
    });
    ui.mount();
    const view = ui.mounted;
    if (view === undefined) return;

    const submission = new DomSubmissionPort();
    const stopStatus = submission.onStatus((status) => {
      if (import.meta.env.MODE === "e2e") {
        document.documentElement.dataset.privacyGuardCompatibility = status.status;
        document.documentElement.dataset.privacyGuardCompatibilityError = status.errorCode ?? "";
      }
      void browser.runtime
        .sendMessage({
          schemaVersion: 1,
          type: "SET_COMPATIBILITY",
          adapterId: status.adapterId,
          status: status.status,
          ...(status.errorCode === undefined ? {} : { errorCode: status.errorCode }),
        })
        .catch(() => undefined);
    });
    let disposeScanner = (): void => undefined;
    let scanner: ScannerPort;
    if (
      import.meta.env.MODE === "e2e" &&
      new URL(location.href).searchParams.get("scanner") === "failure"
    ) {
      scanner = {
        scan: () => Promise.reject(new Error("CONTROLLED_SCANNER_FAILURE")),
      };
    } else {
      const workerScanner = new WorkerScanner(new ScannerWorker(), {
        ...defaultConfig,
        locale: stored.settings.locale,
        policy: stored.settings.policy,
      });
      scanner = workerScanner;
      disposeScanner = () => workerScanner.dispose();
    }
    const controller = new ProtectionController({
      locale: stored.settings.locale,
      scanTimeoutMs: 5_000,
      scanner,
      submission,
      view: {
        render: (state, actions) => {
          if (import.meta.env.MODE === "e2e") {
            document.documentElement.dataset.privacyGuardLastState = state.status;
          }
          view.render(state, actions);
        },
      },
      recorder: {
        record: async (decision) => {
          await browser.runtime.sendMessage({
            schemaVersion: 1,
            type: "RECORD_DECISION",
            action: decision.action,
          });
        },
        recordRedaction: async () => {
          await browser.runtime.sendMessage({
            schemaVersion: 1,
            type: "RECORD_REDACTION",
          });
        },
      },
      onProtectionUnavailable: async (errorCode) => {
        if (import.meta.env.MODE === "e2e") {
          document.documentElement.dataset.privacyGuardCompatibility = "protection_unavailable";
          document.documentElement.dataset.privacyGuardCompatibilityError = errorCode;
        }
        await browser.runtime.sendMessage({
          schemaVersion: 1,
          type: "SET_COMPATIBILITY",
          adapterId,
          status: "protection_unavailable",
          errorCode,
        });
      },
    });
    const stopCapture = submission.onCapture((capture) => {
      if (import.meta.env.MODE === "e2e") {
        document.documentElement.dataset.privacyGuardCaptureReceived = "true";
      }
      void controller.handleCapture(capture);
    });
    if (import.meta.env.MODE === "e2e") {
      document.documentElement.dataset.privacyGuardProtectionReady = "true";
    }
    await injectScript("/main-world.js");
    if (isControlledHarness) {
      await browser.runtime.sendMessage({
        schemaVersion: 1,
        type: "SET_COMPATIBILITY",
        adapterId,
        status: "protected",
      });
    }

    ctx.onInvalidated(() => {
      delete document.documentElement.dataset.privacyGuardProtectionReady;
      delete document.documentElement.dataset.privacyGuardCaptureReceived;
      delete document.documentElement.dataset.privacyGuardLastState;
      delete document.documentElement.dataset.privacyGuardCompatibility;
      delete document.documentElement.dataset.privacyGuardCompatibilityError;
      stopCapture();
      stopStatus();
      disposeScanner();
      ui.remove();
    });
  },
});
