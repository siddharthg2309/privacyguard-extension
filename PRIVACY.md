# Privacy policy

Effective: August 20, 2026

AI Privacy Firewall inspects content on the user's device before supported AI submissions or explicit CLI scans. There is no application backend, user account, advertising SDK, remote analytics service, or raw-content telemetry.

## Data processed locally

The extension may temporarily process prompt text, selected filenames and file bytes, extracted document text, OCR output, and detected sensitive categories. The CLI processes only paths, standard input, prompts, and workspace roots explicitly given to it. This data remains in volatile local memory for the decision and is discarded afterward.

## Data stored

The extension stores only user settings, onboarding state, adapter compatibility status, and aggregate counters such as scans or blocks. It does not store prompt text, filenames, file contents, OCR output, detected values, or redaction maps. The CLI stores only the configuration file the user explicitly initializes.

## Data transmitted

AI Privacy Firewall does not transmit inspected content to its developer or any project service. If a user explicitly approves an allowed or sanitized submission, the supported AI website transmits that chosen content under its own privacy terms. Browser stores and GitHub/npm may process ordinary installation or download metadata independently of this software.

## Permissions

`storage` retains local settings and aggregate counters. Host access is limited to ChatGPT (`chatgpt.com` and the legacy `chat.openai.com` host), Claude (`claude.ai`), and Gemini (`gemini.google.com`) so the extension can intercept supported composer submissions before transmission.

## Retention, access, and deletion

No raw-content retention occurs. Users can clear extension settings by removing the extension or clearing its local extension storage. CLI configuration can be deleted directly from the path shown by `aiprivacy config path`.

## Limited-use disclosure

Use of information received from browser APIs complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. User data is used only to provide the visible local privacy-checking feature; it is not sold, used for advertising, or made available for human review.

Security concerns should be reported using [SECURITY.md](SECURITY.md).
