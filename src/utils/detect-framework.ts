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
  angular: {
    build: "ng build",
    dev: "ng serve",
    install: "npm install",
    output: "dist",
  },
  custom: { install: "npm install", output: "dist" },
  gatsby: {
    build: "gatsby build",
    dev: "gatsby develop",
    install: "npm install",
    output: "public",
  },
  nextjs: {
    build: "next build",
    dev: "next dev",
    install: "npm install",
    output: ".next",
  },
  nuxt: {
    build: "nuxt build",
    dev: "nuxt dev",
    install: "npm install",
    output: ".output",
  },
  react: {
    build: "react-scripts build",
    dev: "react-scripts start",
    install: "npm install",
    output: "build",
  },
  svelte: {
    build: "vite build",
    dev: "vite dev",
    install: "npm install",
    output: "build",
  },
  vite: {
    build: "vite build",
    dev: "vite",
    install: "npm install",
    output: "dist",
  },
  vue: {
    build: "vue-cli-service build",
    dev: "vue-cli-service serve",
    install: "npm install",
    output: "dist",
  },
};

const CONFIG_FILE_MAP: { patterns: string[]; framework: Framework }[] = [
  {
    framework: "nextjs",
    patterns: ["next.config.js", "next.config.mjs", "next.config.ts"],
  },
  { framework: "nuxt", patterns: ["nuxt.config.ts", "nuxt.config.js"] },
  { framework: "angular", patterns: ["angular.json"] },
  { framework: "svelte", patterns: ["svelte.config.js", "svelte.config.ts"] },
  { framework: "gatsby", patterns: ["gatsby-config.js", "gatsby-config.ts"] },
  { framework: "vue", patterns: ["vue.config.js"] },
  {
    framework: "vite",
    patterns: ["vite.config.ts", "vite.config.js", "vite.config.mjs"],
  },
];

const DEPENDENCY_MAP: { pkg: string; framework: Framework }[] = [
  { framework: "nextjs", pkg: "next" },
  { framework: "react", pkg: "react-scripts" },
  { framework: "svelte", pkg: "@sveltejs/kit" },
  { framework: "angular", pkg: "@angular/core" },
  { framework: "nuxt", pkg: "nuxt" },
  { framework: "gatsby", pkg: "gatsby" },
  { framework: "vue", pkg: "vue" },
  { framework: "vite", pkg: "vite" },
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
}
