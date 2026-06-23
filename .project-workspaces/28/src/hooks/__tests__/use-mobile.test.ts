import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "../use-mobile";

describe("useIsMobile", () => {
  it("returns false for desktop width (>= 1024)", () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true for mobile width (< 1024)", () => {
    Object.defineProperty(window, "innerWidth", { value: 800, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns true for smallest supported viewport (320)", () => {
    Object.defineProperty(window, "innerWidth", { value: 320, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});
