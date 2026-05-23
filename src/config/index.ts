// biome-ignore lint/performance/noBarrelFile: public API surface for config module
export { ConfigManager, configManager } from "./manager.js";
export type { GlobalOptions, ResolvedConfig } from "./resolve.js";
export { resolveConfig } from "./resolve.js";
export type { FrontalConfig, ProfileConfig } from "./schema.js";
export { configSchema, profileSchema } from "./schema.js";
