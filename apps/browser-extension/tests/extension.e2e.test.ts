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

const phaseFiveSites = [
  {
    id: "claude",
    label: "Claude",
    host: "claude.ai",
    composerName: "Write your prompt to Claude",
    sendName: "Send Message",
    rootMarkup:
      '<div data-cds="ChatComposer"><div data-cds="ChatComposerEditor"><div class="ProseMirror" role="textbox" aria-label="Write your prompt to Claude" contenteditable="true"><p><br></p></div></div><input aria-label="Attach test file" type="file"><div data-cds="MessageAttachments"></div><div data-cds="ChatComposerPrimaryAction"><button aria-label="Send Message" type="button">Send</button></div></div>',
    composerSelector: '[data-cds="ChatComposerEditor"] .ProseMirror',
    sendSelector: '[data-cds="ChatComposerPrimaryAction"] button',
  },
  {
    id: "gemini",
    label: "Gemini",
    host: "gemini.google.com",
    composerName: "Enter a prompt for Gemini",
    sendName: "Send message",
    rootMarkup:
      '<div data-node-type="input-area"><rich-textarea enterkeyhint="send"><div class="ql-editor" role="textbox" aria-label="Enter a prompt for Gemini" aria-multiline="true" contenteditable="true"><p><br></p></div></rich-textarea><input aria-label="Attach test file" type="file"><div data-test-id="send-button-container"><button aria-label="Send message" type="button">Send</button></div></div>',
    composerSelector: '[aria-label="Enter a prompt for Gemini"]',
    sendSelector: 'button[aria-label="Send message"]',
  },
] as const;

type PhaseFiveSite = (typeof phaseFiveSites)[number];

function phaseFiveHarnessHtml(site: PhaseFiveSite): string {
  return String.raw`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${site.label} adapter contract harness</title></head>
  <body>
    <main>
      <div id="composer-slot"></div>
      <button id="replace-composer" type="button">Replace composer</button>
      <output id="transmission-count">0</output>
    </main>
    <script>
      const rootMarkup = ${JSON.stringify(site.rootMarkup)};
      const composerSelector = ${JSON.stringify(site.composerSelector)};
      const sendSelector = ${JSON.stringify(site.sendSelector)};
      function transmit(root) {
        const composer = root.querySelector(composerSelector);
        const transmissions = JSON.parse(document.body.dataset.transmissions || "[]");
        transmissions.push({ content: composer.innerText.replace(/\n+$/, "") });
        document.body.dataset.transmissions = JSON.stringify(transmissions);
        document.querySelector("#transmission-count").textContent = String(transmissions.length);
      }
      function installComposer() {
        const shell = document.createElement("div");
        shell.innerHTML = rootMarkup;
        const root = shell.firstElementChild;
        const action = root.querySelector(sendSelector);
        action.addEventListener("click", () => {
          if (root.dataset.busy === "true" || action.getAttribute("aria-label").startsWith("Stop")) {
            document.body.dataset.stopClicks = String(Number(document.body.dataset.stopClicks || "0") + 1);
            return;
          }
          transmit(root);
        });
        document.querySelector("#composer-slot").replaceChildren(root);
      }
      document.querySelector("#replace-composer").addEventListener("click", installComposer);
      installComposer();
    </script>
  </body>
</html>`;
}

function incompatibleSiteHtml(site: PhaseFiveSite): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Incompatible ${site.label}</title></head><body><main>No compatible composer.</main></body></html>`;
}

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

async function openPhaseFiveHarness(site: PhaseFiveSite): Promise<void> {
  await page.goto(`https://${site.host}/__privacy_guard_${site.id}_harness__`);
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

async function transmitted(): Promise<{ content: string; requestId?: string }[]> {
  return page.locator("body").evaluate((body) => {
    const serialized = body.dataset.transmissions ?? "[]";
    return JSON.parse(serialized) as { content: string; requestId?: string }[];
  });
}

