import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __ghostClickShieldForTests,
  installGhostClickShield,
  removeGhostClickShield,
} from "@/lib/ghostClickShield";

describe("ghostClickShield", () => {
  afterEach(() => {
    removeGhostClickShield();
    vi.useRealTimers();
  });

  it("installs a full-viewport shield that blocks click/pointerdown", () => {
    installGhostClickShield("file_selected", 500);
    expect(__ghostClickShieldForTests().active).toBe(true);
    expect(__ghostClickShieldForTests().reason).toBe("file_selected");

    const shield = document.querySelector("[data-atlas-ghost-shield]") as HTMLDivElement;
    expect(shield).toBeTruthy();

    let reached = false;
    document.body.addEventListener("click", () => {
      reached = true;
    });

    shield.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(reached).toBe(false);
  });

  it("removes itself after the timeout", () => {
    vi.useFakeTimers();
    installGhostClickShield("picker_open:attach", 450);
    expect(__ghostClickShieldForTests().active).toBe(true);
    vi.advanceTimersByTime(450);
    expect(__ghostClickShieldForTests().active).toBe(false);
    expect(document.querySelector("[data-atlas-ghost-shield]")).toBeNull();
  });

  it("refreshes duration when installed again while active", () => {
    vi.useFakeTimers();
    installGhostClickShield("picker_open:attach", 450);
    vi.advanceTimersByTime(400);
    installGhostClickShield("file_selected", 450);
    expect(__ghostClickShieldForTests().reason).toBe("file_selected");
    vi.advanceTimersByTime(400);
    // Original would have expired; refresh should keep it alive.
    expect(__ghostClickShieldForTests().active).toBe(true);
    vi.advanceTimersByTime(50);
    expect(__ghostClickShieldForTests().active).toBe(false);
  });
});
