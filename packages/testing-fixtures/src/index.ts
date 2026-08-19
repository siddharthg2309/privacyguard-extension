import type { ContentEnvelope, TextFragment } from "@privacy-guard/contracts";

export function createFragment(
  content: string,
  overrides: Partial<TextFragment> = {},
): TextFragment {
  return {
    id: "fragment-1",
    kind: "prompt",
    content,
    ...overrides,
  };
}

export function createEnvelope(
  content: string,
  overrides: Partial<ContentEnvelope> = {},
): ContentEnvelope {
  return {
    schemaVersion: 1,
    requestId: "request-1",
    source: "cli",
    text: [createFragment(content)],
    attachments: [],
    context: {
      locale: "en-US",
      sourceLabel: "synthetic-test",
    },
    capabilities: {
      canCaptureText: true,
      canCaptureAttachments: true,
      canBlockSubmission: true,
      canResumeSubmission: true,
    },
    ...overrides,
  };
}
