# Version 1.0 quality baselines

These baselines use synthetic, non-sensitive fixtures and are regression gates, not claims about every language, document, camera, or real-world dataset.

## Accuracy

The automated `published synthetic accuracy gates` require:

| Capability                        |                       Fixture result |                       Release gate |
| --------------------------------- | -----------------------------------: | ---------------------------------: |
| Structured email                  | precision 1.00, recall 1.00, F1 1.00 |                     all equal 1.00 |
| US/UK international phone         |          precision 1.00, recall 1.00 |                    both equal 1.00 |
| Provider-shaped critical API keys |          precision 1.00, recall 1.00 |                    both equal 1.00 |
| Selected-value redaction          |                         100% removed | no original selected value remains |

Names and addresses remain contextual warnings and are not represented as universal NER. OCR is covered by deterministic document orchestration tests and an actual bundled-English-model browser test; a broad camera/document word-error-rate corpus is a post-1.0 expansion.

## Performance

Reference run: Apple-arm64 macOS 15.6, Node.js 24.19.0, Vitest 4.1.11. Values are single-process microbenchmarks from August 20, 2026.

| Operation                                |      Mean |       p99 |
| ---------------------------------------- | --------: | --------: |
| Safe prompt decision                     | 0.0076 ms | 0.0094 ms |
| Sensitive prompt decision                | 0.0161 ms | 0.0190 ms |
| 27 KB UTF-8 attachment normalization     | 0.0415 ms | 0.0494 ms |
| OCR-result orchestration (model stubbed) | 0.0011 ms | 0.0027 ms |

Real OCR latency depends on image size, text density, hardware, and the bundled Tesseract model. OCR runs off the page UI thread and exposes progress, cancellation, timeouts, and size limits.

Run the same harness with `pnpm benchmark`. Release decisions compare like-for-like hardware and runtime results rather than treating these numbers as universal.
