import {
  findAdapterSurface,
  installMainWorldAdapter,
  type MainWorldAdapterConfig,
} from "../shared/main-world-adapter.js";

const config: MainWorldAdapterConfig = {
  adapterId: "chatgpt",
  sourceLabel: "chatgpt-composer",
  composerSelector: '#prompt-textarea[contenteditable="true"][role="textbox"]',
  rootSelector: "form",
  sendSelector: '[data-testid="send-button"], button[aria-label="Send prompt"]',
  attachmentPreviewSelector: '[data-file-name], [data-testid*="attachment"], [data-testid*="file"]',
};

export function findChatGptComposer(root: ParentNode = document) {
  return findAdapterSurface(config, root);
}

export function installChatGptMainWorldAdapter(
  options: { missingGraceMs?: number } = {},
): () => void {
  return installMainWorldAdapter({ ...config, ...options });
}
