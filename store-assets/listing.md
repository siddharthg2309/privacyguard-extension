# Store listing kit — version 1.0.0

## Listing

Name: **AI Privacy Firewall**

Category: **Privacy & Security**

Short description: **Inspect sensitive prompts and attachments locally before supported AI submissions.**

Detailed description:

> AI Privacy Firewall adds a local privacy checkpoint before supported ChatGPT, Claude, and Gemini submissions. It detects common personal information and credentials, shows the exact sanitized text, and waits for an explicit decision before anything continues.
>
> Text, files, images, PDFs, DOCX documents, OCR output, detections, and redaction are processed on your device. There is no account, cloud scanner, advertising SDK, raw-content telemetry, or project backend.
>
> Protection is fail-closed: if scanning, attachment extraction, or website compatibility cannot be trusted, the extension stops claiming protection and does not automatically continue the held submission. Site support is limited to documented composer workflows and can temporarily become unavailable when an AI website changes.

Single purpose: **Prevent accidental disclosure by locally inspecting and optionally sanitizing content immediately before supported AI-site submissions.**

## Permission justifications

- `storage`: stores only settings, onboarding state, compatibility status, and aggregate counters. It never stores raw prompts, files, OCR text, detected values, or redaction maps.
- `https://chatgpt.com/*` and `https://chat.openai.com/*`: intercept supported ChatGPT composer submissions before transmission.
- `https://claude.ai/*`: intercept supported Claude composer submissions before transmission.
- `https://gemini.google.com/*`: intercept supported Gemini composer submissions before transmission.

No tabs, history, cookies, identity, downloads, native messaging, scripting, or all-URL permission is requested.

## Reviewer instructions

1. Install the extension and complete onboarding.
2. Open a supported ChatGPT, Claude, or Gemini composer.
3. Submit `Contact person@example.com` using the visible send control.
4. Confirm the site does not receive the original content and the review dialog shows `Contact [EMAIL]`.
5. Choose Cancel and confirm nothing is submitted; repeat and choose Send sanitized version to confirm exactly the displayed sanitized content continues once.
6. Open the extension popup and options page to inspect local status and settings.

No test account is bundled. Reviewers may use their own supported-site test account and synthetic data only.

## Assets

- Store icon: `icons/icon-512.png` (also packaged as a 128 px manifest icon).
- Screenshots: `screenshots/01-onboarding.png`, `02-local-dashboard.png`, `03-sensitive-review.png` (1280×800).
- Small promotional tile: `promotional/small-440x280.png`.
- Optional marquee/large tile: `promotional/marquee-1400x560.png`.
- Privacy URL: publish the repository `PRIVACY.md` through an HTTPS website or GitHub Pages URL accepted by the store.
- Support and security: repository Issues for non-sensitive bugs; private vulnerability reporting for security issues.
