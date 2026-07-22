import { afterEach, describe, expect, it } from "vitest";
import {
  dockVisibility,
  HANDOFF_LOCKED_COMPOSER_CLEARANCE_PX,
  HANDOFF_LOCKED_DOCK_RESERVED_PX,
  isHandoffChromeLocked,
} from "../useDockVisibility";

describe("handoff chrome lock (INT-37)", () => {
  afterEach(() => {
    dockVisibility.setHandoffLock(false);
  });

  it("freezes dock reserved + composer clearance tokens while locked", () => {
    dockVisibility.setHandoffLock(true);
    expect(isHandoffChromeLocked()).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--atlas-dock-reserved")).toBe(
      HANDOFF_LOCKED_DOCK_RESERVED_PX,
    );
    expect(
      document.documentElement.style.getPropertyValue("--atlas-composer-clearance"),
    ).toBe(HANDOFF_LOCKED_COMPOSER_CLEARANCE_PX);
  });

  it("clears the lock for a single post-hydration transition", () => {
    dockVisibility.setHandoffLock(true);
    dockVisibility.setHandoffLock(false);
    expect(isHandoffChromeLocked()).toBe(false);
  });
});