function createTextPdf(text: string): Buffer {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 24 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
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
  for (const site of phaseFiveSites) {
    await context.route(`https://${site.host}/__privacy_guard_*`, (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const body = pathname.endsWith("_incompatible__")
        ? incompatibleSiteHtml(site)
        : phaseFiveHarnessHtml(site);
      return route.fulfill({ status: 200, contentType: "text/html", body });
    });
  }
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

test("ChatGPT sensitive text attachment is inspected locally and blocked", async () => {
  await openChatGptHarness();
  await page.getByLabel("Attach test file").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Contact person@example.com"),
  });
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("Review this file");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.getByRole("heading", { name: "This submission is blocked" })).toBeVisible();
  await expect(page.locator("#transmission-count")).toHaveText("0");
  await expect(page.getByRole("button", { name: "Send sanitized version" })).toBeHidden();
});

test("ChatGPT safe text attachment resumes exactly once", async () => {
  await openChatGptHarness();
  await page.getByLabel("Attach test file").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Public documentation about binary search"),
  });
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("Review this file");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.locator("#transmission-count")).toHaveText("1");
  expect(await transmitted()).toEqual([{ content: "Review this file" }]);
});

test("ChatGPT malformed PDF fails closed with a stable input error", async () => {
  await openChatGptHarness();
  await page.getByLabel("Attach test file").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-not-a-real-document"),
  });
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("Review this file");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.getByRole("heading", { name: "Protection is unavailable" })).toBeVisible();
  await expect(page.locator("#transmission-count")).toHaveText("0");
  await expect(page.locator("html")).toHaveAttribute(
    "data-privacy-guard-compatibility-error",
    "INPUT_DOCUMENT_MALFORMED",
  );
});

test("ChatGPT PDF text is extracted locally and sensitive content is blocked", async () => {
  await openChatGptHarness();
  await page.getByLabel("Attach test file").setInputFiles({
    name: "contact.pdf",
    mimeType: "application/pdf",
    buffer: createTextPdf("person@example.com"),
  });
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("Review this PDF");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.getByRole("heading", { name: "This submission is blocked" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("#transmission-count")).toHaveText("0");
});

test("ChatGPT image attachment uses bundled local OCR and blocks detected email", async () => {
  test.setTimeout(60_000);
  await openChatGptHarness();
  const fixture = page.locator("body").evaluate(() => {
    const imageText = document.createElement("div");
    imageText.id = "ocr-fixture";
    imageText.textContent = "person@example.com";
    imageText.style.cssText =
      "display:inline-block;padding:40px;background:white;color:black;font:700 52px monospace";
    document.body.append(imageText);
  });
  await fixture;
  const buffer = await page.locator("#ocr-fixture").screenshot();
  await page.locator("#ocr-fixture").evaluate((element) => element.remove());
  await page.getByLabel("Attach test file").setInputFiles({
    name: "contact.png",
    mimeType: "image/png",
    buffer,
  });
  await page.getByRole("textbox", { name: "Chat with ChatGPT" }).fill("Read this image");
  await page.getByRole("button", { name: "Send prompt" }).click();

  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "This submission is blocked" })).toBeVisible();
  await expect(page.locator("#transmission-count")).toHaveText("0");
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

