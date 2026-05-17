import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@workspace/api-client-react": path.resolve(
        import.meta.dirname,
        "src/_workspace/api-client-react/src/index.ts",
      ),
    },
  },
  plugins: [
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
});
