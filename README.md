# AI Privacy Firewall

[![CI](https://github.com/siddharthg2309/privacyguard-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/siddharthg2309/privacyguard-extension/actions/workflows/ci.yml)
[![CodeQL](https://github.com/siddharthg2309/privacyguard-extension/actions/workflows/codeql.yml/badge.svg)](https://github.com/siddharthg2309/privacyguard-extension/actions/workflows/codeql.yml)
[![Node.js 24+](https://img.shields.io/badge/node.js-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Chromium Manifest V3](https://img.shields.io/badge/Chromium-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License](https://img.shields.io/badge/license-pending%20selection-orange)](#license)

AI Privacy Firewall is a local-first, open-source-ready project for checking sensitive content before it reaches an AI service. It provides two clients:

- a Chromium Manifest V3 extension for ChatGPT, Claude, and Gemini;
- a cross-platform CLI for macOS, Windows, and Linux.

PII detection, secret detection, risk scoring, policy decisions, redaction, OCR, and document extraction run locally. There is no project backend, account system, advertising SDK, remote analytics, or raw-content telemetry.

> **Project status:** Version 1.0 functionality is implemented and tested. The repository is being prepared for public OSS use. A source license must still be selected and added before the code can legally be redistributed as open source.

## Contents

- [What it does](#what-it-does)
- [Privacy model](#privacy-model)
- [Quick start](#quick-start)
- [CLI](#cli)
- [Browser extension](#browser-extension)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Contributing](#contributing)
- [Security](#security)
- [Release and deployment](#release-and-deployment)
- [License](#license)

## What it does

### CLI

- Scans files, directories, workspaces, and standard input.
- Detects common PII and secrets without exposing detected values in logs or JSON errors.
- Previews redaction, writes to a new file, or performs explicitly authorized in-place replacement.
- Provides stable exit codes, human-readable output, versioned JSON output, cancellation, bounded traversal, ignore rules, configuration, status, and diagnostics.
- Protects fresh `codex exec` commands by inspecting the prompt and declared workspace before launching the agent.
- Fails closed for unsupported agents, resumed/forked/review sessions, image prompts, stdin prompts, unknown flags, or uninspectable context.

### Browser extension

- Protects compatible send-button and Enter workflows on ChatGPT, Claude, and Gemini.
- Shows an exact local review before submission and allows explicit continuation after a policy decision.
- Handles multiline composers, single-page-app composer replacement, duplicate continuation prevention, and compatibility changes.
- Inspects selected UTF-8/source files, PNG/JPEG/WebP images, PDFs, and DOCX files locally.
- Uses worker-isolated, bounded, cancellable processing with OCR fallback for supported images and PDFs.
- Uses least-privilege storage and host permissions and a Shadow DOM review surface isolated from page styles.
- Disables protection rather than claiming a workflow is protected when site compatibility cannot be trusted.

## Privacy model

The product is intentionally local-only:

- Raw prompts, files, OCR output, credentials, detected values, and redaction maps are not sent to a project service.
- Extension storage contains settings, onboarding state, compatibility state, and aggregate counters—not content.
- CLI configuration contains user settings only.
- Content is held in volatile local memory for the decision and discarded afterward.
- If a user approves a submission, the chosen content is sent directly to the AI website under that website's own terms.

Read the full [privacy policy](PRIVACY.md) and [security policy](SECURITY.md). This project reduces accidental disclosure; it is not a malware scanner, DLP compliance certification, or guarantee that third-party AI sites will remain compatible forever.

## Quick start

### Install the CLI from a release artifact

Requirements: Node.js 24 LTS or newer and npm.

Download `privacy-guard-cli-1.0.0.tgz` and `SHA256SUMS` from a GitHub Release, verify the checksum, then install:

```bash
npm install --global ./privacy-guard-cli-1.0.0.tgz
aiprivacy doctor
```

The prepared installers are also available as `install.sh` for macOS/Linux and `install.ps1` for Windows. See [CLI usage](#cli) and the [CLI contract](docs/cli.md).

### Load the extension locally

```bash
pnpm --filter @privacy-guard/browser-extension build
```

Open `chrome://extensions`, `edge://extensions`, or `brave://extensions`, enable Developer mode, choose **Load unpacked**, and select:

```text
apps/browser-extension/.output/chrome-mv3
```

Complete onboarding, then verify the popup reports a protected adapter on a supported ChatGPT, Claude, or Gemini page.

## CLI

```bash
# Scan a file, directory, workspace, or standard input.
aiprivacy scan ./notes.txt
aiprivacy workspace scan ./project
printf 'Contact person@example.com' | aiprivacy --format json scan --stdin

# Preview or write sanitized content.
aiprivacy redact ./notes.txt --preview
aiprivacy redact ./notes.txt --output ./notes.safe.txt
aiprivacy redact ./notes.txt --write --force

# Configure and inspect the local installation.
aiprivacy config init
aiprivacy config validate
aiprivacy config path
aiprivacy status
aiprivacy doctor

# Protect a fresh Codex invocation.
aiprivacy run -- codex exec --cd ./project "Review this project"
```

CLI exit codes are `0` success, `1` policy violation, `2` invalid input, `3` unsafe read, `4` unsupported integration, `5` internal failure, and `130` cancellation. The protected agent's exit code is forwarded after an allowed launch.

See the [CLI contract](docs/cli.md) for command behavior, safety guarantees, JSON output, limits, and integration boundaries.

## Browser extension

The extension supports Chromium-based browsers, with controlled coverage for ChatGPT, Claude, and Gemini. Brave is a compatibility target and should receive a manual smoke test for each browser release before being described as certified.

The store-ready archive is created by:

```bash
pnpm package:release
```

It is written to `artifacts/release/privacy-guard-extension-1.0.0-chromium.zip`. Do not distribute an unpacked development directory as a production update channel. Use the [release and deployment runbook](docs/release-and-deployment.md) for Chrome Web Store and Microsoft Edge Add-ons publication.

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

The extension uses WXT and Manifest V3. Site adapters run in the page's main world only for narrowly scoped composer integration; the security-sensitive decision and review flow stays in extension-controlled contexts. The CLI and extension share the privacy engine's contracts and detection behavior while keeping platform-specific extraction and UI concerns separate.

See the [browser extension architecture](docs/browser-extension.md), [adapter contract](docs/browser-adapters.md), and [attachment-processing contract](docs/attachment-processing.md).

## Repository layout

```text
apps/browser-extension/   WXT Chromium extension, adapters, UI, workers, E2E tests
apps/cli/                 Cross-platform CLI and packaged CLI E2E tests
packages/                 Shared privacy, detection, extraction, policy, and contract packages
distribution/              Checksum-verifying CLI installers
scripts/                  Architecture, security, packaging, CodeQL, and install checks
docs/                     Contracts, limits, troubleshooting, quality, and deployment guides
store-assets/             Store icons, screenshots, promotional artwork, and listing copy
```

## Development

Requirements:

- Node.js 24 LTS or newer.
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

Useful focused checks:

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

Use synthetic data in tests and examples. Never commit real prompts, credentials, private files, API keys, or customer data. See [quality baselines](docs/quality-baselines.md) and [troubleshooting](docs/troubleshooting.md) when a check fails.

## Contributing

Contributions are welcome once the repository is public. Please:

1. Read the relevant contract in `docs/` before changing behavior.
2. Keep privacy-sensitive processing local and fail closed when context cannot be inspected.
3. Add or update tests for behavior changes, including platform-specific cases where relevant.
4. Run `pnpm verify`, `pnpm audit --audit-level low`, and the relevant E2E checks before submitting a change.
5. Use synthetic fixtures only and explain security or privacy impact in the change description.

Issues should include the operating system, Node.js/browser version, exact command or workflow, and a minimal synthetic reproduction. Do not publish secrets or exploit details in an issue; use the private process in [SECURITY.md](SECURITY.md) for vulnerabilities.

## Security

The repository runs dependency auditing, permission/CSP checks, static analysis, CodeQL SARIF scanning, architecture checks, packaged installation tests, cross-platform CLI E2E tests, and controlled Chromium extension E2E tests in CI.

Report vulnerabilities through the [private GitHub security advisory form](https://github.com/siddharthg2309/privacyguard-extension/security/advisories/new). Do not include real credentials, prompts, files, or sensitive data in a public issue.

## Release and deployment

Release artifacts include the CLI tarball, Chromium extension ZIP, installers, SHA-256 checksums, CycloneDX SBOM, and provenance inputs. A tagged release rebuilds and verifies the artifacts before attaching them to GitHub Releases.

Before public distribution, the repository owner must:

- select and add a source license;
- create the Chrome Web Store and Microsoft Edge publisher accounts;
- host `PRIVACY.md` at a public URL for store review;
- upload the prepared extension archive and accept each store's publisher terms;
- optionally configure npm trusted publishing for `@privacy-guard/cli`.

See [docs/release-and-deployment.md](docs/release-and-deployment.md) for the complete checklist and rollback procedure.

## License

No `LICENSE` file has been added yet because the repository owner has not selected the intended terms. Until a license is committed, the source is **not** legally open source for redistribution. Add a license such as MIT, Apache-2.0, GPL-3.0-or-later, or another license that matches the project's goals, then update this section and the badge before publishing the repository as OSS.

Third-party dependencies remain subject to their own licenses; review the dependency notices before distributing a release.
