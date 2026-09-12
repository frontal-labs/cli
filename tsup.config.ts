import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: false,
  clean: true,
  target: "node18",
  platform: "node",
  shims: false,
});
