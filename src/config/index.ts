// biome-ignore lint/performance/noBarrelFile: public API surface for config module
export { ConfigManager, configManager } from "@/config/manager.js";
export type { GlobalOptions, ResolvedConfig } from "@/config/resolve.js";
export { resolveConfig } from "@/config/resolve.js";
export type { FrontalConfig, ProfileConfig } from "@/config/schema.js";
export { configSchema, profileSchema } from "@/config/schema.js";
