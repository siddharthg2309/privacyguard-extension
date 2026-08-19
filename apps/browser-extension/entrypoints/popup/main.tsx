import { browser } from "wxt/browser";

import { Brand } from "../../ui/components/Brand.js";
import { StatusPill } from "../../ui/components/StatusPill.js";
import { renderPage } from "../../ui/render-page.js";
import { updateSettings, useStoredState } from "../../ui/use-stored-state.js";
import "../../ui/theme.css";
import "./popup.css";

function Popup() {
  const { state, refresh, error } = useStoredState();
  const enabled = state?.settings.enabled === true;
  const compatibility = (["chatgpt", "claude", "gemini"] as const).flatMap((adapter) => {
    const entry = state?.compatibility[adapter];
    return entry === undefined ? [] : [entry];
  });
  const protectedCount = compatibility.filter((entry) => entry.status === "protected").length;
  const unavailable = compatibility.some((entry) => entry.status === "protection_unavailable");
  const tone = error || unavailable ? "unavailable" : protectedCount > 0 ? "protected" : "warning";
  const label = error
    ? "Local state unavailable"
    : !enabled
      ? "Protection paused"
      : protectedCount > 0
        ? "Protected adapter active"
        : "Supported sites not active";

  return (
    <div className="popup">
      <header className="popup-header">
        <Brand compact />
        <StatusPill label={label} tone={tone} />
      </header>
      <section className="popup-hero" aria-labelledby="popup-title">
        <p className="eyebrow">Local protection circuit</p>
        <h1 id="popup-title">Nothing leaves before the check.</h1>
        <p className="muted">Prompts and detections stay on this device.</p>
      </section>
      <section className="toggle-row" aria-label="Protection setting">
        <span>
          <strong>Protection</strong>
          <small>{enabled ? "Enabled on supported sites" : "Submissions are not inspected"}</small>
        </span>
        <button
          className={enabled ? "toggle toggle-on" : "toggle"}
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={state === undefined}
          onClick={() =>
            void updateSettings({ enabled: !enabled })
              .then(refresh)
              .catch(() => undefined)
          }
        >
          <span />
          <span className="sr-only">{enabled ? "Disable" : "Enable"} protection</span>
        </button>
      </section>
      <dl className="quick-stats">
        <div>
          <dt>Local scans</dt>
          <dd>{state?.counters.scans ?? "—"}</dd>
        </div>
        <div>
          <dt>Blocked</dt>
          <dd>{state?.counters.blocks ?? "—"}</dd>
        </div>
      </dl>
      <footer className="popup-actions">
        <button
          className="button-primary"
          type="button"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          Open privacy dashboard
        </button>
      </footer>
    </div>
  );
}

renderPage(<Popup />);
