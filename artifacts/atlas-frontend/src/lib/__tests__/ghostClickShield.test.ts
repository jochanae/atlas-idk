import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __ghostClickShieldForTests,
  __resetGhostClickShieldForTests,
  clearPickerPending,
  GHOST_SHIELD_DOCUMENT_MS,
  installGhostClickShield,
  isDocumentLikeFile,
  markPickerPending,
  removeGhostClickShield,
  shieldMsForFiles,
} from "@/lib/ghostClickShield";

describe("ghostClickShield", () => {
  afterEach(() => {
    __resetGhostClickShieldForTests();
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

  it("treats PowerPoint as document-like with a longer shield", () => {
    const pptx = new File(["x"], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    expect(isDocumentLikeFile(pptx)).toBe(true);
    expect(shieldMsForFiles([pptx])).toBe(GHOST_SHIELD_DOCUMENT_MS);
    expect(
      isDocumentLikeFile(new File(["x"], "shot.png", { type: "image/png" })),
    ).toBe(false);
  });

  it("re-arms shield when page becomes visible while picker is pending", () => {
    vi.useFakeTimers();
    markPickerPending("picker_open:attach");
    installGhostClickShield("picker_open:attach", 200);
    vi.advanceTimersByTime(200);
    expect(__ghostClickShieldForTests().active).toBe(false);

    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(__ghostClickShieldForTests().active).toBe(true);
    expect(__ghostClickShieldForTests().reason).toBe("picker_visibility_return");
    clearPickerPending();
    removeGhostClickShield();
  });
});
