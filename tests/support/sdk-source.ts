import { join, resolve } from "node:path";

/** The repository root, which holds the installed SDK packages in `node_modules`. */
export const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

/**
 * The installed `@frontal-labs/*` packages, at the exact versions pinned in
 * package.json. Used by the parity check. Nothing here reaches into a sibling
 * checkout.
 */
export const SDK_PACKAGES = join(REPO_ROOT, "node_modules", "@frontal-labs");

/**
 * The SDK entry point the consumer projects map `@frontal-labs/sdk` to: the
 * test double in ./mock-sdk, which talks to the mock ontology backend. The
 * generated client targets an SDK API newer than the pinned release, so the
 * suites use this double rather than the installed package.
 */
export const SDK_SOURCE = join(import.meta.dirname, "mock-sdk", "index.ts");

/** The ontology package's entity derivation, used by the runtime-metadata parity check. */
export const ENTITY_DERIVE_SOURCE = join(
  SDK_PACKAGES,
  "ontology",
  "src",
  "entity-derive.ts"
);
