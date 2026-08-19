import { expect, test, chromium, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const extensionPath = path.resolve(".output/chrome-mv3-e2e");
const harnessUrl = "https://chatgpt.com/__privacy_guard_harness__";

let context: BrowserContext | undefined;
let page: Page;

const harnessHtml = String.raw`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Privacy Guard controlled harness</title></head>
  <body>
    <main>
      <form data-privacy-guard-harness="true">
        <label for="composer">Prompt</label>
        <textarea id="composer" data-privacy-guard-composer></textarea>
        <button type="submit">Submit</button>
      </form>
      <output id="transmission-count">0</output>
    </main>
    <script>
      document.addEventListener("privacy-guard:harness-transmitted", (event) => {
        const transmissions = JSON.parse(document.body.dataset.transmissions || "[]");
        transmissions.push(event.detail);
        document.body.dataset.transmissions = JSON.stringify(transmissions);
        document.querySelector("#transmission-count").textContent = String(transmissions.length);
      });
    </script>
  </body>
</html>`;

const chatGptHarnessHtml = String.raw`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>ChatGPT adapter contract harness</title></head>
  <body>
    <main>
      <div id="composer-slot"></div>
      <button id="replace-composer" type="button">Replace composer</button>
      <output id="transmission-count">0</output>
    </main>
    <script>
      function installComposer() {
        const form = document.createElement("form");
        form.className = "group/composer";
        form.innerHTML = '<div id="prompt-textarea" role="textbox" aria-label="Chat with ChatGPT" contenteditable="true"><p><br></p></div><input aria-label="Attach test file" type="file"><button data-testid="send-button" aria-label="Send prompt" type="submit">Send</button>';
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const composer = form.querySelector("#prompt-textarea");
          const transmissions = JSON.parse(document.body.dataset.transmissions || "[]");
          transmissions.push({ content: composer.innerText.replace(/\n+$/, "") });
          document.body.dataset.transmissions = JSON.stringify(transmissions);
          document.querySelector("#transmission-count").textContent = String(transmissions.length);
        });
        document.querySelector("#composer-slot").replaceChildren(form);
      }
      document.querySelector("#replace-composer").addEventListener("click", installComposer);
      installComposer();
    </script>
  </body>
</html>`;

const incompatibleChatGptHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Incompatible ChatGPT harness</title></head>
<body><main><p>No compatible composer is present.</p></main></body></html>`;

async function openHarness(query = ""): Promise<void> {
  await page.goto(`${harnessUrl}${query}`);
  await expect(page.locator("form")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-privacy-guard-harness-ready", "true");
  await expect(page.locator("html")).toHaveAttribute("data-privacy-guard-protection-ready", "true");
}

async function openChatGptHarness(pathname = "__privacy_guard_chatgpt_harness__"): Promise<void> {
  await page.goto(`https://chatgpt.com/${pathname}`);
  await expect(page.locator("html")).toHaveAttribute("data-privacy-guard-protection-ready", "true");
  await expect(page.locator("html")).toHaveAttribute(
    "data-privacy-guard-compatibility",
    "protected",
  );
}

async function submit(content: string): Promise<void> {
  await page.locator("textarea").fill(content);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
}

async function transmitted(): Promise<{ content: string; requestId: string }[]> {
  return page.locator("body").evaluate((body) => {
    const serialized = body.dataset.transmissions ?? "[]";
    return JSON.parse(serialized) as { content: string; requestId: string }[];
  });
}

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  await context.route("https://chatgpt.com/__privacy_guard_*", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/__privacy_guard_harness__" ? harnessHtml : chatGptHarnessHtml;
    return route.fulfill({ status: 200, contentType: "text/html", body });
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test("Manifest V3 requests only the bounded production permissions", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(extensionPath, "manifest.json"), "utf8"),
  ) as {
    manifest_version: number;
    permissions?: string[];
    host_permissions?: string[];
  };
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(["storage"]);
  expect(manifest.host_permissions).toEqual([
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
  ]);
  expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
  expect(manifest.permissions).not.toContain("tabs");
  expect(manifest.permissions).not.toContain("scripting");
});

test("a safe prompt resumes exactly once after local scanning", async () => {
  await openHarness();
  await submit("Explain binary search.");
  await expect(page.locator("html")).toHaveAttribute("data-privacy-guard-capture-received", "true");
  await expect(page.locator("html")).toHaveAttribute("data-privacy-guard-last-state", "COMPLETE");
  await expect(page.locator("form")).toHaveAttribute("data-privacy-guard-state", "resumed");
  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toMatchObject([{ content: "Explain binary search." }]);

  await submit("Explain merge sort.");
  await expect(page.locator("#transmission-count")).toHaveText("2");
  expect(await transmitted()).toMatchObject([
    { content: "Explain binary search." },
    { content: "Explain merge sort." },
  ]);
});

test("sensitive content has zero transmission until explicit sanitized approval", async () => {
  await openHarness();
  await submit("Contact person@example.com");

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#transmission-count")).toHaveText("0");
  await expect(page.getByLabel("Exact outgoing content")).toHaveValue("Contact [EMAIL]");
  await page.getByRole("button", { name: "Send sanitized version" }).click();

  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toMatchObject([{ content: "Contact [EMAIL]" }]);
});

