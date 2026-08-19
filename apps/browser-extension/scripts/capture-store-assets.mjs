import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const extensionPath = resolve(".output/chrome-mv3-e2e");
const outputPath = resolve("../../store-assets/screenshots");
await mkdir(outputPath, { recursive: true });

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  let worker = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  const onboarding = await context.newPage();
  await onboarding.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await onboarding.screenshot({ path: resolve(outputPath, "01-onboarding.png") });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.screenshot({ path: resolve(outputPath, "02-local-dashboard.png") });

  const review = await context.newPage();
  await context.route("https://chatgpt.com/__privacy_guard_harness__", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Protected prompt review</title><style>body{margin:0;background:#f4f7f6;font:16px system-ui;color:#10231f}main{max-width:820px;margin:120px auto;padding:48px;background:white;border:1px solid #d9e2df;border-radius:24px}textarea{box-sizing:border-box;width:100%;min-height:180px;padding:18px;font:inherit;border:1px solid #82968f;border-radius:12px}button{margin-top:18px;padding:12px 20px;font:700 15px system-ui}</style></head><body><main><h1>Chat with your AI assistant</h1><form data-privacy-guard-harness="true"><label for="composer">Prompt</label><textarea id="composer" data-privacy-guard-composer></textarea><button type="submit">Submit</button></form><output id="transmission-count">0</output></main></body></html>`,
    }),
  );
  await review.goto("https://chatgpt.com/__privacy_guard_harness__");
  await review.locator("textarea").fill("Contact person@example.com about the private account.");
  await review.getByRole("button", { name: "Submit", exact: true }).click();
  await review.getByRole("dialog", { name: "Review sensitive details" }).waitFor();
  await review.screenshot({ path: resolve(outputPath, "03-sensitive-review.png") });

  process.stdout.write(`Captured store screenshots for extension ${extensionId}.\n`);
} finally {
  await context.close();
}
