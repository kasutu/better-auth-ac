import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@better-auth-ac/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@better-auth-ac/casl": fileURLToPath(
        new URL("./packages/casl/src/index.ts", import.meta.url),
      ),
      "better-auth-ac": fileURLToPath(new URL("./packages/plugin/src/index.ts", import.meta.url)),
    },
  },
  test: {
    coverage: { provider: "v8", reporter: ["text", "json-summary"] },
    include: ["packages/*/test/**/*.test.ts"],
  },
});