test("cancelling review never transmits the held content", async () => {
  await openHarness();
  await submit("Contact person@example.com");
  await page.getByRole("button", { name: "Cancel submission" }).click();

  await expect(page.locator("form")).toHaveAttribute("data-privacy-guard-state", "cancelled");
  await expect(page.locator("#transmission-count")).toHaveText("0");
});

test("scanner failure fails closed and cannot resume", async () => {
  await openHarness("?scanner=failure");
  await submit("This must remain local");

  await expect(page.getByRole("heading", { name: "Protection is unavailable" })).toBeVisible();
  await expect(page.locator("form")).toHaveAttribute("data-privacy-guard-state", "cancelled");
  await expect(page.locator("#transmission-count")).toHaveText("0");
});

test("content protection reinitializes safely after page lifecycle restart", async () => {
  await openHarness();
  await submit("First safe prompt");
  await expect(page.locator("#transmission-count")).toHaveText("1");

  await page.reload();
  await submit("Second safe prompt");
  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toMatchObject([{ content: "Second safe prompt" }]);
});

test("ChatGPT button submission is intercepted and resumed exactly once", async () => {
  await openChatGptHarness();
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("Explain binary search");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toEqual([{ content: "Explain binary search" }]);
});

test("ChatGPT Enter submission stays local until sanitized approval", async () => {
  await openChatGptHarness();
  const composer = page.getByRole("textbox", { name: "Chat with ChatGPT" });
  await composer.fill("Contact person@example.com");
  await composer.press("Enter");

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#transmission-count")).toHaveText("0");
  await expect(page.getByLabel("Exact outgoing content")).toHaveValue("Contact [EMAIL]");
  await page.getByRole("button", { name: "Send sanitized version" }).click();
  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toEqual([{ content: "Contact [EMAIL]" }]);
});

test("ChatGPT Shift+Enter remains an editor newline and is not submitted", async () => {
  await openChatGptHarness();
  const composer = page.getByRole("textbox", { name: "Chat with ChatGPT" });
  await composer.fill("First line");
  await composer.press("Shift+Enter");

  await expect(page.locator("#transmission-count")).toHaveText("0");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("ChatGPT form submission fallback is protected", async () => {
  await openChatGptHarness();
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("Form fallback prompt");
  await page.locator("form").evaluate((form) => {
    if (form instanceof HTMLFormElement) form.requestSubmit();
  });

  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toEqual([{ content: "Form fallback prompt" }]);
});

test("ChatGPT duplicate actions cannot create duplicate transmission", async () => {
  await openChatGptHarness();
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("person@example.com");
  await page.getByRole("button", { name: "Send prompt" }).evaluate((button) => {
    if (button instanceof HTMLElement) {
      button.click();
      button.click();
    }
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Send sanitized version" }).click();

  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toHaveLength(1);
});

test("ChatGPT adapter survives SPA composer replacement", async () => {
  await openChatGptHarness();
  await page.getByRole("button", { name: "Replace composer" }).click();
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("New route prompt");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toEqual([{ content: "New route prompt" }]);
});

test("ChatGPT composer replacement during review fails closed", async () => {
  await openChatGptHarness();
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("person@example.com");
  await page.getByRole("button", { name: "Send prompt" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Replace composer" }).evaluate((button) => {
    if (button instanceof HTMLElement) button.click();
  });
  await page.getByRole("button", { name: "Send sanitized version" }).click();

  await expect(page.getByRole("heading", { name: "Protection is unavailable" })).toBeVisible();
  await expect(page.locator("#transmission-count")).toHaveText("0");
  await expect(page.locator("html")).toHaveAttribute(
    "data-privacy-guard-compatibility-error",
    "ADAPTER_RESUME_FAILED",
  );
});

test("ChatGPT attachment submission fails closed until attachment inspection ships", async () => {
  await openChatGptHarness();
  await page.getByLabel("Attach test file").setInputFiles({
    name: "private.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("synthetic fixture"),
  });
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("Review this file");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.getByRole("heading", { name: "Protection is unavailable" })).toBeVisible();
  await expect(page.locator("#transmission-count")).toHaveText("0");
  await expect(page.locator("html")).toHaveAttribute(
    "data-privacy-guard-compatibility-error",
    "ATTACHMENT_INSPECTION_UNAVAILABLE",
  );
});

test("incompatible ChatGPT DOM is explicitly marked unavailable", async () => {
  await context?.route("https://chatgpt.com/__privacy_guard_chatgpt_incompatible__", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: incompatibleChatGptHtml }),
  );
  await page.goto("https://chatgpt.com/__privacy_guard_chatgpt_incompatible__");
  await expect(page.locator("html")).toHaveAttribute(
    "data-privacy-guard-compatibility",
    "protection_unavailable",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-privacy-guard-compatibility-error",
    "CHATGPT_COMPOSER_NOT_FOUND",
  );
});
