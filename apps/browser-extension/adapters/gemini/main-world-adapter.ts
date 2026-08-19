import {
  findAdapterSurface,
  installMainWorldAdapter,
  type MainWorldAdapterConfig,
} from "../shared/main-world-adapter.js";

const config: MainWorldAdapterConfig = {
  adapterId: "gemini",
  sourceLabel: "gemini-composer",
  composerSelector:
    '[contenteditable="true"][role="textbox"][aria-label="Enter a prompt for Gemini"]',
  rootSelector: '[data-node-type="input-area"]',
  sendSelector: 'button[aria-label="Send message"]',
  attachmentPreviewSelector:
    '[data-test-id*="attachment"] [data-file-name], [data-test-id*="attachment"] [aria-label], [data-test-id*="file"] [data-file-name]',
};

export function findGeminiComposer(root: ParentNode = document) {
  return findAdapterSurface(config, root);
}

export function installGeminiMainWorldAdapter(
  options: { missingGraceMs?: number } = {},
): () => void {
  return installMainWorldAdapter({ ...config, ...options });
}
