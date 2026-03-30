import { vi } from "vitest";
import type {
  ConfigManager,
  FrontalConfig,
  ProfileConfig,
} from "../../src/config/manager.js";

// Mock ConfigManager class
export const createMockConfigManager = (
  overrides: Partial<ConfigManager> = {}
) => {
  return {
    load: vi.fn(),
    save: vi.fn(),
    exists: vi.fn(),
    getProfile: vi.fn(),
    setProfile: vi.fn(),
    deleteProfile: vi.fn(),
    setActiveProfile: vi.fn(),
    getActiveProfileName: vi.fn(),
    listProfiles: vi.fn(),
    setDefault: vi.fn(),
    getDefault: vi.fn(),
    configPath: "/test/.frontal/config.json",
    configDir: "/test/.frontal",
    ...overrides,
  } as any;
};

// Mock config data
export const mockFrontalConfig = (
  overrides: Partial<FrontalConfig> = {}
): FrontalConfig => ({
  activeProfile: "default",
  profiles: {
    default: {
      apiKey: "test-api-key",
      baseUrl: "https://api.frontal.ai",
      orgId: "org_123",
      workspaceId: "ws_123",
      debug: false,
    },
  },
  defaults: {
    apiUrl: "https://api.frontal.ai",
    timeout: 30_000,
  },
  ...overrides,
});

export const mockProfileConfig = (
  overrides: Partial<ProfileConfig> = {}
): ProfileConfig => ({
  apiKey: "test-api-key",
  baseUrl: "https://api.frontal.ai",
  orgId: "org_123",
  workspaceId: "ws_123",
  debug: false,
  ...overrides,
});

// Mock config scenarios
export const mockEmptyConfig = (): FrontalConfig => ({
  activeProfile: "default",
  profiles: {
    default: {},
  },
  defaults: {
    apiUrl: "https://api.frontal.ai",
    timeout: 30_000,
  },
});

export const mockMultiProfileConfig = (): FrontalConfig => ({
  activeProfile: "work",
  profiles: {
    default: {
      apiKey: "default-key",
      baseUrl: "https://api.frontal.ai",
      orgId: "org_default",
      workspaceId: "ws_default",
    },
    work: {
      apiKey: "work-key",
      baseUrl: "https://work-api.frontal.ai",
      orgId: "org_work",
      workspaceId: "ws_work",
      debug: true,
    },
    personal: {
      apiKey: "personal-key",
      baseUrl: "https://personal-api.frontal.ai",
      orgId: "org_personal",
      workspaceId: "ws_personal",
    },
  },
  defaults: {
    apiUrl: "https://api.frontal.ai",
    timeout: 30_000,
  },
});

// Mock config manager with preset data
export const createConfigManagerWithData = (config: FrontalConfig) => {
  return createMockConfigManager({
    load: vi.fn().mockReturnValue(config),
    save: vi.fn(),
    exists: vi.fn().mockReturnValue(true),
    getProfile: vi.fn().mockImplementation((name?: string) => {
      const profileName = name ?? config.activeProfile;
      return config.profiles[profileName] ?? {};
    }),
    setProfile: vi
      .fn()
      .mockImplementation((name: string, data: ProfileConfig) => {
        config.profiles[name] = { ...config.profiles[name], ...data };
      }),
    deleteProfile: vi.fn().mockImplementation((name: string) => {
      delete config.profiles[name];
      if (config.activeProfile === name) {
        config.activeProfile = "default";
      }
    }),
    setActiveProfile: vi.fn().mockImplementation((name: string) => {
      config.activeProfile = name;
    }),
    getActiveProfileName: vi.fn().mockReturnValue(config.activeProfile),
    listProfiles: vi.fn().mockReturnValue(Object.keys(config.profiles)),
    setDefault: vi.fn(),
    getDefault: vi.fn(),
  });
};

// Mock file system operations for config
export const mockConfigFileSystem = (config: FrontalConfig) => {
  const fs = vi.mock("fs");
  const path = vi.mock("path");
  const os = vi.mock("os");

  os.homedir = vi.fn().mockReturnValue("/test/home");
  path.join = vi.fn((...args) => args.join("/"));
  path.dirname = vi.fn((p: string) => p.split("/").slice(0, -1).join("/"));

  fs.existsSync = vi.fn().mockReturnValue(true);
  fs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(config, null, 2));
  fs.writeFileSync = vi.fn();
  fs.mkdirSync = vi.fn();

  return { fs, path, os };
};

// Mock config errors
export const mockConfigNotFoundError = new Error("Config file not found");
mockConfigNotFoundError.name = "ConfigNotFoundError";

export const mockConfigParseError = new Error("Invalid config format");
mockConfigParseError.name = "ConfigParseError";

// Mock config manager with errors
export const createConfigManagerWithError = (error: Error) => {
  return createMockConfigManager({
    load: vi.fn().mockImplementation(() => {
      throw error;
    }),
    save: vi.fn().mockImplementation(() => {
      throw error;
    }),
  });
};
