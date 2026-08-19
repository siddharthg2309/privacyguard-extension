import {
  findAdapterSurface,
  installMainWorldAdapter,
  type MainWorldAdapterConfig,
} from "../shared/main-world-adapter.js";

const config: MainWorldAdapterConfig = {
  adapterId: "claude",
  sourceLabel: "claude-composer",
  composerSelector:
    '[data-cds="ChatComposerEditor"] .ProseMirror[contenteditable="true"], [data-cds="ChatComposerEditor"] [contenteditable="true"][role="textbox"]',
  rootSelector: '[data-cds="ChatComposer"]',
  sendSelector: '[data-cds="ChatComposerPrimaryAction"] button',
  isSubmissionControl: (surface) => surface.root.dataset.busy !== "true",
  attachmentPreviewSelector:
    '[data-cds="MessageAttachments"] [data-file-name], [data-cds="MessageAttachments"] [aria-label]',
};

export function findClaudeComposer(root: ParentNode = document) {
  return findAdapterSurface(config, root);
}

export function installClaudeMainWorldAdapter(
  options: { missingGraceMs?: number } = {},
): () => void {
  return installMainWorldAdapter({ ...config, ...options });
}
