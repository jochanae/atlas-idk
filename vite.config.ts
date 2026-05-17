import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "path";

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        "@workspace/api-client-react": path.resolve(
          import.meta.dirname,
          "src/_workspace/api-client-react/src/index.ts",
        ),
      },
    },
  },
});
