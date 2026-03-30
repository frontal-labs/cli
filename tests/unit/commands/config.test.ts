import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerConfigCommands } from "../../../src/commands/config.js";
import { mockProcess } from "../../utils/mocks.js";
import { captureStderr, captureStdout } from "../../utils/test-helpers.js";

describe("Config Commands", () => {
  let program: Command;
  let mockProcessUtils: any;
  let stdoutCapture: any;
  let stderrCapture: any;

  beforeEach(() => {
    program = new Command();
    mockProcessUtils = mockProcess();
    stdoutCapture = captureStdout();
    stderrCapture = captureStderr();

    registerConfigCommands(program);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockProcessUtils.restore();
    stdoutCapture.restore();
    stderrCapture.restore();
  });

  describe("list command", () => {
    it("should list all configuration profiles", async () => {
      const listCommand = program.commands.find((cmd) => cmd.name() === "list");
      expect(listCommand).toBeDefined();

      const mockConfigManager = {
        listProfiles: vi.fn().mockReturnValue(["default", "dev", "prod"]),
        getProfile: vi.fn().mockImplementation((name) => {
          const profiles = {
            default: { apiUrl: "https://api.frontal.ai" },
            dev: { apiUrl: "https://dev-api.frontal.ai" },
            prod: { apiUrl: "https://prod-api.frontal.ai" },
          };
          return profiles[name as keyof typeof profiles] || {};
        }),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "config", "list"]);

      expect(mockConfigManager.listProfiles).toHaveBeenCalled();
      expect(stdoutCapture.outputs.join("")).toContain("default");
      expect(stdoutCapture.outputs.join("")).toContain("dev");
      expect(stdoutCapture.outputs.join("")).toContain("prod");
    });

    it("should handle JSON output format", async () => {
      const listCommand = program.commands.find((cmd) => cmd.name() === "list");
      expect(listCommand).toBeDefined();

      const mockConfigManager = {
        listProfiles: vi.fn().mockReturnValue(["default", "dev"]),
        getProfile: vi.fn().mockImplementation((name) => {
          const profiles = {
            default: { apiUrl: "https://api.frontal.ai" },
            dev: { apiUrl: "https://dev-api.frontal.ai" },
          };
          return profiles[name as keyof typeof profiles] || {};
        }),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "config", "list", "--json"]);

      const output = stdoutCapture.outputs.join("");
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("profiles");
      expect(Array.isArray(parsed.profiles)).toBe(true);
    });
  });

  describe("get command", () => {
    it("should get specific configuration value", async () => {
      const getCommand = program.commands.find((cmd) => cmd.name() === "get");
      expect(getCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({
          apiUrl: "https://api.frontal.ai",
          orgId: "org_123",
        }),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "config", "get", "apiUrl"]);

      expect(mockConfigManager.getProfile).toHaveBeenCalled();
      expect(stdoutCapture.outputs.join("")).toContain(
        "https://api.frontal.ai"
      );
    });

    it("should handle missing configuration value", async () => {
      const getCommand = program.commands.find((cmd) => cmd.name() === "get");
      expect(getCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({}),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "config", "get", "nonexistent"]);

      expect(stderrCapture.outputs.join("")).toContain("not set");
    });

    it("should get value from specific profile", async () => {
      const getCommand = program.commands.find((cmd) => cmd.name() === "get");
      expect(getCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({
          apiUrl: "https://dev-api.frontal.ai",
        }),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync([
        "frontal",
        "config",
        "get",
        "apiUrl",
        "--profile",
        "dev",
      ]);

      expect(mockConfigManager.getProfile).toHaveBeenCalledWith("dev");
    });
  });

  describe("set command", () => {
    it("should set configuration value", async () => {
      const setCommand = program.commands.find((cmd) => cmd.name() === "set");
      expect(setCommand).toBeDefined();

      const mockConfigManager = {
        setProfile: vi.fn(),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync([
        "frontal",
        "config",
        "set",
        "apiUrl",
        "https://new-api.frontal.ai",
      ]);

      expect(mockConfigManager.setProfile).toHaveBeenCalledWith("default", {
        apiUrl: "https://new-api.frontal.ai",
      });
    });

    it("should set value for specific profile", async () => {
      const setCommand = program.commands.find((cmd) => cmd.name() === "set");
      expect(setCommand).toBeDefined();

      const mockConfigManager = {
        setProfile: vi.fn(),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync([
        "frontal",
        "config",
        "set",
        "apiUrl",
        "https://dev-api.frontal.ai",
        "--profile",
        "dev",
      ]);

      expect(mockConfigManager.setProfile).toHaveBeenCalledWith("dev", {
        apiUrl: "https://dev-api.frontal.ai",
      });
    });

    it("should handle boolean values", async () => {
      const setCommand = program.commands.find((cmd) => cmd.name() === "set");
      expect(setCommand).toBeDefined();

      const mockConfigManager = {
        setProfile: vi.fn(),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "config", "set", "debug", "true"]);

      expect(mockConfigManager.setProfile).toHaveBeenCalledWith("default", {
        debug: true,
      });
    });
  });

  describe("unset command", () => {
    it("should remove configuration value", async () => {
      const unsetCommand = program.commands.find(
        (cmd) => cmd.name() === "unset"
      );
      expect(unsetCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi
          .fn()
          .mockReturnValue({ apiUrl: "https://api.frontal.ai" }),
        setProfile: vi.fn(),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "config", "unset", "apiUrl"]);

      expect(mockConfigManager.getProfile).toHaveBeenCalled();
      expect(mockConfigManager.setProfile).toHaveBeenCalledWith("default", {});
    });

    it("should handle missing configuration value", async () => {
      const unsetCommand = program.commands.find(
        (cmd) => cmd.name() === "unset"
      );
      expect(unsetCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({}),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "config", "unset", "nonexistent"]);

      expect(stderrCapture.outputs.join("")).toContain("not set");
    });
  });

  describe("profile commands", () => {
    describe("create", () => {
      it("should create new profile", async () => {
        const createCommand = program.commands
          .find((cmd) => cmd.name() === "profile")
          ?.commands.find((cmd) => cmd.name() === "create");
        expect(createCommand).toBeDefined();

        const mockConfigManager = {
          setProfile: vi.fn(),
        };

        vi.mock("../../../src/config/manager.js", () => ({
          configManager: mockConfigManager,
        }));

        await program.parseAsync([
          "frontal",
          "config",
          "profile",
          "create",
          "new-profile",
        ]);

        expect(mockConfigManager.setProfile).toHaveBeenCalledWith(
          "new-profile",
          {}
        );
      });
    });

    describe("delete", () => {
      it("should delete existing profile", async () => {
        const deleteCommand = program.commands
          .find((cmd) => cmd.name() === "profile")
          ?.commands.find((cmd) => cmd.name() === "delete");
        expect(deleteCommand).toBeDefined();

        const mockConfigManager = {
          deleteProfile: vi.fn(),
        };

        vi.mock("../../../src/config/manager.js", () => ({
          configManager: mockConfigManager,
        }));

        await program.parseAsync([
          "frontal",
          "config",
          "profile",
          "delete",
          "old-profile",
        ]);

        expect(mockConfigManager.deleteProfile).toHaveBeenCalledWith(
          "old-profile"
        );
      });

      it("should not allow deletion of default profile", async () => {
        const deleteCommand = program.commands
          .find((cmd) => cmd.name() === "profile")
          ?.commands.find((cmd) => cmd.name() === "delete");
        expect(deleteCommand).toBeDefined();

        await program.parseAsync([
          "frontal",
          "config",
          "profile",
          "delete",
          "default",
        ]);

        expect(stderrCapture.outputs.join("")).toContain(
          "Cannot delete default profile"
        );
      });
    });

    describe("use", () => {
      it("should set active profile", async () => {
        const useCommand = program.commands
          .find((cmd) => cmd.name() === "profile")
          ?.commands.find((cmd) => cmd.name() === "use");
        expect(useCommand).toBeDefined();

        const mockConfigManager = {
          setActiveProfile: vi.fn(),
          listProfiles: vi.fn().mockReturnValue(["default", "dev"]),
        };

        vi.mock("../../../src/config/manager.js", () => ({
          configManager: mockConfigManager,
        }));

        await program.parseAsync([
          "frontal",
          "config",
          "profile",
          "use",
          "dev",
        ]);

        expect(mockConfigManager.setActiveProfile).toHaveBeenCalledWith("dev");
      });

      it("should validate profile exists", async () => {
        const useCommand = program.commands
          .find((cmd) => cmd.name() === "profile")
          ?.commands.find((cmd) => cmd.name() === "use");
        expect(useCommand).toBeDefined();

        const mockConfigManager = {
          setActiveProfile: vi.fn(),
          listProfiles: vi.fn().mockReturnValue(["default"]),
        };

        vi.mock("../../../src/config/manager.js", () => ({
          configManager: mockConfigManager,
        }));

        await program.parseAsync([
          "frontal",
          "config",
          "profile",
          "use",
          "nonexistent",
        ]);

        expect(stderrCapture.outputs.join("")).toContain("does not exist");
        expect(mockConfigManager.setActiveProfile).not.toHaveBeenCalled();
      });
    });
  });

  describe("edit command", () => {
    it("should open config in editor", async () => {
      const editCommand = program.commands.find((cmd) => cmd.name() === "edit");
      expect(editCommand).toBeDefined();

      const mockConfigManager = {
        configPath: "/test/path/.frontal/config.json",
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      const mockSpawn = vi.fn();
      vi.mock("child_process", () => ({
        spawn: mockSpawn,
      }));

      await program.parseAsync(["frontal", "config", "edit"]);

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringMatching(/editor|code|nano|vim/),
        ["/test/path/.frontal/config.json"],
        { stdio: "inherit" }
      );
    });
  });
});
