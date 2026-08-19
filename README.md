# AI Privacy Firewall

AI Privacy Firewall is a local-first privacy layer that inspects prompts, files, images, documents, and developer context before a supported workflow sends them to an AI service.

## Product scope

The production product has two clients:

- A Chromium Manifest V3 extension for ChatGPT, Claude, and Gemini.
- A cross-platform CLI for macOS, Windows, and Linux.

All sensitive processing—including PII detection, secret detection, risk scoring, policy evaluation, redaction, OCR, and optional local ML—runs on the user's device. The project has no content-processing backend and does not upload raw prompts or files.

## Current status

Phase 1 is complete. The repository now contains shared runtime contracts, content normalization, PII and secret detectors, sensitive-file classification, deterministic risk scoring, local policy evaluation, span-safe redaction, guarded configuration, safe diagnostics, and the reusable privacy-engine pipeline.

The Phase 1 quality baseline includes strict TypeScript and ESLint checks, architecture-boundary enforcement, 35 automated tests, property-based redaction testing, coverage reporting, package builds, and a local engine benchmark.

The browser extension and CLI applications will be built on top of this shared engine in later production milestones.

## Architecture

```text
Chromium extension ─┐
                    ├── Shared local privacy engine
CLI ────────────────┘       ├── Extraction and normalization
                            ├── PII and secret detection
                            ├── File classification
                            ├── Risk and policy decisions
                            └── Redaction
```

## Development

Requirements:

- Node.js 24 LTS.
- The pnpm version pinned in `package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm build
```

Useful commands:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm architecture:check
pnpm benchmark
```

## Privacy guarantees

- Sensitive content is processed locally.
- Raw prompts, files, OCR output, credentials, and detected values are not persisted.
- Supported browser submissions are intercepted before transmission.
- Unsupported or incompatible workflows never display a false protected state.
- The CLI protects only content and commands explicitly routed through it.

## License

The license and contribution model will be finalized before the first public source release.
