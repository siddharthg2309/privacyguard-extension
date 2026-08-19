import { useEffect, useState } from "react";

import { Brand } from "../../ui/components/Brand.js";
import { StatusPill } from "../../ui/components/StatusPill.js";
import { renderPage } from "../../ui/render-page.js";
import { updateSettings, useStoredState } from "../../ui/use-stored-state.js";
import "../../ui/theme.css";
import "./options.css";

function Options() {
  const { state, refresh, error } = useStoredState();
  const [saved, setSaved] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [allowCriticalOverride, setAllowCriticalOverride] = useState(false);
  const [locale, setLocale] = useState("en");

  useEffect(() => {
    if (state === undefined) return;
    setEnabled(state.settings.enabled);
    setAllowCriticalOverride(state.settings.policy.allowCriticalOverride);
    setLocale(state.settings.locale);
  }, [state]);

  async function save(): Promise<void> {
    await updateSettings({ enabled, allowCriticalOverride, locale });
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 2_000);
  }

  const adapters = ["chatgpt", "claude", "gemini"] as const;
  return (
    <div className="shell options-shell">
      <header className="dashboard-header">
        <Brand />
        <StatusPill
          label={
            error ? "Storage unavailable" : enabled ? "Local engine enabled" : "Protection paused"
          }
          tone={error ? "unavailable" : enabled ? "protected" : "warning"}
        />
      </header>
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Privacy control room</p>
          <h1>Local policy, visible outcomes.</h1>
          <p className="muted">No accounts. No cloud scanner. No raw-content history.</p>
        </div>
        <div className="circuit-map" aria-hidden="true">
          <span>Capture</span>
          <span>Scan</span>
          <span>Decide</span>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel settings-panel" id="main" aria-labelledby="settings-title">
          <p className="eyebrow">Settings</p>
          <h2 id="settings-title">Protection policy</h2>
          <label className="field-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span>
              <strong>Enable protection</strong>
              <small>Inspect supported submissions before transmission.</small>
            </span>
          </label>
          <label className="field-check field-critical">
            <input
              type="checkbox"
              checked={allowCriticalOverride}
              onChange={(event) => setAllowCriticalOverride(event.target.checked)}
            />
            <span>
              <strong>Allow critical overrides</strong>
              <small>
                Requires a separate explicit confirmation in supported adapters. Off is safest.
              </small>
            </span>
          </label>
          <label className="field-text" htmlFor="locale">
            Detection locale
            <input
              id="locale"
              value={locale}
              maxLength={24}
              onChange={(event) => setLocale(event.target.value)}
            />
          </label>
          <div className="save-row">
            <button
              className="button-primary"
              type="button"
              disabled={state === undefined}
              onClick={() => void save()}
            >
              Save local settings
            </button>
            <span role="status" aria-live="polite">
              {saved ? "Saved on this device" : ""}
            </span>
          </div>
        </section>

        <section className="panel metrics-panel" aria-labelledby="metrics-title">
          <p className="eyebrow">Aggregate only</p>
          <h2 id="metrics-title">Privacy activity</h2>
          <dl className="metric-grid">
            <div>
              <dt>Scans</dt>
              <dd>{state?.counters.scans ?? "—"}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{state?.counters.warnings ?? "—"}</dd>
            </div>
            <div>
              <dt>Blocked</dt>
              <dd>{state?.counters.blocks ?? "—"}</dd>
            </div>
            <div>
              <dt>Redacted</dt>
              <dd>{state?.counters.redactions ?? "—"}</dd>
            </div>
          </dl>
          <p className="privacy-note">
            Only counts are stored. Prompts, detected values, and redaction maps are never retained.
          </p>
        </section>
      </div>

      <section className="panel adapter-panel" aria-labelledby="adapter-title">
        <p className="eyebrow">Capability truth</p>
        <h2 id="adapter-title">Adapter status</h2>
        <div className="adapter-grid">
          {adapters.map((adapter) => {
            const compatibility = state?.compatibility[adapter];
            const status = compatibility?.status ?? "unsupported";
            return (
              <article key={adapter}>
                <h3>
                  {adapter === "chatgpt" ? "ChatGPT" : adapter === "claude" ? "Claude" : "Gemini"}
                </h3>
                <StatusPill
                  label={status.replaceAll("_", " ")}
                  tone={
                    status === "protected"
                      ? "protected"
                      : status === "protection_unavailable"
                        ? "unavailable"
                        : "warning"
                  }
                />
                <p>
                  {compatibility?.errorCode ??
                    "Adapter verification has not run in this browser session."}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

renderPage(<Options />);
