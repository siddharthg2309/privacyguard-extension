import {
  ContentEnvelopeSchema,
  type AttachmentDescriptor,
  type ContentEnvelope,
  type TextFragment,
} from "@privacy-guard/contracts";
import type { OcrProgress, OcrRuntime } from "@privacy-guard/ocr";

export type SupportedAttachmentFormat = "text" | "image" | "pdf" | "docx";

export type AttachmentProcessingLimits = {
  maxAttachmentBytes: number;
  maxTotalBytes: number;
  maxAttachments: number;
  maxExtractedCharacters: number;
  maxPdfPages: number;
  maxImagePixels: number;
};

export const defaultAttachmentProcessingLimits: AttachmentProcessingLimits = {
  maxAttachmentBytes: 25_000_000,
  maxTotalBytes: 50_000_000,
  maxAttachments: 8,
  maxExtractedCharacters: 1_000_000,
  maxPdfPages: 20,
  maxImagePixels: 20_000_000,
};

export type AttachmentExtractionProgress = {
  stage: "reading" | "extracting" | "ocr";
  attachmentId: string;
  completed: number;
  total: number;
  progress: number;
  ocr?: OcrProgress;
};

export type AttachmentExtractionRuntime = {
  extractPdf(
    data: ArrayBuffer,
    limits: AttachmentProcessingLimits,
    signal: AbortSignal,
    onProgress: (progress: OcrProgress) => void,
  ): Promise<string>;
  extractDocx(data: ArrayBuffer, signal: AbortSignal): Promise<string>;
  ocr: OcrRuntime;
};

export class AttachmentExtractionError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AttachmentExtractionError";
    this.code = code;
  }
}

const textExtensions = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "csv",
  "log",
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
  "html",
  "py",
  "java",
  "go",
  "rs",
  "sh",
  "sql",
]);

const imageMediaTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function startsWith(data: Uint8Array, bytes: readonly number[]): boolean {
  return bytes.every((byte, index) => data[index] === byte);
}

export function classifyAttachmentFormat(
  attachment: AttachmentDescriptor,
  data: ArrayBuffer,
): SupportedAttachmentFormat {
  const head = new Uint8Array(data, 0, Math.min(data.byteLength, 16));
  const ext = extension(attachment.name);
  const mediaType = attachment.mediaType?.toLowerCase();
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (
    startsWith(head, [0x89, 0x50, 0x4e, 0x47]) ||
    startsWith(head, [0xff, 0xd8, 0xff]) ||
    (startsWith(head, [0x52, 0x49, 0x46, 0x46]) &&
      String.fromCharCode(...head.slice(8, 12)) === "WEBP")
  ) {
    return "image";
  }
  if (mediaType === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return "docx";
  }
  if (mediaType?.startsWith("text/") === true || textExtensions.has(ext)) return "text";
  if (mediaType !== undefined && imageMediaTypes.has(mediaType)) return "image";
  throw new AttachmentExtractionError(
    "INPUT_ATTACHMENT_UNSUPPORTED",
    "The attachment format is not supported for local inspection.",
  );
}

export function validateAttachmentSet(
  attachments: readonly AttachmentDescriptor[],
  limits: AttachmentProcessingLimits = defaultAttachmentProcessingLimits,
): void {
  if (attachments.length > limits.maxAttachments) {
    throw new AttachmentExtractionError(
      "INPUT_ATTACHMENT_COUNT_EXCEEDED",
      "Too many attachments were selected for one local scan.",
    );
  }
  let total = 0;
  for (const attachment of attachments) {
    if (attachment.sizeBytes === undefined) {
      throw new AttachmentExtractionError(
        "INPUT_ATTACHMENT_UNREADABLE",
        "Attachment size is required before local inspection.",
      );
    }
    if (attachment.sizeBytes > limits.maxAttachmentBytes) {
      throw new AttachmentExtractionError(
        "INPUT_ATTACHMENT_LIMIT_EXCEEDED",
        "An attachment exceeds the local processing limit.",
      );
    }
    total += attachment.sizeBytes;
  }
  if (total > limits.maxTotalBytes) {
    throw new AttachmentExtractionError(
      "INPUT_ATTACHMENT_TOTAL_LIMIT_EXCEEDED",
      "The selected attachments exceed the total local processing limit.",
    );
  }
}

export function decodeTextAttachment(data: ArrayBuffer): string {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(data);
  return normalizeText(decoded);
}

export async function extractAttachmentText(
  attachment: AttachmentDescriptor,
  data: ArrayBuffer,
  runtime: AttachmentExtractionRuntime,
  signal: AbortSignal,
  onProgress: (progress: OcrProgress) => void,
  limits: AttachmentProcessingLimits = defaultAttachmentProcessingLimits,
): Promise<TextFragment> {
  signal.throwIfAborted();
  if (data.byteLength > limits.maxAttachmentBytes) {
    throw new AttachmentExtractionError(
      "INPUT_ATTACHMENT_LIMIT_EXCEEDED",
      "An attachment exceeds the local processing limit.",
    );
  }
  const format = classifyAttachmentFormat(attachment, data);
  try {
    const content = normalizeText(
      format === "text"
        ? decodeTextAttachment(data)
        : format === "docx"
          ? await runtime.extractDocx(data, signal)
          : format === "pdf"
            ? await runtime.extractPdf(data, limits, signal, onProgress)
            : await runtime.ocr.recognize(
                {
                  data,
                  ...(attachment.mediaType === undefined
                    ? {}
                    : { mediaType: attachment.mediaType }),
                  language: "eng",
                },
                signal,
                onProgress,
              ),
    );
    if (content.length > limits.maxExtractedCharacters) {
      throw new AttachmentExtractionError(
        "INPUT_EXTRACTED_TEXT_LIMIT_EXCEEDED",
        "Extracted attachment text exceeds the local scan limit.",
      );
    }
    return {
      id: `attachment:${attachment.id}`,
      kind: format === "image" ? "ocr" : "file",
      content,
      label: attachment.name,
    };
  } catch (error) {
    if (error instanceof AttachmentExtractionError || signal.aborted) throw error;
    throw new AttachmentExtractionError(
      format === "image" ? "OCR_EXECUTION_FAILED" : "INPUT_DOCUMENT_MALFORMED",
      "The attachment could not be inspected safely.",
      { cause: error },
    );
  }
}

export function normalizeText(content: string): string {
  return content
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\0", "")
    .normalize("NFC");
}

export function normalizeFragment(fragment: TextFragment): TextFragment {
  return {
    ...fragment,
    content: normalizeText(fragment.content),
  };
}

export function normalizeEnvelope(input: unknown): ContentEnvelope {
  const envelope = ContentEnvelopeSchema.parse(input);
  const seenIds = new Set<string>();

  for (const fragment of envelope.text) {
    if (seenIds.has(fragment.id)) {
      throw new Error(`Duplicate text fragment id: ${fragment.id}`);
    }
    seenIds.add(fragment.id);
  }

  return {
    ...envelope,
    text: envelope.text.map(normalizeFragment),
  };
}
