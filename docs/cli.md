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
aiprivacy run -- codex exec [CODEX OPTIONS] "PROMPT"
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
- `run` adapter version 1 supports fresh positional `codex exec` invocations. It scans the prompt, working root selected by `--cd`, and additional `--add-dir` roots before creating the subprocess.
- Unknown agents, stdin/image prompts, resumed/forked/review sessions, and unknown flags return an unsupported error. Context that cannot be pre-inspected is disclosed and never assumed protected.
- The agent is not launched when the prompt or readable workspace violates policy. Allowed subprocesses receive an argument array without a shell, inherit standard I/O, receive cancellation, and return their own exit code.

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

An allowed `run` command forwards the wrapped agent's exit code, so other numeric codes can originate from that agent.

## JSON output

Machine output uses `schemaVersion: 1`. Scan responses contain a command identifier, status, ordered per-input results, privacy decisions, and a summary. Errors contain only a stable error code and safe message. Detected raw values are not included.

Schema additions may be backward compatible within version 1. Breaking field or semantic changes require a new schema version.

`run` writes its coverage disclosure to standard error because the child owns standard output. In JSON mode, wrapper policy failures are a versioned JSON error on standard error; successful child output keeps the child's own format.
