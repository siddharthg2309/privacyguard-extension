import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export function renderPage(content: ReactNode): void {
  const root = document.querySelector("#root");
  if (root === null) throw new Error("UI_ROOT_MISSING");
  createRoot(root).render(<StrictMode>{content}</StrictMode>);
}
