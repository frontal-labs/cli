import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  configSchema,
  type FrontalConfig,
  type ProfileConfig,
} from "./schema.js";

const CONFIG_DIR = join(homedir(), ".frontal");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export class ConfigManager {
  private readonly configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? CONFIG_FILE;
  }

  get configDir(): string {
    return dirname(this.configPath);
  }

  exists(): boolean {
    return existsSync(this.configPath);
  }

  load(): FrontalConfig {
    if (!this.exists()) {
      return configSchema.parse({});
    }

    try {
      const raw = readFileSync(this.configPath, "utf-8");
      return configSchema.parse(JSON.parse(raw));
    } catch {
      return configSchema.parse({});
    }
  }

  save(config: FrontalConfig): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, `${JSON.stringify(config, null, 2)}\n`);
  }

  getProfile(name?: string): ProfileConfig {
    const config = this.load();
    const profileName = name ?? config.activeProfile;
    return config.profiles[profileName] ?? {};
  }

  setProfile(name: string, data: ProfileConfig): void {
    const config = this.load();
    config.profiles[name] = { ...config.profiles[name], ...data };
    this.save(config);
  }

  deleteProfile(name: string): void {
    const config = this.load();
    delete config.profiles[name];
    if (config.activeProfile === name) {
      config.activeProfile = "default";
    }
    this.save(config);
  }

  setActiveProfile(name: string): void {
    const config = this.load();
    config.activeProfile = name;
    this.save(config);
  }

  getActiveProfileName(): string {
    return this.load().activeProfile;
  }

  listProfiles(): string[] {
    return Object.keys(this.load().profiles);
  }

  setDefault(key: string, value: unknown): void {
    const config = this.load();
    (config.defaults as Record<string, unknown>)[key] = value;
    this.save(config);
  }

  getDefault(key: string): unknown {
    const config = this.load();
    return (config.defaults as Record<string, unknown>)[key];
  }
}

export const configManager = new ConfigManager();
