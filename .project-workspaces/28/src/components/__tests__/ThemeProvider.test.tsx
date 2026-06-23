import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../ThemeProvider";

const ThemeConsumer = () => {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("system")}>Set System</button>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
};

describe("ThemeProvider", () => {
  it("defaults to dark theme", () => {
    localStorage.removeItem("presentq-theme");
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("allows switching to light theme", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText("Set Light"));
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("toggleTheme switches between dark and light", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText("Set Dark"));
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    fireEvent.click(screen.getByText("Toggle"));
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("persists theme to localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText("Set Light"));
    expect(localStorage.getItem("presentq-theme")).toBe("light");
  });

  it("system theme resolves based on matchMedia", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText("Set System"));
    expect(screen.getByTestId("theme").textContent).toBe("system");
    // matchMedia mock returns matches: false, so resolved should be "light"
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });
});
