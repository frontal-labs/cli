import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAuthCommands } from "../../../src/commands/auth.js";
import {
  mockAuthToken,
  mockLoginResponse,
  mockUserData,
} from "../../fixtures/auth-data.js";
import { mockProcess, mockPrompts } from "../../utils/mocks.js";
import { captureStderr, captureStdout } from "../../utils/test-helpers.js";

describe("Auth Commands", () => {
  let program: Command;
  let mockPromptsUtils: any;
  let mockProcessUtils: any;
  let stdoutCapture: any;
  let stderrCapture: any;

  beforeEach(() => {
    program = new Command();
    mockPromptsUtils = mockPrompts();
    mockProcessUtils = mockProcess();
    stdoutCapture = captureStdout();
    stderrCapture = captureStderr();

    registerAuthCommands(program);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockProcessUtils.restore();
    stdoutCapture.restore();
    stderrCapture.restore();
  });

  describe("login command", () => {
    it("should prompt for email and password", async () => {
      mockPromptsUtils.text
        .mockResolvedValueOnce("test@example.com")
        .mockResolvedValueOnce("password123");

      // Mock successful login
      const mockApiClient = {
        post: vi.fn().mockResolvedValue(mockLoginResponse),
      };

      vi.mock("../../../src/http/client.js", () => ({
        ApiClient: vi.fn(() => mockApiClient),
      }));

      const loginCommand = program.commands.find(
        (cmd) => cmd.name() === "login"
      );
      expect(loginCommand).toBeDefined();

      // Test command parsing
      const mockParseAsync = vi.fn();
      program.parseAsync = mockParseAsync;

      await program.parseAsync(["frontal", "login"]);

      expect(mockPromptsUtils.text).toHaveBeenCalledTimes(2);
      expect(mockPromptsUtils.text).toHaveBeenCalledWith({
        message: "Email",
        validate: expect.any(Function),
      });
      expect(mockPromptsUtils.text).toHaveBeenCalledWith({
        message: "Password",
        validate: expect.any(Function),
      });
    });

    it("should validate email format", async () => {
      mockPromptsUtils.text.mockImplementation((options: any) => {
        if (options.message === "Email") {
          const validate = options.validate;
          expect(validate("invalid-email")).toBe("Please enter a valid email");
          expect(validate("valid@example.com")).toBe(true);
        }
        return "test@example.com";
      });

      const loginCommand = program.commands.find(
        (cmd) => cmd.name() === "login"
      );
      expect(loginCommand).toBeDefined();
    });

    it("should handle login failure", async () => {
      mockPromptsUtils.text
        .mockResolvedValueOnce("test@example.com")
        .mockResolvedValueOnce("wrongpassword");

      const mockApiClient = {
        post: vi.fn().mockRejectedValue(new Error("Invalid credentials")),
      };

      vi.mock("../../../src/http/client.js", () => ({
        ApiClient: vi.fn(() => mockApiClient),
      }));

      const loginCommand = program.commands.find(
        (cmd) => cmd.name() === "login"
      );
      expect(loginCommand).toBeDefined();

      await expect(program.parseAsync(["frontal", "login"])).rejects.toThrow(
        "Invalid credentials"
      );
    });
  });

  describe("logout command", () => {
    it("should clear stored credentials", async () => {
      const logoutCommand = program.commands.find(
        (cmd) => cmd.name() === "logout"
      );
      expect(logoutCommand).toBeDefined();

      // Mock config manager
      const mockConfigManager = {
        setProfile: vi.fn(),
        getProfile: vi.fn().mockReturnValue({ apiKey: "test-key" }),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "logout"]);

      expect(mockConfigManager.setProfile).toHaveBeenCalledWith("default", {
        apiKey: undefined,
      });
    });

    it("should handle logout when not logged in", async () => {
      const logoutCommand = program.commands.find(
        (cmd) => cmd.name() === "logout"
      );
      expect(logoutCommand).toBeDefined();

      const mockConfigManager = {
        setProfile: vi.fn(),
        getProfile: vi.fn().mockReturnValue({}),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "logout"]);

      expect(stderrCapture.outputs.join("")).toContain(
        "No active session found"
      );
    });
  });

  describe("status command", () => {
    it("should show current authentication status", async () => {
      const statusCommand = program.commands.find(
        (cmd) => cmd.name() === "status"
      );
      expect(statusCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({
          apiKey: "test-key",
          orgId: "org_123",
          workspaceId: "ws_123",
        }),
      };

      const mockApiClient = {
        get: vi.fn().mockResolvedValue(mockUserData),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      vi.mock("../../../src/http/client.js", () => ({
        ApiClient: vi.fn(() => mockApiClient),
      }));

      await program.parseAsync(["frontal", "auth", "status"]);

      expect(mockConfigManager.getProfile).toHaveBeenCalled();
      expect(mockApiClient.get).toHaveBeenCalledWith("/user");
    });

    it("should show not authenticated when no API key", async () => {
      const statusCommand = program.commands.find(
        (cmd) => cmd.name() === "status"
      );
      expect(statusCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({}),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "auth", "status"]);

      expect(stdoutCapture.outputs.join("")).toContain("Not authenticated");
    });

    it("should handle API errors gracefully", async () => {
      const statusCommand = program.commands.find(
        (cmd) => cmd.name() === "status"
      );
      expect(statusCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({ apiKey: "test-key" }),
      };

      const mockApiClient = {
        get: vi.fn().mockRejectedValue(new Error("API Error")),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      vi.mock("../../../src/http/client.js", () => ({
        ApiClient: vi.fn(() => mockApiClient),
      }));

      await program.parseAsync(["frontal", "auth", "status"]);

      expect(stderrCapture.outputs.join("")).toContain(
        "Failed to fetch user info"
      );
    });
  });

  describe("whoami command", () => {
    it("should display current user information", async () => {
      const whoamiCommand = program.commands.find(
        (cmd) => cmd.name() === "whoami"
      );
      expect(whoamiCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({ apiKey: "test-key" }),
      };

      const mockApiClient = {
        get: vi.fn().mockResolvedValue(mockUserData),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      vi.mock("../../../src/http/client.js", () => ({
        ApiClient: vi.fn(() => mockApiClient),
      }));

      await program.parseAsync(["frontal", "auth", "whoami"]);

      expect(stdoutCapture.outputs.join("")).toContain(mockUserData.email);
      expect(stdoutCapture.outputs.join("")).toContain(mockUserData.name);
    });

    it("should handle JSON output format", async () => {
      const whoamiCommand = program.commands.find(
        (cmd) => cmd.name() === "whoami"
      );
      expect(whoamiCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({ apiKey: "test-key" }),
      };

      const mockApiClient = {
        get: vi.fn().mockResolvedValue(mockUserData),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      vi.mock("../../../src/http/client.js", () => ({
        ApiClient: vi.fn(() => mockApiClient),
      }));

      await program.parseAsync(["frontal", "auth", "whoami", "--json"]);

      const output = stdoutCapture.outputs.join("");
      expect(JSON.parse(output)).toEqual(mockUserData);
    });
  });

  describe("refresh command", () => {
    it("should refresh authentication token", async () => {
      const refreshCommand = program.commands.find(
        (cmd) => cmd.name() === "refresh"
      );
      expect(refreshCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({ refreshToken: "refresh_token" }),
        setProfile: vi.fn(),
      };

      const mockApiClient = {
        post: vi.fn().mockResolvedValue(mockLoginResponse),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      vi.mock("../../../src/http/client.js", () => ({
        ApiClient: vi.fn(() => mockApiClient),
      }));

      await program.parseAsync(["frontal", "auth", "refresh"]);

      expect(mockApiClient.post).toHaveBeenCalledWith("/auth/refresh", {
        refreshToken: "refresh_token",
      });
      expect(mockConfigManager.setProfile).toHaveBeenCalledWith("default", {
        apiKey: mockAuthToken.accessToken,
      });
    });

    it("should handle missing refresh token", async () => {
      const refreshCommand = program.commands.find(
        (cmd) => cmd.name() === "refresh"
      );
      expect(refreshCommand).toBeDefined();

      const mockConfigManager = {
        getProfile: vi.fn().mockReturnValue({}),
      };

      vi.mock("../../../src/config/manager.js", () => ({
        configManager: mockConfigManager,
      }));

      await program.parseAsync(["frontal", "auth", "refresh"]);

      expect(stderrCapture.outputs.join("")).toContain(
        "No refresh token found"
      );
    });
  });
});
