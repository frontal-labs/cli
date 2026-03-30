import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "bin/frontal": "bin/frontal.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: false,
  clean: true,
  target: "node18",
  platform: "node",
  shims: false,
});
