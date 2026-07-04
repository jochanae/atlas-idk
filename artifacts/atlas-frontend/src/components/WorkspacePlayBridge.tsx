import { useEffect } from "react";

/**
 * Bridges the header-mounted <ShellPlayButton> events back into workspace state.
 * Preserves the exact original behavior of the subheader Play button:
 *   - tap             → toggle preview LaunchModal
 *   - long-press      → toggle subheader (Changes/Blueprints/Outputs/Console tabs)
 * Also broadcasts subheader expanded state so the header button can rotate its
 * play glyph to indicate the tabs are open.
 */
export function WorkspacePlayBridge({
  onLaunch,
  subheaderOpen,
  setSubheaderOpen,
  hasProject,
}: {
  launchModalOpen: boolean;
  onLaunch: () => void;
  subheaderOpen: boolean;
  setSubheaderOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasProject: boolean;
}) {
  useEffect(() => {
    const onTap = () => onLaunch();
    const onLong = () => {
      if (!hasProject) return;
      setSubheaderOpen((v: boolean) => !v);
    };
    window.addEventListener("axiom:workspace-launch-tap", onTap);
    window.addEventListener("axiom:workspace-launch-longpress", onLong);
    return () => {
      window.removeEventListener("axiom:workspace-launch-tap", onTap);
      window.removeEventListener("axiom:workspace-launch-longpress", onLong);
    };
  }, [onLaunch, setSubheaderOpen, hasProject]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("axiom:workspace-subheader-state", { detail: { expanded: subheaderOpen } })
    );
  }, [subheaderOpen]);

  return null;
}