for (const site of phaseFiveSites) {
  test.describe(`${site.label} shared adapter contract`, () => {
    test("button submission resumes exactly once", async () => {
      await openPhaseFiveHarness(site);
      await page.getByRole("textbox", { name: site.composerName }).fill("Explain binary search");
      await page.getByRole("button", { name: site.sendName }).click();

      await expect(page.locator("#transmission-count")).toHaveText("1");
      expect(await transmitted()).toEqual([{ content: "Explain binary search" }]);
    });

    test("Enter keeps sensitive content local until sanitized approval", async () => {
      await openPhaseFiveHarness(site);
      const composer = page.getByRole("textbox", { name: site.composerName });
      await composer.fill("Contact person@example.com");
      await composer.press("Enter");

      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.locator("#transmission-count")).toHaveText("0");
      await expect(page.getByLabel("Exact outgoing content")).toHaveValue("Contact [EMAIL]");
      await page.getByRole("button", { name: "Send sanitized version" }).click();
      await expect(page.locator("#transmission-count")).toHaveText("1");
      expect(await transmitted()).toEqual([{ content: "Contact [EMAIL]" }]);
    });

    test("Shift+Enter remains multiline and does not submit", async () => {
      await openPhaseFiveHarness(site);
      const composer = page.getByRole("textbox", { name: site.composerName });
      await composer.fill("First line");
      await composer.press("Shift+Enter");

      await expect(page.locator("#transmission-count")).toHaveText("0");
      await expect(page.getByRole("dialog")).toBeHidden();
    });

    test("stop-response controls are not treated as prompt submission", async () => {
      await openPhaseFiveHarness(site);
      await page.getByRole("textbox", { name: site.composerName }).fill("Unsent draft");
      await page.locator(site.sendSelector).evaluate((button) => {
        button.setAttribute("aria-label", "Stop response");
        button.closest<HTMLElement>('[data-cds="ChatComposer"]')?.setAttribute("data-busy", "true");
        if (button instanceof HTMLElement) button.click();
      });

      await expect(page.locator("body")).toHaveAttribute("data-stop-clicks", "1");
      await expect(page.locator("#transmission-count")).toHaveText("0");
      await expect(page.getByRole("dialog")).toBeHidden();
    });

    test("duplicate action and SPA replacement remain exact-once", async () => {
      await openPhaseFiveHarness(site);
      await page.getByRole("button", { name: "Replace composer" }).click();
      await page.getByRole("textbox", { name: site.composerName }).fill("person@example.com");
      await page.getByRole("button", { name: site.sendName }).evaluate((button) => {
        if (button instanceof HTMLElement) {
          button.click();
          button.click();
        }
      });
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "Send sanitized version" }).click();

      await expect(page.locator("#transmission-count")).toHaveText("1");
      expect(await transmitted()).toEqual([{ content: "[EMAIL]" }]);
    });

    test("sensitive text attachment is inspected locally and blocked", async () => {
      await openPhaseFiveHarness(site);
      await page.getByLabel("Attach test file").setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Contact person@example.com"),
      });
      await page.getByRole("textbox", { name: site.composerName }).fill("Review this file");
      await page.getByRole("button", { name: site.sendName }).click();

      await expect(page.getByRole("heading", { name: "This submission is blocked" })).toBeVisible();
      await expect(page.locator("#transmission-count")).toHaveText("0");
      await expect(page.getByRole("button", { name: "Send sanitized version" })).toBeHidden();
    });

    test("incompatible DOM is explicitly unavailable", async () => {
      await page.goto(`https://${site.host}/__privacy_guard_${site.id}_incompatible__`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-privacy-guard-compatibility",
        "protection_unavailable",
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-privacy-guard-compatibility-error",
        `${site.id.toUpperCase()}_COMPOSER_NOT_FOUND`,
      );
    });
  });
}

test("an incompatible Claude adapter cannot disable Gemini protection", async () => {
  const claude = phaseFiveSites[0];
  const gemini = phaseFiveSites[1];
  await page.goto(`https://${claude.host}/__privacy_guard_${claude.id}_incompatible__`);
  await expect(page.locator("html")).toHaveAttribute(
    "data-privacy-guard-compatibility-error",
    "CLAUDE_COMPOSER_NOT_FOUND",
  );

  await openPhaseFiveHarness(gemini);
  await page.getByRole("textbox", { name: gemini.composerName }).fill("Independent safe prompt");
  await page.getByRole("button", { name: gemini.sendName }).click();
  await expect(page.locator("#transmission-count")).toHaveText("1");
});
