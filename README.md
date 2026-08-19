# AI Privacy Firewall

AI Privacy Firewall is a local-first privacy layer that inspects prompts, files, images, documents, and developer context before a supported workflow sends them to an AI service.

## Product scope

The production product has two clients:

- A Chromium Manifest V3 extension for ChatGPT, Claude, and Gemini.
- A cross-platform CLI for macOS, Windows, and Linux.

All sensitive processing—including PII detection, secret detection, risk scoring, policy evaluation, redaction, OCR, and optional local ML—runs on the user's device. The project has no content-processing backend and does not upload raw prompts or files.

## Current status

Phases 1 and 2 are complete. The repository contains the shared privacy engine plus a production CLI foundation for macOS, Windows, and Linux.

The CLI provides file, directory, workspace, and standard-input scanning; safe redaction previews and explicitly authorized writes; human and versioned JSON output; local configuration; status and doctor checks; ignore rules; bounded streaming; cancellation; stable exit codes; and cross-platform E2E coverage.

The Chromium extension will be built on top of the same shared engine in the next production milestone.

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
pnpm test:e2e:cli
```

Build and try the CLI:

```bash
pnpm --filter @privacy-guard/cli build
node apps/cli/dist/cli.cjs doctor
node apps/cli/dist/cli.cjs scan ./path/to/file
printf 'Contact person@example.com' | node apps/cli/dist/cli.cjs scan --stdin
```

See [the CLI contract](docs/cli.md) for commands, safety behavior, JSON guarantees, and exit codes.

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
