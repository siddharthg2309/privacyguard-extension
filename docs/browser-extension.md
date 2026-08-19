# Browser Extension Platform

Phase 3 provides the production browser foundation for AI Privacy Firewall. Phase 4 adds ChatGPT, and Phase 5 adds Claude and Gemini through the same fail-closed adapter contract.

## Architecture

The Chromium extension is a WXT-built Manifest V3 application with these trust boundaries:

1. A main-world bridge owns interception and exact resume/cancel behavior for a supported page adapter.
2. An isolated content script validates every bridge payload, holds the submission, and coordinates the state machine.
3. An inline Web Worker runs the shared privacy engine without blocking the page UI. Inline bundling prevents worker URLs from resolving against the visited website.
4. A Shadow DOM surface shows scanning, review, blocked, and protection-unavailable states without inheriting site styles.
5. The Manifest V3 service worker stores only settings, compatibility status, and aggregate counters. Raw prompts and detected values are never sent to storage.

Cross-world events carry JSON strings and are validated with versioned Zod schemas. Strings avoid browser-realm object identity problems, and the main-world bridge accepts commands only for request IDs it currently holds.

## Fail-closed submission flow

```text
intercept → capture → scan → allow → resume exactly once
                           → review → redact or cancel
                           → block
                           → failure/timeout → protection unavailable + cancel
```

The controller cannot resume from `FAILED` or `PROTECTION_UNAVAILABLE`. A duplicate capture is cancelled, and a worker failure or timeout never falls through to the site submission.

## Permissions

The production manifest requests only:

- `storage`, for local settings, capability status, and aggregate counters.
- Host access to `chatgpt.com`, `chat.openai.com`, `claude.ai`, and `gemini.google.com`.

It does not request `<all_urls>`, `tabs`, or `scripting`. The main-world bridge is the only web-accessible resource and is restricted to the supported hosts.

## Local development

```bash
pnpm dev:browser
pnpm build
pnpm package:browser
```

Load the generated Chromium directory from `apps/browser-extension/.output/` through the browser's unpacked-extension screen.

Run the controlled loaded-extension suite with:

```bash
pnpm --filter @privacy-guard/browser-extension exec playwright install chromium
pnpm test:e2e:browser
```

The suite verifies manifest permissions, exact-once safe resume, zero transmission before sanitized approval, cancellation, scanner failure, and page lifecycle reinitialization. Storage tests instantiate a fresh background handler over the same local store to verify service-worker restart behavior.

## Current capability truth

- The platform, controlled harness, and ChatGPT, Claude, and Gemini adapters are implemented and tested.
- Prompt submission is protected only while the active site's complete compatibility probe passes.
- A compatibility failure is isolated to that adapter and cannot disable another supported site.
- Attachments are intercepted but fail closed with `ATTACHMENT_INSPECTION_UNAVAILABLE` until Phase 6 can inspect their contents.
- Image, PDF, OCR, and supported-document processing belongs to Phase 6.
