import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig } from "wxt";

const supportedHosts = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
];
const require = createRequire(import.meta.url);
const englishModelPath =
  require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz");

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [
      {
        name: "bundle-local-english-ocr-model",
        buildStart() {
          this.emitFile({
            type: "asset",
            fileName: "assets/tessdata/eng.traineddata.gz",
            source: readFileSync(englishModelPath),
          });
        },
      },
    ],
  }),
  manifest: {
    name: "AI Privacy Firewall",
    short_name: "Privacy Firewall",
    description: "Inspect sensitive content locally before supported AI submissions.",
    minimum_chrome_version: "120",
    permissions: ["storage"],
    host_permissions: supportedHosts,
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    action: {
      default_title: "AI Privacy Firewall",
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
        48: "icons/icon-48.png",
        128: "icons/icon-128.png",
      },
    },
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    web_accessible_resources: [
      {
        resources: ["main-world.js", "assets/*"],
        matches: supportedHosts,
      },
    ],
  },
});
