import { describe, expect, it } from "vitest";

import { normalizeEnvelope, normalizeText } from "./index.js";

describe("content normalization", () => {
  it("normalizes line endings, null bytes, and Unicode composition", () => {
    expect(normalizeText("Cafe\u0301\r\nline\0two\rthree")).toBe("Café\nlinetwo\nthree");
  });

  it("rejects duplicate text-fragment identifiers", () => {
    expect(() =>
      normalizeEnvelope({
        schemaVersion: 1,
        requestId: "request-1",
        source: "cli",
        text: [
          { id: "same", kind: "prompt", content: "one" },
          { id: "same", kind: "stdin", content: "two" },
        ],
        attachments: [],
        context: { locale: "en-US", sourceLabel: "test" },
        capabilities: {
          canCaptureText: true,
          canCaptureAttachments: true,
          canBlockSubmission: true,
          canResumeSubmission: true,
        },
      }),
    ).toThrow("Duplicate text fragment id");
  });
});
