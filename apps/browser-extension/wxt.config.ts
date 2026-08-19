import { defineConfig } from "wxt";

const supportedHosts = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
];

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
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
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    web_accessible_resources: [
      {
        resources: ["main-world.js"],
        matches: supportedHosts,
      },
    ],
  },
});
