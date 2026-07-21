import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetComposerSessionGuardForTests,
  isActiveComposerSession,
  markSoftAuthPause,
  readSoftAuthPause,
  shouldHardRedirectOnConfirmedAuthExpiry,
} from "@/lib/composerSessionGuard";
import { setAskAtlasComposerDraft, clearAskAtlasComposerDraft } from "@/lib/composerDraftStore";
import {
  __resetGhostClickShieldForTests,
  clearPickerPending,
  markPickerPending,
} from "@/lib/ghostClickShield";

/**
 * INT-01 acceptance:
 * Start typing (or attach / Ask Atlas active), expire the session, verify the
 * user is not unexpectedly hard-redirected while work is in progress.
 */
describe("INT-01 composer session auth guard", () => {
  afterEach(() => {
    __resetComposerSessionGuardForTests();
    __resetGhostClickShieldForTests();
    clearPickerPending();
    clearAskAtlasComposerDraft();
    document.body.removeAttribute("data-axiom-ask-atlas");
    document.body.removeAttribute("data-axiom-thread");
    vi.restoreAllMocks();
  });

  it("allows hard redirect when no composer session is active", () => {
    expect(isActiveComposerSession()).toBe(false);
    expect(shouldHardRedirectOnConfirmedAuthExpiry()).toBe(true);
  });

  it("blocks hard redirect while the user has typed a draft (acceptance)", () => {
    setAskAtlasComposerDraft({ input: "Let me show you this deck…" });
    expect(isActiveComposerSession()).toBe(true);
    expect(shouldHardRedirectOnConfirmedAuthExpiry()).toBe(false);
  });

  it("blocks hard redirect while a file picker is pending", () => {
    markPickerPending("picker_open:attach");
    expect(isActiveComposerSession()).toBe(true);
    expect(shouldHardRedirectOnConfirmedAuthExpiry()).toBe(false);
  });

  it("blocks hard redirect while Ask Atlas surface is visible", () => {
    document.body.setAttribute("data-axiom-ask-atlas", "true");
    expect(isActiveComposerSession()).toBe(true);
    expect(shouldHardRedirectOnConfirmedAuthExpiry()).toBe(false);
  });

  it("blocks hard redirect while an active thread flag is set", () => {
    document.body.setAttribute("data-axiom-thread", "active");
    expect(isActiveComposerSession()).toBe(true);
    expect(shouldHardRedirectOnConfirmedAuthExpiry()).toBe(false);
  });

  it("records a soft-auth pause instead of redirecting", () => {
    setAskAtlasComposerDraft({ input: "still thinking" });
    const detail = markSoftAuthPause("session_expired", "install-api-fetch");
    expect(detail.reason).toBe("session_expired");
    expect(readSoftAuthPause()?.reason).toBe("session_expired");
    expect(shouldHardRedirectOnConfirmedAuthExpiry()).toBe(false);
  });
});
