# AI Privacy Firewall CLI

The CLI scans content locally. It does not send prompts, file contents, detections, or redaction maps to a project backend.

Install the signed release tarball with:

```bash
npm install --global ./privacy-guard-cli-1.0.0.tgz
aiprivacy doctor
```

Common commands:

```bash
aiprivacy scan ./file.txt
aiprivacy workspace scan ./project
aiprivacy redact ./file.txt --preview
aiprivacy config init
aiprivacy run -- codex exec --cd ./project "Review this project"
```

See the repository [CLI contract](../../docs/cli.md), [troubleshooting guide](../../docs/troubleshooting.md), and main README for the complete safety and installation contract.
