import { createRoot, type Root } from "react-dom/client";

import type {
  ProtectionViewActions,
  ProtectionViewPort,
} from "../lib/controller/protection-controller.js";
import type { ProtectionState } from "../lib/state/protection-machine.js";
import { ProtectionReview } from "./components/ProtectionReview.js";

export type MountedProtectionView = ProtectionViewPort & { unmount(): void };

export function mountProtectionView(container: HTMLElement): MountedProtectionView {
  const root: Root = createRoot(container);
  return {
    render: (state: ProtectionState, actions: ProtectionViewActions) => {
      root.render(<ProtectionReview state={state} actions={actions} />);
    },
    unmount: () => root.unmount(),
  };
}
