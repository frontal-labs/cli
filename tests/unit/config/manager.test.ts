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
    rmSync(tmpDir, { force: true, recursive: true });
  });

  describe("load", () => {
    it("should load existing config file", () => {
      const testConfig = {
        activeProfile: "default",
        defaults: { outputFormat: "table", paginationLimit: 25 },
        profiles: {
          default: { apiKey: "test-key" },
        },
        schemaVersion: 2,
        telemetry: { enabled: false },
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
        activeProfile: "default",
        defaults: { outputFormat: "table", paginationLimit: 25 },
        profiles: {},
        schemaVersion: 2,
        telemetry: { enabled: false },
      };

      configManager.save(testConfig);

      const config = configManager.load();
      expect(config).toEqual(testConfig);
    });
  });

  describe("getProfile", () => {
    it("should return existing profile", () => {
      configManager.save({
        activeProfile: "custom",
        defaults: {},
        profiles: {
          custom: { baseUrl: "https://api.test.com" },
        },
        schemaVersion: 2,
        telemetry: { enabled: false },
      });

      const profile = configManager.getProfile("custom");
      expect(profile.baseUrl).toBe("https://api.test.com");
    });

    it("should return empty object when profile doesn't exist", () => {
      configManager.save({
        activeProfile: "default",
        defaults: {},
        profiles: {},
        schemaVersion: 2,
        telemetry: { enabled: false },
      });

      const profile = configManager.getProfile("nonexistent");
      expect(profile).toEqual({});
    });
  });

  describe("setProfile", () => {
    it("should update existing profile", () => {
      configManager.save({
        activeProfile: "default",
        defaults: {},
        profiles: { default: {} },
        schemaVersion: 2,
        telemetry: { enabled: false },
      });

      configManager.setProfile("default", { baseUrl: "https://new.api.com" });

      const profile = configManager.getProfile("default");
      expect(profile.baseUrl).toBe("https://new.api.com");
    });
  });

  describe("deleteProfile", () => {
    it("should delete existing profile", () => {
      configManager.save({
        activeProfile: "default",
        defaults: {},
        profiles: { default: {}, profile1: { apiKey: "key" } },
        schemaVersion: 2,
        telemetry: { enabled: false },
      });

      configManager.deleteProfile("profile1");

      const profiles = configManager.listProfiles();
      expect(profiles).not.toContain("profile1");
    });
  });

  describe("listProfiles", () => {
    it("should return list of profile names", () => {
      configManager.save({
        activeProfile: "default",
        defaults: {},
        profiles: { default: {}, staging: {} },
        schemaVersion: 2,
        telemetry: { enabled: false },
      });

      const profiles = configManager.listProfiles();
      expect(profiles.sort((a, b) => a.localeCompare(b))).toEqual([
        "default",
        "staging",
      ]);
    });
  });
});
