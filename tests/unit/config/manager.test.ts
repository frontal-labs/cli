import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigManager } from "../../../src/config/manager.js";
import { mockEnv, mockFileSystem } from "../../utils/mocks.js";
import { createTempConfig } from "../../utils/test-helpers.js";

describe("ConfigManager", () => {
  let configManager: ConfigManager;
  let mockFs: any;
  let mockEnvUtils: any;

  beforeEach(() => {
    mockFs = mockFileSystem();
    mockEnvUtils = mockEnv({ HOME: "/test/home" });
    configManager = new ConfigManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockEnvUtils.restore();
  });

  describe("constructor", () => {
    it("should initialize with default config path", () => {
      expect(configManager).toBeInstanceOf(ConfigManager);
    });
  });

  describe("load", () => {
    it("should load existing config file", () => {
      const testConfig = createTempConfig();
      mockFs.readFile.mockResolvedValue(JSON.stringify(testConfig));

      // Mock synchronous file operations
      const _originalExistsSync = require("node:fs").existsSync;
      const _originalReadFileSync = require("node:fs").readFileSync;

      vi.mock("fs", () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify(testConfig)),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        dirname: vi.fn((path: string) =>
          path.split("/").slice(0, -1).join("/")
        ),
      }));

      const config = configManager.load();

      expect(config).toEqual(testConfig);
    });

    it("should return default config when file doesn't exist", () => {
      vi.mock("fs", () => ({
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        dirname: vi.fn((path: string) =>
          path.split("/").slice(0, -1).join("/")
        ),
      }));

      const config = configManager.load();

      expect(config).toHaveProperty("profiles");
      expect(config).toHaveProperty("activeProfile", "default");
    });
  });

  describe("save", () => {
    it("should save config to file", () => {
      const testConfig = createTempConfig();

      vi.mock("fs", () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify(testConfig)),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        dirname: vi.fn((path: string) =>
          path.split("/").slice(0, -1).join("/")
        ),
      }));

      configManager.save(testConfig);

      const writeFileSync = require("node:fs").writeFileSync;
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(JSON.stringify(testConfig, null, 2))
      );
    });
  });

  describe("getProfile", () => {
    it("should return existing profile", () => {
      const testConfig = createTempConfig({
        profile1: { apiUrl: "https://api.test.com" },
      });

      vi.mock("fs", () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify(testConfig)),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        dirname: vi.fn((path: string) =>
          path.split("/").slice(0, -1).join("/")
        ),
      }));

      const profile = configManager.getProfile("profile1");

      expect(profile).toEqual({ apiUrl: "https://api.test.com" });
    });

    it("should return default profile when profile doesn't exist", () => {
      const testConfig = createTempConfig();

      vi.mock("fs", () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify(testConfig)),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        dirname: vi.fn((path: string) =>
          path.split("/").slice(0, -1).join("/")
        ),
      }));

      const profile = configManager.getProfile("nonexistent");

      expect(profile).toEqual({});
    });
  });

  describe("setProfile", () => {
    it("should update existing profile", () => {
      const testConfig = createTempConfig();

      vi.mock("fs", () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify(testConfig)),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        dirname: vi.fn((path: string) =>
          path.split("/").slice(0, -1).join("/")
        ),
      }));

      const newProfile = { apiUrl: "https://new.api.com" };
      configManager.setProfile("default", newProfile);

      const writeFileSync = require("node:fs").writeFileSync;
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  describe("deleteProfile", () => {
    it("should delete existing profile", () => {
      const testConfig = createTempConfig();

      vi.mock("fs", () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify(testConfig)),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        dirname: vi.fn((path: string) =>
          path.split("/").slice(0, -1).join("/")
        ),
      }));

      configManager.deleteProfile("profile1");

      const writeFileSync = require("node:fs").writeFileSync;
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  describe("listProfiles", () => {
    it("should return list of profile names", () => {
      const testConfig = createTempConfig();

      vi.mock("fs", () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify(testConfig)),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        dirname: vi.fn((path: string) =>
          path.split("/").slice(0, -1).join("/")
        ),
      }));

      const profiles = configManager.listProfiles();

      expect(profiles).toEqual(["default"]);
    });
  });
});
