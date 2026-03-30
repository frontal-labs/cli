import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/index.js";
import {
  mockApiKeys,
  mockLoginResponse,
  mockUserData,
} from "../fixtures/auth-data.js";
import {
  mockEnv,
  mockFetchGlobal,
  mockFileSystem,
  mockPrompts,
} from "../utils/mocks.js";
import { captureStderr, captureStdout } from "../utils/test-helpers.js";

describe("Authentication Workflow Integration", () => {
  let mockFetch: any;
  let mockPromptsUtils: any;
  let mockFs: any;
  let mockEnvUtils: any;
  let stdoutCapture: any;
  let stderrCapture: any;

  beforeEach(() => {
    mockFetch = mockFetchGlobal();
    mockPromptsUtils = mockPrompts();
    mockFs = mockFileSystem();
    mockEnvUtils = mockEnv({ HOME: "/test/home" });
    stdoutCapture = captureStdout();
    stderrCapture = captureStderr();

    // Mock config file operations
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({
        activeProfile: "default",
        profiles: {
          default: {},
        },
        defaults: {},
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    stdoutCapture.restore();
    stderrCapture.restore();
    mockEnvUtils.restore();
  });

  describe("Complete authentication flow", () => {
    it("should handle login -> status -> logout workflow", async () => {
      // Step 1: Login
      mockPromptsUtils.text
        .mockResolvedValueOnce("test@example.com")
        .mockResolvedValueOnce("password123");

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockLoginResponse),
      });

      await run(["frontal", "login"]);

      expect(mockPromptsUtils.text).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/login"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            email: "test@example.com",
            password: "password123",
          }),
        })
      );

      // Verify config was updated with API key
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(mockLoginResponse.token.accessToken)
      );

      // Step 2: Check status
      vi.clearAllMocks();
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          activeProfile: "default",
          profiles: {
            default: { apiKey: mockLoginResponse.token.accessToken },
          },
          defaults: {},
        })
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserData),
      });

      await run(["frontal", "auth", "status"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/user"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockLoginResponse.token.accessToken}`,
          }),
        })
      );

      // Step 3: Logout
      vi.clearAllMocks();
      await run(["frontal", "logout"]);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining(mockLoginResponse.token.accessToken)
      );
    });

    it("should handle API key management workflow", async () => {
      // Setup authenticated state
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          activeProfile: "default",
          profiles: {
            default: { apiKey: mockLoginResponse.token.accessToken },
          },
          defaults: {},
        })
      );

      // List API keys
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockApiKeys),
      });

      await run(["frontal", "api-keys", "list"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api-keys"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockLoginResponse.token.accessToken}`,
          }),
        })
      );

      // Create new API key
      vi.clearAllMocks();
      mockPromptsUtils.text.mockResolvedValue("Test Key");
      mockPromptsUtils.multiselect.mockResolvedValue(["read", "write"]);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: "key_new",
            name: "Test Key",
            key: "fr_test_newkey123456",
            permissions: ["read", "write"],
          }),
      });

      await run(["frontal", "api-keys", "create"]);

      expect(mockPromptsUtils.text).toHaveBeenCalledWith({
        message: "Key name",
        validate: expect.any(Function),
      });
      expect(mockPromptsUtils.multiselect).toHaveBeenCalledWith({
        message: "Select permissions",
        options: expect.arrayContaining([
          { value: "read", label: "Read" },
          { value: "write", label: "Write" },
          { value: "admin", label: "Admin" },
        ]),
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api-keys"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Test Key",
            permissions: ["read", "write"],
          }),
        })
      );

      // Delete API key
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      await run(["frontal", "api-keys", "delete", "key_new"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api-keys/key_new"),
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  describe("Error handling in authentication flow", () => {
    it("should handle login failure gracefully", async () => {
      mockPromptsUtils.text
        .mockResolvedValueOnce("test@example.com")
        .mockResolvedValueOnce("wrongpassword");

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: "Invalid credentials",
          }),
      });

      await expect(run(["frontal", "login"])).rejects.toThrow();

      expect(stderrCapture.outputs.join("")).toContain("Login failed");
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it("should handle network errors during authentication", async () => {
      mockPromptsUtils.text
        .mockResolvedValueOnce("test@example.com")
        .mockResolvedValueOnce("password123");

      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(run(["frontal", "login"])).rejects.toThrow();

      expect(stderrCapture.outputs.join("")).toContain("Network error");
    });

    it("should handle expired token", async () => {
      // Setup with expired token
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          activeProfile: "default",
          profiles: {
            default: { apiKey: "expired_token" },
          },
          defaults: {},
        })
      );

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: "Token expired",
          }),
      });

      await expect(run(["frontal", "auth", "status"])).rejects.toThrow();

      expect(stderrCapture.outputs.join("")).toContain(
        "Authentication required"
      );
    });
  });

  describe("Configuration integration", () => {
    it("should use custom API URL from config", async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          activeProfile: "default",
          profiles: {
            default: {
              apiKey: mockLoginResponse.token.accessToken,
              baseUrl: "https://custom-api.example.com",
            },
          },
          defaults: {},
        })
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserData),
      });

      await run(["frontal", "auth", "status"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://custom-api.example.com"),
        expect.any(Object)
      );
    });

    it("should override config with command line options", async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          activeProfile: "default",
          profiles: {
            default: {
              apiKey: "config_key",
              baseUrl: "https://config-api.example.com",
            },
          },
          defaults: {},
        })
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserData),
      });

      await run([
        "frontal",
        "--api-key",
        mockLoginResponse.token.accessToken,
        "--api-url",
        "https://override-api.example.com",
        "auth",
        "status",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://override-api.example.com"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockLoginResponse.token.accessToken}`,
          }),
        })
      );
    });
  });

  describe("Profile switching", () => {
    it("should maintain separate authentication per profile", async () => {
      // Setup multiple profiles
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          activeProfile: "work",
          profiles: {
            default: { apiKey: "default_token" },
            work: { apiKey: "work_token" },
            personal: { apiKey: "personal_token" },
          },
          defaults: {},
        })
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserData),
      });

      // Check status with active work profile
      await run(["frontal", "auth", "status"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer work_token",
          }),
        })
      );

      // Switch to personal profile
      vi.clearAllMocks();
      await run(["frontal", "config", "profile", "use", "personal"]);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("personal")
      );

      // Check status with personal profile
      vi.clearAllMocks();
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          activeProfile: "personal",
          profiles: {
            default: { apiKey: "default_token" },
            work: { apiKey: "work_token" },
            personal: { apiKey: "personal_token" },
          },
          defaults: {},
        })
      );

      await run(["frontal", "auth", "status"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer personal_token",
          }),
        })
      );
    });
  });
});
