# Release and extension deployment

## Reproducible release

From a clean tagged commit with Node.js 24 and the pinned pnpm version:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm audit --audit-level low
pnpm build
pnpm test:e2e:cli
pnpm test:e2e:browser
pnpm package:release
pnpm test:install:cli
```

`artifacts/release` contains the universal CLI tarball, Chromium ZIP, installers, SHA-256 checksums, and CycloneDX SBOM. The tag workflow rebuilds twice, compares checksums, creates GitHub/Sigstore provenance attestations, and attaches the files to the GitHub release. Verify a downloaded artifact with:

```bash
gh attestation verify privacy-guard-cli-1.0.0.tgz \
  --repo siddharthg2309/privacyguard-extension
```

## Chrome Web Store

1. Register and verify a Chrome Web Store developer account with two-step verification.
2. Create a new item and upload `privacy-guard-extension-1.0.0-chromium.zip`. `manifest.json` is at the archive root.
3. Use the copy in `store-assets/listing.md`, the 128 px icon, 1280×800 screenshots, and 440×280 promotional tile.
4. In Privacy, declare the single purpose, justify `storage` and each bounded host, select the data types processed locally, certify Limited Use, and provide a publicly hosted URL for `PRIVACY.md`.
5. Choose private visibility for a final tester pass, then public or unlisted distribution. Submit for review; store approval is an external Google decision.

Chrome on Windows and macOS requires normal public installations to come from the Chrome Web Store. Unpacked loading is for development only.

## Microsoft Edge Add-ons

1. Register and verify a Microsoft Partner Center Edge developer account.
2. Create an extension and upload the same Chromium ZIP.
3. Supply the listing copy, privacy URL, icon, screenshots, and optional promotional tiles from `store-assets`.
4. Select markets and public/hidden visibility, add certification notes from `store-assets/listing.md`, and submit.

Edge performs its own certification. Keep its version synchronized with Chrome so both stores receive the same signed source release.

## Brave

Brave installs extensions from the Chrome Web Store. Version 1.0 targets Chromium Manifest V3 and is covered by the same controlled Chromium contract suite. Perform a manual current-Brave smoke test before marking a specific Brave version certified; until then it is a compatibility target, not a separately approved store package.

## Updates and rollback

Increase both client versions before every store upload. Browser stores provide automatic updates and store-managed rollback/removal. For an emergency rollback, submit the last known-good source rebuilt with a numerically higher manifest version; stores do not accept a lower version upload.

For the CLI, publish the tagged tarball and optionally enable npm publishing with repository variable `PUBLISH_NPM=true` after configuring npm trusted publishing for `@privacy-guard/cli`. Users upgrade with `npm install --global @privacy-guard/cli@latest` and roll back with an explicit trusted version, for example `npm install --global @privacy-guard/cli@1.0.0`. Configuration schema 1 remains stable across reinstall and rollback.

Public deployment cannot be completed by source code alone: the repository owner must control and accept the terms for the Chrome, Microsoft, GitHub, and optional npm publisher accounts.
