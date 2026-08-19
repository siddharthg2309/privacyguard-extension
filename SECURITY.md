# Security policy

## Supported versions

Security fixes are provided for the latest released 1.x version. Users should upgrade both the CLI and browser extension together when a new release is published.

## Report a vulnerability

Do not open a public issue containing exploit details, credentials, prompts, files, or other sensitive data. Use the repository's [private vulnerability reporting form](https://github.com/siddharthg2309/privacyguard-extension/security/advisories/new). Include the affected version, platform, reproduction steps using synthetic data, and the security impact.

If private reporting is unavailable, open a public issue that contains no exploit or private data and ask the maintainer to establish a private channel.

## Security model

- Prompt, file, OCR, detection, and redaction processing is local.
- The extension requests `storage` plus four bounded HTTPS host patterns; it does not request tabs, history, cookies, or all-URL access.
- Raw content is not written to extension storage, CLI configuration, logs, analytics, or a project backend.
- Browser submission fails closed if scanning, attachment extraction, or site compatibility cannot be trusted.
- The protected CLI agent adapter launches no process until prompt and declared workspace inspection passes.
- Release artifacts include SHA-256 checksums, a CycloneDX SBOM, and GitHub/Sigstore provenance attestations.

The product reduces accidental disclosure; it is not a malware scanner, data-loss-prevention compliance certification, or guarantee that supported AI sites cannot change after release.
