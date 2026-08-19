# Troubleshooting

## CLI

`aiprivacy: command not found`: confirm Node.js 24 or newer and npm's global binary directory are on `PATH`. Reinstall from the verified release tarball, then run `aiprivacy doctor`.

`CLI_AGENT_UNSUPPORTED`: only fresh positional `codex exec` commands are protected in adapter version 1. Other agents are not silently treated as protected.

`CLI_AGENT_CONTEXT_UNSUPPORTED`: stdin prompts, images, resumed/forked/review sessions, exec subcommands, or unknown Codex flags include context the adapter cannot safely pre-inspect. Use one positional prompt and declared workspace roots.

Exit code `1` means content was inspected and policy found a violation. Codes `2`–`5` are input, read, unsupported, or internal failures; `130` is cancellation. A wrapped agent's own exit code is forwarded after a successful launch.

If a workspace is too large, tune the bounded CLI limits in the configuration and add non-sensitive exclusions to `.aiprivacyignore`. Do not exclude sensitive files merely to make a protected run pass.

## Extension

If the popup says protection is unavailable, reload the AI site once and confirm the extension is enabled. A site DOM change can temporarily invalidate an adapter; the safe behavior is to stop claiming protection and leave the submission unsent.

If OCR or document inspection times out, reduce the file size or convert it to supported UTF-8 text, PNG, JPEG, WebP, PDF, or DOCX. Password-protected, malformed, or oversized documents fail closed.

If Enter is not intercepted, use the site's visible send control and check the popup compatibility state. Unsupported composer variants are intentionally not guessed.

For manual installation, load the unpacked `apps/browser-extension/.output/chrome-mv3` directory. Do not unzip a store package and assume it will receive automatic security updates.

Report security issues privately as described in [SECURITY.md](../SECURITY.md). For compatibility bugs, include browser/extension versions and synthetic reproduction steps, never real prompts or credentials.
