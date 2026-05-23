import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigManager } from "../../../src/config/manager.js";

describe("ConfigManager", () => {
  let tmpDir: string;
  let configPath: string;
  let configManager: ConfigManager;

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/frontal-test-");
    configPath = join(tmpDir, "config.json");
    configManager = new ConfigManager(configPath);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("load", () => {
    it("should load existing config file", () => {
      const testConfig = {
        schemaVersion: 2,
        activeProfile: "default",
        profiles: {
          default: { apiKey: "test-key" },
        },
        telemetry: { enabled: false },
        defaults: { outputFormat: "table", paginationLimit: 25 },
      };
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(configPath, JSON.stringify(testConfig));

      const config = configManager.load();
      expect(config).toEqual(testConfig);
    });

    it("should return default config when file doesn't exist", () => {
      const config = configManager.load();
      expect(config).toHaveProperty("profiles");
      expect(config).toHaveProperty("activeProfile", "default");
    });
  });

  describe("save", () => {
    it("should save config to file", () => {
      const testConfig = {
        schemaVersion: 2,
        activeProfile: "default",
        profiles: {},
        telemetry: { enabled: false },
        defaults: { outputFormat: "table", paginationLimit: 25 },
      };

      configManager.save(testConfig);

      const config = configManager.load();
      expect(config).toEqual(testConfig);
    });
  });

  describe("getProfile", () => {
    it("should return existing profile", () => {
      configManager.save({
        schemaVersion: 2,
        activeProfile: "custom",
        profiles: {
          custom: { baseUrl: "https://api.test.com" },
        },
        telemetry: { enabled: false },
        defaults: {},
      });

      const profile = configManager.getProfile("custom");
      expect(profile.baseUrl).toBe("https://api.test.com");
    });

    it("should return empty object when profile doesn't exist", () => {
      configManager.save({
        schemaVersion: 2,
        activeProfile: "default",
        profiles: {},
        telemetry: { enabled: false },
        defaults: {},
      });

      const profile = configManager.getProfile("nonexistent");
      expect(profile).toEqual({});
    });
  });

  describe("setProfile", () => {
    it("should update existing profile", () => {
      configManager.save({
        schemaVersion: 2,
        activeProfile: "default",
        profiles: { default: {} },
        telemetry: { enabled: false },
        defaults: {},
      });

      configManager.setProfile("default", { baseUrl: "https://new.api.com" });

      const profile = configManager.getProfile("default");
      expect(profile.baseUrl).toBe("https://new.api.com");
    });
  });

  describe("deleteProfile", () => {
    it("should delete existing profile", () => {
      configManager.save({
        schemaVersion: 2,
        activeProfile: "default",
        profiles: { profile1: { apiKey: "key" }, default: {} },
        telemetry: { enabled: false },
        defaults: {},
      });

      configManager.deleteProfile("profile1");

      const profiles = configManager.listProfiles();
      expect(profiles).not.toContain("profile1");
    });
  });

  describe("listProfiles", () => {
    it("should return list of profile names", () => {
      configManager.save({
        schemaVersion: 2,
        activeProfile: "default",
        profiles: { default: {}, staging: {} },
        telemetry: { enabled: false },
        defaults: {},
      });

      const profiles = configManager.listProfiles();
      expect(profiles.sort()).toEqual(["default", "staging"]);
    });
  });
});
