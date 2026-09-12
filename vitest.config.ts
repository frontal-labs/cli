import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: ["src/index.ts", "src/cli.ts", "src/version.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
    },
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup/global.ts", "./tests/setup/after-env.ts"],
  },
});
