# Local attachment processing

Phase 6 adds end-to-end, local-only inspection for attachments selected in the supported ChatGPT, Claude, and Gemini composers. The extension captures the real browser `File` in the isolated content-script world; file bytes never cross the page bridge and are never sent to a server.

## Supported formats

| Format                                    | Local processing path                            |
| ----------------------------------------- | ------------------------------------------------ |
| UTF-8 text and common source/config files | Strict UTF-8 decode and normalization            |
| PNG, JPEG, WebP                           | Tesseract.js English OCR                         |
| PDF                                       | PDF.js text extraction; image-only pages use OCR |
| DOCX                                      | Mammoth raw-text extraction                      |

The PDF.js worker, Tesseract worker/core, and English trained-data model ship inside the extension. No CDN or content-processing API is used.

## Safety limits

- 8 attachments per submission.
- 25 MB per attachment and 50 MB total.
- 1,000,000 extracted characters per attachment.
- 20 PDF pages.
- 20,000,000 decoded pixels per image.
- 45 seconds per attachment, plus a separate 5-second detector timeout.

Attachments are processed sequentially to cap peak memory. Cancellation aborts the active request and terminates pending work. PDF page objects and documents are cleaned up, OCR workers are terminated after each request, transferred buffers are detached from the content script, and extracted text is retained only long enough to produce the privacy decision.

## Decision behavior

Extracted and OCR text enters the same shared detection, risk, and policy pipeline as prompt text. Safe attachments continue with the original page submission. If sensitive content is detected inside an attachment, the submission is blocked and the user must remove or replace the file; the extension never offers a prompt-only redaction that would leave the original sensitive attachment intact.

Unsupported, unreadable, malformed, oversized, timed-out, or failed inputs fail closed. Stable error families include `INPUT_*`, `OCR_*`, `ATTACHMENT_TIMEOUT`, and `ATTACHMENT_WORKER_*`. In every failure state the held submission is cancelled and nothing is transmitted.
