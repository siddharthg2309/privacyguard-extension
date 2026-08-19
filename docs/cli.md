# CLI contract

The `aiprivacy` CLI is a local-only adapter around the shared privacy engine. It never uploads input, detections, redaction maps, configuration, or diagnostics.

## Commands

```text
aiprivacy scan <path>
aiprivacy scan --stdin
aiprivacy redact <path> --preview
aiprivacy redact <path> --output <path>
aiprivacy redact <path> --write [--force]
aiprivacy workspace scan [path]
aiprivacy config [show|validate|path|init]
aiprivacy status
aiprivacy doctor
```

`--format json` selects machine output. `--config <path>` selects an explicit local configuration. Global options are placed before the command.

## Safety behavior

- Workspace traversal respects root `.gitignore` and `.aiprivacyignore` rules.
- Symbolic links are never followed by default.
- Binary and oversized files are skipped or rejected with a stable reason code.
- Per-file, workspace-total, file-count, and concurrency limits are configurable.
- Files are streamed in bounded chunks and scans accept cancellation.
- Preview is non-mutating. In-place redaction requires an interactive confirmation or `--force`.
- Writes use a same-directory temporary file followed by an atomic rename.

## Exit codes

| Code | Meaning                                      |
| ---: | -------------------------------------------- |
|    0 | Completed without a policy violation         |
|    1 | One or more decisions violate policy         |
|    2 | Invalid arguments or configuration           |
|    3 | Input could not be read within safety limits |
|    4 | Unsupported input or integration             |
|    5 | Internal scan failure                        |
|  130 | Cancelled                                    |

## JSON output

Machine output uses `schemaVersion: 1`. Scan responses contain a command identifier, status, ordered per-input results, privacy decisions, and a summary. Errors contain only a stable error code and safe message. Detected raw values are not included.

Schema additions may be backward compatible within version 1. Breaking field or semantic changes require a new schema version.
