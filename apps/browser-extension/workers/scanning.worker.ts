import { createPrivacyEngine } from "@privacy-guard/privacy-engine";

import { WorkerScanRequestSchema, type WorkerScanResponse } from "../lib/contracts/messages.js";

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const parsed = WorkerScanRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  void createPrivacyEngine({ config: parsed.data.config })
    .scan(parsed.data.envelope)
    .then((decision) => {
      const response: WorkerScanResponse = {
        schemaVersion: 1,
        type: "SCAN_SUCCESS",
        requestId: parsed.data.requestId,
        decision,
      };
      self.postMessage(response);
    })
    .catch(() => {
      const response: WorkerScanResponse = {
        schemaVersion: 1,
        type: "SCAN_FAILURE",
        requestId: parsed.data.requestId,
        errorCode: "DETECTOR_EXECUTION_FAILED",
      };
      self.postMessage(response);
    });
});
