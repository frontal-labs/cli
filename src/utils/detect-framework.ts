import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Framework } from "@/schemas/frontal-json.js";

interface FrameworkDefaults {
  build?: string;
  dev?: string;
  install: string;
  output: string;
}

export const FRAMEWORK_DEFAULTS: Record<Framework, FrameworkDefaults> = {
  nextjs: {
    build: "next build",
    output: ".next",
    dev: "next dev",
    install: "npm install",
  },
  react: {
    build: "react-scripts build",
    output: "build",
    dev: "react-scripts start",
    install: "npm install",
  },
  vue: {
    build: "vue-cli-service build",
    output: "dist",
    dev: "vue-cli-service serve",
    install: "npm install",
  },
  svelte: {
    build: "vite build",
    output: "build",
    dev: "vite dev",
    install: "npm install",
  },
  angular: {
    build: "ng build",
    output: "dist",
    dev: "ng serve",
    install: "npm install",
  },
  nuxt: {
    build: "nuxt build",
    output: ".output",
    dev: "nuxt dev",
    install: "npm install",
  },
  gatsby: {
    build: "gatsby build",
    output: "public",
    dev: "gatsby develop",
    install: "npm install",
  },
  vite: {
    build: "vite build",
    output: "dist",
    dev: "vite",
    install: "npm install",
  },
  custom: { output: "dist", install: "npm install" },
};

const CONFIG_FILE_MAP: { patterns: string[]; framework: Framework }[] = [
  {
    patterns: ["next.config.js", "next.config.mjs", "next.config.ts"],
    framework: "nextjs",
  },
  { patterns: ["nuxt.config.ts", "nuxt.config.js"], framework: "nuxt" },
  { patterns: ["angular.json"], framework: "angular" },
  { patterns: ["svelte.config.js", "svelte.config.ts"], framework: "svelte" },
  { patterns: ["gatsby-config.js", "gatsby-config.ts"], framework: "gatsby" },
  { patterns: ["vue.config.js"], framework: "vue" },
  {
    patterns: ["vite.config.ts", "vite.config.js", "vite.config.mjs"],
    framework: "vite",
  },
];

const DEPENDENCY_MAP: { pkg: string; framework: Framework }[] = [
  { pkg: "next", framework: "nextjs" },
  { pkg: "react-scripts", framework: "react" },
  { pkg: "@sveltejs/kit", framework: "svelte" },
  { pkg: "@angular/core", framework: "angular" },
  { pkg: "nuxt", framework: "nuxt" },
  { pkg: "gatsby", framework: "gatsby" },
  { pkg: "vue", framework: "vue" },
  { pkg: "vite", framework: "vite" },
];

export function detectFramework(dir: string): Framework | undefined {
  // 1. Check config files
  for (const { patterns, framework } of CONFIG_FILE_MAP) {
    for (const pattern of patterns) {
      if (existsSync(join(dir, pattern))) {
        return framework;
      }
    }
  }

  // 2. Check package.json dependencies
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const { pkg: depName, framework } of DEPENDENCY_MAP) {
        if (depName in allDeps) {
          return framework;
        }
      }
    } catch {
      // Invalid package.json, skip
    }
  }

  return;
}
