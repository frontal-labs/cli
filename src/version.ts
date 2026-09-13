// Injected at build time from package.json (see tsup.config.ts / bin/frontal.ts).
// The fallback keeps `bun run dev` and tests working from source.
declare const __FRONTAL_VERSION__: string | undefined;

export const VERSION: string =
  typeof __FRONTAL_VERSION__ === "string"
    ? __FRONTAL_VERSION__
    : (process.env.FRONTAL_CLI_VERSION ?? "0.0.0-dev");
