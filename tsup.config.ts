import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf-8")) as {
  version: string;
};

export default defineConfig({
  clean: true,
  define: { __FRONTAL_VERSION__: JSON.stringify(version) },
  dts: false,
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  platform: "node",
  shims: false,
  target: "node18",
});
