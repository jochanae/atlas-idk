import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@workspace/api-client-react": path.resolve(
        import.meta.dirname,
        "src/_workspace/api-client-react/src",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
  },
});
