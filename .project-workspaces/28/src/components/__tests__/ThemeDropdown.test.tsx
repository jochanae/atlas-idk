import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ThemeDropdown from "../ThemeDropdown";

// Mock the ThemeProvider hook
const mockSetTheme = vi.fn();
vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: mockSetTheme,
    resolvedTheme: "dark",
    toggleTheme: vi.fn(),
  }),
}));

describe("ThemeDropdown", () => {
  it("renders the trigger button with correct icon", () => {
    render(<ThemeDropdown />);
    const button = screen.getByTitle("Toggle theme");
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe("BUTTON");
  });

  it("has accessible sr-only label", () => {
    render(<ThemeDropdown />);
    expect(screen.getByText("Toggle theme")).toBeInTheDocument();
  });

  it("uses Radix DropdownMenu with aria-haspopup", () => {
    render(<ThemeDropdown />);
    const button = screen.getByTitle("Toggle theme");
    expect(button).toHaveAttribute("aria-haspopup", "menu");
  });

  it("accepts custom buttonClassName", () => {
    render(<ThemeDropdown buttonClassName="custom-class" />);
    const button = screen.getByTitle("Toggle theme");
    expect(button.className).toContain("custom-class");
  });
});
