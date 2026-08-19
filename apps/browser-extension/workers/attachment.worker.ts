import {
  AttachmentExtractionError,
  defaultAttachmentProcessingLimits,
  extractAttachmentText,
  type AttachmentExtractionRuntime,
  type AttachmentProcessingLimits,
} from "@privacy-guard/content-extraction";
import { normalizeOcrProgress, type OcrProgress, type OcrRuntime } from "@privacy-guard/ocr";
import mammoth from "mammoth/mammoth.browser.js";
import { getDocument, GlobalWorkerOptions, type PDFPageProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url&no-inline";
import { createWorker, OEM } from "tesseract.js";
import tesseractWorkerUrl from "tesseract.js/dist/worker.min.js?url&no-inline";
import tesseractCoreUrl from "tesseract.js-core/tesseract-core-lstm.wasm.js?url&no-inline";

import type {
  AttachmentWorkerCancel,
  AttachmentWorkerRequest,
  AttachmentWorkerResponse,
} from "../lib/contracts/messages.js";

const active = new Map<string, AbortController>();

function extensionUrl(path: string, base: string): string {
  return new URL(path.replace(/^\//, ""), base).href;
}

function post(response: AttachmentWorkerResponse): void {
  self.postMessage(response);
}

function stage(status: string): OcrProgress["stage"] {
  if (status.includes("recogniz")) return "recognizing";
  if (status.includes("language")) return "loading_language";
  return "initializing";
}

function createOcr(requestId: string, extensionBaseUrl: string): OcrRuntime {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  return {
    async recognize(input, signal, onProgress) {
      signal.throwIfAborted();
      const abort = (): void => {
        void worker?.terminate().catch(() => undefined);
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        const image = await createImageBitmap(
          new Blob([input.data], { type: input.mediaType ?? "image/png" }),
        );
        const pixels = image.width * image.height;
        image.close();
        if (pixels > defaultAttachmentProcessingLimits.maxImagePixels) {
          throw new AttachmentExtractionError(
            "INPUT_IMAGE_PIXEL_LIMIT_EXCEEDED",
            "The image exceeds the local pixel limit.",
          );
        }
        worker = await createWorker("eng", OEM.LSTM_ONLY, {
          workerPath: extensionUrl(tesseractWorkerUrl, extensionBaseUrl),
          corePath: extensionUrl(tesseractCoreUrl, extensionBaseUrl),
          langPath: new URL("assets/tessdata/", extensionBaseUrl).href,
          cacheMethod: "none",
          logger: (message) => {
            const progress = normalizeOcrProgress(stage(message.status), message.progress);
            if (progress === undefined) return;
            onProgress(progress);
            post({ schemaVersion: 1, type: "ATTACHMENT_PROGRESS", requestId, ...progress });
          },
        });
        signal.throwIfAborted();
        const result = await worker.recognize(
          new Blob([input.data], { type: input.mediaType ?? "image/png" }),
        );
        signal.throwIfAborted();
        return result.data.text;
      } finally {
        signal.removeEventListener("abort", abort);
      }
    },
    async dispose() {
      await worker?.terminate();
      worker = undefined;
    },
  };
}

async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .filter(Boolean)
    .join(" ");
}

async function renderPage(page: PDFPageProxy, limits: AttachmentProcessingLimits): Promise<Blob> {
  const base = page.getViewport({ scale: 2 });
  const pixels = base.width * base.height;
  const scale = pixels > limits.maxImagePixels ? 2 * Math.sqrt(limits.maxImagePixels / pixels) : 2;
  const viewport = page.getViewport({ scale });
  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  return canvas.convertToBlob({ type: "image/png" });
}

function createRuntime(requestId: string, ocr: OcrRuntime): AttachmentExtractionRuntime {
  return {
    ocr,
    async extractDocx(data, signal) {
      signal.throwIfAborted();
      const result = await mammoth.extractRawText({ arrayBuffer: data });
      signal.throwIfAborted();
      return result.value;
    },
    async extractPdf(data, limits, signal, onProgress) {
      const loading = getDocument({ data: new Uint8Array(data) });
      const document = await loading.promise;
      try {
        if (document.numPages > limits.maxPdfPages) {
          throw new AttachmentExtractionError(
            "INPUT_PDF_PAGE_LIMIT_EXCEEDED",
            "The PDF exceeds the local page limit.",
          );
        }
        const output: string[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          signal.throwIfAborted();
          const page = await document.getPage(pageNumber);
          const text = await pageText(page);
          if (text.trim().length > 8) {
            output.push(text);
          } else {
            const blob = await renderPage(page, limits);
            const pageData = await blob.arrayBuffer();
            output.push(
              await ocr.recognize(
                { data: pageData, mediaType: "image/png", language: "eng" },
                signal,
                onProgress,
              ),
            );
          }
          page.cleanup();
        }
        return output.join("\n\n");
      } finally {
        await document.cleanup();
        await loading.destroy();
      }
    },
  };
}

async function extract(message: AttachmentWorkerRequest): Promise<void> {
  const controller = new AbortController();
  active.set(message.requestId, controller);
  GlobalWorkerOptions.workerSrc = extensionUrl(pdfWorkerUrl, message.extensionBaseUrl);
  const ocr = createOcr(message.requestId, message.extensionBaseUrl);
  try {
    const fragment = await extractAttachmentText(
      message.attachment,
      message.data,
      createRuntime(message.requestId, ocr),
      controller.signal,
      () => undefined,
      defaultAttachmentProcessingLimits,
    );
    post({ schemaVersion: 1, type: "ATTACHMENT_SUCCESS", requestId: message.requestId, fragment });
  } catch (error) {
    if (controller.signal.aborted) return;
    const errorCode =
      error instanceof AttachmentExtractionError
        ? error.code
        : typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
          ? error.code
          : "ATTACHMENT_EXTRACTION_FAILED";
    post({ schemaVersion: 1, type: "ATTACHMENT_FAILURE", requestId: message.requestId, errorCode });
  } finally {
    await ocr.dispose();
    active.delete(message.requestId);
  }
}

function isWorkerMessage(
  input: unknown,
): input is AttachmentWorkerRequest | AttachmentWorkerCancel {
  if (typeof input !== "object" || input === null) return false;
  const message = input as Record<string, unknown>;
  if (message.schemaVersion !== 1 || typeof message.requestId !== "string") return false;
  if (message.type === "CANCEL_ATTACHMENT") return true;
  return (
    message.type === "EXTRACT_ATTACHMENT" &&
    message.data instanceof ArrayBuffer &&
    typeof message.attachment === "object" &&
    message.attachment !== null &&
    typeof message.extensionBaseUrl === "string"
  );
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isWorkerMessage(event.data)) return;
  if (event.data.type === "CANCEL_ATTACHMENT") active.get(event.data.requestId)?.abort();
  else void extract(event.data);
});
