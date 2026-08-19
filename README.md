# AI Privacy Firewall

AI Privacy Firewall is a local-first privacy layer that inspects prompts, files, images, documents, and developer context before a supported workflow sends them to an AI service.

## Product scope

The production product has two clients:

- A Chromium Manifest V3 extension for ChatGPT, Claude, and Gemini.
- A cross-platform CLI for macOS, Windows, and Linux.

All sensitive processing—including PII detection, secret detection, risk scoring, policy evaluation, redaction, OCR, and optional local ML—runs on the user's device. The project has no content-processing backend and does not upload raw prompts or files.

## Release status

Phases 1 through 8 are implemented. Version 1.0 contains the shared privacy engine, installable CLI package, store-ready Chromium archive, ChatGPT/Claude/Gemini adapters, local image/document inspection, protected Codex command workflow, security and accessibility gates, release SBOM/checksums/provenance, and end-user documentation.

The CLI provides file, directory, workspace, and standard-input scanning; safe redaction previews and explicitly authorized writes; human and versioned JSON output; local configuration; status and doctor checks; ignore rules; bounded streaming; cancellation; stable exit codes; and a fail-closed `codex exec` adapter. Packaged E2E runs on macOS, Windows, and Linux.

The extension platform includes a least-privilege WXT Manifest V3 build, validated main-world/isolated-world messaging, a fail-closed submission state machine, inline scanning worker, isolated Shadow DOM review UI, onboarding, popup, local dashboard, versioned storage, and controlled Chromium E2E tests. Site-specific ChatGPT, Claude, and Gemini adapters protect compatible send-button and Enter workflows, preserve multiline input, survive SPA composer replacement, prevent duplicate continuation, and explicitly disable protection when compatibility cannot be guaranteed.

Phase 6 captures selected browser files locally and supports UTF-8 text/source files, PNG/JPEG/WebP OCR, PDF text extraction with OCR fallback, and DOCX raw-text extraction. Processing is bounded, cancellable, worker-isolated, and fail-closed; all OCR models and document workers are bundled with the extension.

Store publication still requires the repository owner to upload the prepared archive using verified Chrome and Microsoft developer accounts. Source code cannot accept publisher terms or pass an external store review on the owner's behalf.

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

## Install the CLI

Requirements: Node.js 24 LTS or newer and npm.

From a signed GitHub release, download `privacy-guard-cli-1.0.0.tgz` and `SHA256SUMS`, verify the checksum, then install:

```bash
npm install --global ./privacy-guard-cli-1.0.0.tgz
aiprivacy doctor
```

macOS/Linux can use the checksum-verifying installer attached to the same release:

```bash
sh ./install.sh 1.0.0
```

Windows PowerShell:

```powershell
.\install.ps1 -Version 1.0.0
```

After the optional npm registry release, install or upgrade with `npm install --global @privacy-guard/cli@latest`.

### Use the CLI

```bash
# Scan one file or a bounded directory.
aiprivacy scan ./notes.txt
aiprivacy workspace scan ./project

# Scan piped text. Content is never included in JSON errors or logs.
printf 'Contact person@example.com' | aiprivacy --format json scan --stdin

# Preview sanitized text without changing the source.
aiprivacy redact ./notes.txt --preview

# Write to a new file, or explicitly authorize in-place replacement.
aiprivacy redact ./notes.txt --output ./notes.safe.txt
aiprivacy redact ./notes.txt --write --force

# Initialize and inspect local configuration.
aiprivacy config init
aiprivacy config validate
aiprivacy status
aiprivacy doctor

# Protect a fresh Codex agent invocation. `--` separates wrapper and agent flags.
aiprivacy run -- codex exec --cd ./project "Review this project"
```

The protected command scans the positional prompt and declared workspace roots before starting Codex. It rejects stdin/image prompts, resumed/forked/review sessions, unknown agents, and unknown context rather than claiming protection. User configuration, MCP responses, network responses, and context discovered after launch cannot be pre-inspected.

CLI exit codes are `0` success, `1` policy violation, `2` invalid input, `3` unsafe read, `4` unsupported integration, `5` internal failure, and `130` cancellation. After an allowed protected launch, the agent's own exit code is forwarded.

## Install the browser extension

For local testing:

```bash
pnpm --filter @privacy-guard/browser-extension build
```

Open `chrome://extensions`, `edge://extensions`, or `brave://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/browser-extension/.output/chrome-mv3`. Pin the extension, complete onboarding, then verify the popup reports a protected adapter on ChatGPT, Claude, or Gemini.

For public use, upload `artifacts/release/privacy-guard-extension-1.0.0-chromium.zip` to Chrome Web Store and Microsoft Edge Add-ons using [the deployment runbook](docs/release-and-deployment.md). Store users then receive browser-managed updates; do not distribute an unpacked directory as a production update channel.

## Development

Requirements:

- Node.js 24 LTS.
- The pnpm version pinned in `package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm audit --audit-level low
pnpm build
pnpm test:e2e:cli
pnpm test:e2e:browser
pnpm package:release
pnpm test:install:cli
```

Build and try the CLI:

```bash
pnpm --filter @privacy-guard/cli build
node apps/cli/dist/cli.cjs doctor
node apps/cli/dist/cli.cjs scan ./path/to/file
printf 'Contact person@example.com' | node apps/cli/dist/cli.cjs scan --stdin
```

See [the CLI contract](docs/cli.md) for commands, safety behavior, JSON guarantees, and exit codes.
See [the browser extension platform](docs/browser-extension.md) for architecture, permissions, local development, and current capability boundaries.
See [the browser adapter contract](docs/browser-adapters.md) for compatibility signals, intercepted ChatGPT workflows, and fail-closed behavior.
See [local attachment processing](docs/attachment-processing.md) for supported formats, limits, lifecycle, and decision behavior.
See [quality baselines](docs/quality-baselines.md), [troubleshooting](docs/troubleshooting.md), and [release/deployment](docs/release-and-deployment.md) for production operation.
See [the privacy policy](PRIVACY.md), [security policy](SECURITY.md), and [changelog](CHANGELOG.md) for release disclosures.

Useful commands:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm architecture:check
pnpm security:check
pnpm benchmark
```

## Privacy guarantees

- Sensitive content is processed locally.
- Raw prompts, files, OCR output, credentials, and detected values are not persisted.
- Supported browser submissions are intercepted before transmission.
- Unsupported or incompatible workflows never display a false protected state.
- The CLI protects only content and commands explicitly routed through it.

## Source license

The repository owner must select and add the intended source license before a public source or npm publication. Browser/CLI release engineering is complete, but this legal choice cannot be inferred safely from the implementation.
