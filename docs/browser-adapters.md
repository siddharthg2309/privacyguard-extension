# Browser Adapter Contract

Browser adapters are the only components allowed to know an AI site's DOM and submission behavior. They translate a supported composer into the versioned page bridge without importing detector or policy implementation details. All adapters use one shared interception engine; their configuration contains only site-specific semantic selectors and labels.

## ChatGPT adapter

The Phase 4 adapter supports `chatgpt.com` and the legacy `chat.openai.com` host permission. Its compatibility probe requires all of the following:

- `#prompt-textarea`
- `role="textbox"`
- `contenteditable="true"`
- a nearest `<form>` submission boundary
- a send control identified by `data-testid="send-button"` or the accessible name `Send prompt` when the composer contains sendable content

Volatile utility classes are intentionally ignored. The probe combines stable ID, semantic role, editable state, form ownership, and accessible/test identifiers so one coincidental selector cannot produce a false protected state.

### Intercepted workflows

- Send-button clicks.
- Enter without Shift, Alt, Control, Meta, or IME composition.
- Form submission as a programmatic or framework fallback.
- Prompt content already entered through typing or paste.
- Attachment presence in composer-owned file inputs and known attachment preview elements.

Shift+Enter remains an editor newline. Empty composers are ignored.

### Resume and cancellation

Every capture receives a UUID and remains pending in the main-world adapter. The isolated controller may issue only `RESUME` or `CANCEL` for that ID.

Resume performs these steps:

1. Confirm the captured composer and form are still connected.
2. Write the exact approved outgoing content through the contenteditable editor path.
3. Re-discover an enabled send control.
4. Bypass interception for exactly one synthetic continuation.
5. Return a correlated command acknowledgement.

The controller reaches `COMPLETE` only after the acknowledgement. A missing acknowledgement, replaced composer, failed write, or unavailable send control moves the request to `PROTECTION_UNAVAILABLE` without attempting another submission.

### SPA lifecycle

A document-level `MutationObserver` re-runs the capability probe as ChatGPT navigates or replaces its composer. A new compatible composer is protected without reloading the tab. A missing composer receives a grace period for normal route transitions; if it does not return, the adapter reports `CHATGPT_COMPOSER_NOT_FOUND`.

If the composer is replaced while a review is open, the old request cannot resume into the new composer. The adapter fails closed with `CHATGPT_COMPOSER_REPLACED` and the isolated controller records `ADAPTER_RESUME_FAILED`.

## Claude adapter

The Claude adapter supports `claude.ai`. It relies on Claude's first-party component boundaries rather than generated utility classes:

- `[data-cds="ChatComposer"]` is the owned composer boundary.
- `[data-cds="ChatComposerEditor"]` owns the Tiptap/ProseMirror contenteditable editor.
- `[data-cds="ChatComposerPrimaryAction"]` owns the send action.
- The composer must not report `data-busy="true"`; this excludes the stop action shown during generation without depending on a localized label.
- `[data-cds="MessageAttachments"]` is the attachment-preview boundary.

The adapter intercepts button and unmodified Enter submission. Shift+Enter remains multiline. Claude does not expose a native form submission boundary in this component contract, so the adapter does not claim a form workflow.

## Gemini adapter

The Gemini adapter supports `gemini.google.com`. Its compatibility probe uses the live semantic structure:

- a contenteditable textbox with `aria-label="Enter a prompt for Gemini"`;
- the nearest `[data-node-type="input-area"]` boundary;
- a `button[aria-label="Send message"]` continuation control;
- composer previews plus selected file inputs for attachment presence.

The adapter understands Gemini's Quill editor, button workflow, unmodified Enter submission, Shift+Enter multiline behavior, and SPA input-area replacement. It deliberately ignores dictate, mode, tools, stop-response, and regeneration controls.

## Attachments

The adapters serialize attachment metadata across the main-world bridge. The isolated content script matches that metadata to the real browser `File` and sends its bytes only to the extension's local Phase 6 extraction worker. It never treats an unreadable or uninspected attachment as safe.

## Support matrix

| Site    | Domain                                  | Button    | Enter     | Shift+Enter | SPA replacement | Attachments                                |
| ------- | --------------------------------------- | --------- | --------- | ----------- | --------------- | ------------------------------------------ |
| ChatGPT | `chatgpt.com`, legacy `chat.openai.com` | Protected | Protected | Preserved   | Protected       | Locally inspected; sensitive files blocked |
| Claude  | `claude.ai`                             | Protected | Protected | Preserved   | Protected       | Locally inspected; sensitive files blocked |
| Gemini  | `gemini.google.com`                     | Protected | Protected | Preserved   | Protected       | Locally inspected; sensitive files blocked |

Retry, regenerate, stop-response, voice, and model/tool controls are not new prompt submissions and are intentionally outside the interception selectors. Pasted text is read from the same composer at submission time and receives the same scan as typed text.

| Browser             | ChatGPT | Claude | Gemini | Release validation                                |
| ------------------- | ------- | ------ | ------ | ------------------------------------------------- |
| Playwright Chromium | Yes     | Yes    | Yes    | Automated loaded-extension contract suite         |
| Google Chrome       | Target  | Target | Target | Store or manually installed release certification |
| Microsoft Edge      | Target  | Target | Target | Store or manually installed release certification |
| Brave               | Target  | Target | Target | Manually installed release compatibility matrix   |

Automated release validation uses the extension-capable Playwright Chromium build. Chrome and Edge are primary distribution targets and Brave is a compatibility target; branded-browser certification uses a store or manually installed release because modern branded Chrome and Edge disable command-line extension side-loading. `Target` means the Manifest V3 build and adapter contract support that browser, not that an uninstalled extension was counted as a passing run.

## Compatibility truth

The popup and local dashboard show one of these states:

- `protected`: the full adapter capability probe passed.
- `protection_unavailable`: the adapter, command acknowledgement, worker, or attachment boundary cannot guarantee inspection.
- `unsupported`: protection is disabled or the site adapter has not shipped.

Status storage contains only adapter ID, status, error code, and check time.

## Verification

The shared loaded-extension suite covers all three adapters and includes:

- button, Enter, and form-fallback submissions;
- Shift+Enter non-submission behavior;
- zero transmission before review approval;
- exact sanitized content and exact-once continuation;
- duplicate same-tick actions;
- SPA composer replacement before and during review;
- attachment fail-closed behavior;
- incompatible DOM status;
- worker and page-command failure paths.

Automated extension tests use Playwright's extension-capable Chromium build. Modern branded Chrome and Edge disable command-line extension side-loading, so their release certification must use a browser-store or manually installed build. Chrome and Edge are primary release targets; Brave compatibility is verified during the release-browser matrix rather than inferred from a test run in which the extension was not loaded.
