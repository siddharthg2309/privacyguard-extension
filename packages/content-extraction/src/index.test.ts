import { describe, expect, it } from "vitest";

import type { AttachmentDescriptor } from "@privacy-guard/contracts";
import type { OcrRuntime } from "@privacy-guard/ocr";
import { vi } from "vitest";

import {
  AttachmentExtractionError,
  classifyAttachmentFormat,
  defaultAttachmentProcessingLimits,
  extractAttachmentText,
  normalizeEnvelope,
  normalizeText,
  validateAttachmentSet,
  type AttachmentExtractionRuntime,
} from "./index.js";

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

const attachment: AttachmentDescriptor = {
  id: "attachment-1",
  name: "notes.txt",
  mediaType: "text/plain",
  sizeBytes: 24,
};

function bytes(input: string): ArrayBuffer {
  return new TextEncoder().encode(input).buffer;
}

function runtime(
  overrides: Partial<AttachmentExtractionRuntime> = {},
): AttachmentExtractionRuntime {
  const ocr: OcrRuntime = {
    recognize: vi.fn().mockResolvedValue("OCR person@example.com"),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  return {
    extractPdf: vi.fn().mockResolvedValue("PDF person@example.com"),
    extractDocx: vi.fn().mockResolvedValue("DOCX person@example.com"),
    ocr,
    ...overrides,
  };
}

describe("attachment extraction", () => {
  it("sniffs supported formats instead of trusting only extensions", () => {
    expect(classifyAttachmentFormat({ ...attachment, name: "wrong.bin" }, bytes("%PDF-1.7"))).toBe(
      "pdf",
    );
    expect(
      classifyAttachmentFormat(
        { ...attachment, name: "image.bin" },
        new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
      ),
    ).toBe("image");
    expect(classifyAttachmentFormat(attachment, bytes("hello"))).toBe("text");
  });

  it("extracts normalized text into the shared detector fragment contract", async () => {
    const result = await extractAttachmentText(
      attachment,
      bytes("Contact person@example.com\r\n"),
      runtime(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result).toEqual({
      id: "attachment:attachment-1",
      kind: "file",
      content: "Contact person@example.com\n",
      label: "notes.txt",
    });
  });

  it("routes images, PDFs, and DOCX through injected local runtimes", async () => {
    const processing = runtime();
    const signal = new AbortController().signal;
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    const pdf = bytes("%PDF-1.7");
    const docx = { ...attachment, name: "notes.docx", mediaType: undefined };
    await expect(
      extractAttachmentText(
        { ...attachment, name: "scan.png" },
        image,
        processing,
        signal,
        vi.fn(),
      ),
    ).resolves.toMatchObject({ kind: "ocr", content: "OCR person@example.com" });
    await expect(
      extractAttachmentText({ ...attachment, name: "scan.pdf" }, pdf, processing, signal, vi.fn()),
    ).resolves.toMatchObject({ kind: "file", content: "PDF person@example.com" });
    await expect(
      extractAttachmentText(docx, bytes("PK fixture"), processing, signal, vi.fn()),
    ).resolves.toMatchObject({ kind: "file", content: "DOCX person@example.com" });
  });

  it("rejects unsupported, malformed, oversized, and excessive attachment sets", async () => {
    expect(() =>
      classifyAttachmentFormat({ id: "x", name: "archive.zip", sizeBytes: 3 }, bytes("ZIP")),
    ).toThrow(AttachmentExtractionError);
    expect(() =>
      validateAttachmentSet(
        [{ ...attachment, sizeBytes: defaultAttachmentProcessingLimits.maxAttachmentBytes + 1 }],
        defaultAttachmentProcessingLimits,
      ),
    ).toThrow("exceeds the local processing limit");
    expect(() =>
      validateAttachmentSet(
        Array.from(
          { length: defaultAttachmentProcessingLimits.maxAttachments + 1 },
          (_, index) => ({
            ...attachment,
            id: `attachment-${index}`,
          }),
        ),
      ),
    ).toThrow("Too many attachments");
    await expect(
      extractAttachmentText(
        { ...attachment, name: "broken.docx", mediaType: undefined },
        bytes("PK broken"),
        runtime({ extractDocx: vi.fn().mockRejectedValue(new Error("malformed")) }),
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "INPUT_DOCUMENT_MALFORMED" });
  });

  it("honors cancellation before extraction starts", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(
      extractAttachmentText(attachment, bytes("local"), runtime(), controller.signal, vi.fn()),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
