import {
  defaultAttachmentProcessingLimits,
  extractAttachmentText,
  type AttachmentExtractionRuntime,
} from "@privacy-guard/content-extraction";
import type { OcrRuntime } from "@privacy-guard/ocr";
import { bench, describe } from "vitest";

const signal = new AbortController().signal;
const text = new TextEncoder().encode("Contact person@example.com\n".repeat(1_000)).buffer;
const ocr: OcrRuntime = {
  recognize: () => Promise.resolve("Contact person@example.com"),
  dispose: () => Promise.resolve(),
};
const runtime: AttachmentExtractionRuntime = {
  ocr,
  extractDocx: () => Promise.resolve("Contact person@example.com"),
  extractPdf: () => Promise.resolve("Contact person@example.com"),
};

describe("Phase 6 attachment extraction", () => {
  bench("UTF-8 text attachment normalization", async () => {
    await extractAttachmentText(
      { id: "text", name: "notes.txt", mediaType: "text/plain", sizeBytes: text.byteLength },
      text,
      runtime,
      signal,
      () => undefined,
      defaultAttachmentProcessingLimits,
    );
  });

  bench("OCR result orchestration into detector fragments", async () => {
    await extractAttachmentText(
      { id: "image", name: "scan.png", mediaType: "image/png", sizeBytes: 4 },
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
      runtime,
      signal,
      () => undefined,
      defaultAttachmentProcessingLimits,
    );
  });
});
