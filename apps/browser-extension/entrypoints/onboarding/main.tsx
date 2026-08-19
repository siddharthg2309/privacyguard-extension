import { browser } from "wxt/browser";

import { Brand } from "../../ui/components/Brand.js";
import { renderPage } from "../../ui/render-page.js";
import "../../ui/theme.css";
import "./onboarding.css";

const promises = [
  {
    number: "01",
    title: "Held before send",
    body: "Supported submissions are paused before the site can transmit them.",
  },
  {
    number: "02",
    title: "Inspected locally",
    body: "Prompts, detections, and redaction maps remain in browser memory on this device.",
  },
  {
    number: "03",
    title: "Honest protection states",
    body: "If an adapter or worker cannot guarantee protection, the extension says so and sends nothing automatically.",
  },
] as const;

function Onboarding() {
  async function finish(): Promise<void> {
    await browser.runtime.sendMessage({ schemaVersion: 1, type: "COMPLETE_ONBOARDING" });
    await browser.runtime.openOptionsPage();
    window.close();
  }

  return (
    <div className="onboarding-shell">
      <header>
        <Brand />
      </header>
      <section className="onboarding-hero">
        <p className="eyebrow">Your local checkpoint</p>
        <h1>Private by architecture, not by promise.</h1>
        <p>
          The extension adds a visible decision point between your prompt and supported AI websites.
        </p>
      </section>
      <ol className="promise-grid">
        {promises.map((promise) => (
          <li key={promise.number}>
            <span>{promise.number}</span>
            <h2>{promise.title}</h2>
            <p>{promise.body}</p>
          </li>
        ))}
      </ol>
      <section className="permission-callout" aria-labelledby="permission-title">
        <div>
          <p className="eyebrow">Least privilege</p>
          <h2 id="permission-title">Only supported AI domains</h2>
        </div>
        <p>
          The extension requests local storage and access only to ChatGPT, Claude, and Gemini. It
          never requests access to every website.
        </p>
      </section>
      <footer>
        <button className="button-primary" type="button" onClick={() => void finish()}>
          Open local dashboard
        </button>
        <p>No account or cloud connection required.</p>
      </footer>
    </div>
  );
}

renderPage(<Onboarding />);
