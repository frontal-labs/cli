import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/index.js";
import {
  mockContainers,
  mockDeployments,
  mockFunctions,
} from "../fixtures/deployment-data.js";
import { mockWorkspaces } from "../fixtures/org-data.js";
import { mockEnv, mockFetchGlobal, mockFileSystem } from "../utils/mocks.js";
import { captureStderr, captureStdout } from "../utils/test-helpers.js";

describe("Deployment Workflow Integration", () => {
  let mockFetch: any;
  let mockFs: any;
  let mockEnvUtils: any;
  let stdoutCapture: any;
  let stderrCapture: any;

  beforeEach(() => {
    mockFetch = mockFetchGlobal();
    mockFs = mockFileSystem();
    mockEnvUtils = mockEnv({ HOME: "/test/home" });
    stdoutCapture = captureStdout();
    stderrCapture = captureStderr();

    // Setup authenticated state
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({
        activeProfile: "default",
        profiles: {
          default: {
            apiKey: "test-api-key",
            orgId: "org_123",
            workspaceId: "ws_123",
          },
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

  describe("Complete deployment flow", () => {
    it("should handle deploy -> list -> status -> logs workflow", async () => {
      // Step 1: Create deployment
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockDeployments[0]),
      });

      await run([
        "frontal",
        "deployments",
        "create",
        "--name",
        "web-app-v1.0.0",
        "--image",
        "nginx:latest",
        "--replicas",
        "3",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/deployments"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "web-app-v1.0.0",
            image: "nginx:latest",
            replicas: 3,
          }),
        })
      );

      // Step 2: List deployments
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: mockDeployments,
            pagination: {
              page: 1,
              limit: 20,
              total: mockDeployments.length,
              totalPages: 1,
            },
          }),
      });

      await run(["frontal", "deployments", "list"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/deployments"),
        expect.objectContaining({ method: "GET" })
      );

      // Step 3: Get deployment status
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockDeployments[0]),
      });

      await run(["frontal", "deployments", "status", "deploy_123"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/deployments/deploy_123"),
        expect.objectContaining({ method: "GET" })
      );

      // Step 4: Get deployment logs
      vi.clearAllMocks();
      const mockLogs = [
        {
          timestamp: "2024-01-01T10:00:00Z",
          level: "info",
          message: "Container started",
        },
        {
          timestamp: "2024-01-01T10:01:00Z",
          level: "info",
          message: "Ready to serve requests",
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockLogs),
      });

      await run(["frontal", "deployments", "logs", "deploy_123"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/deployments/deploy_123/logs"),
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should handle container management within deployment", async () => {
      // List containers for deployment
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockContainers),
      });

      await run([
        "frontal",
        "containers",
        "list",
        "--deployment",
        "deploy_123",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/deployments/deploy_123/containers"),
        expect.objectContaining({ method: "GET" })
      );

      // Scale containers
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockContainers[0],
            replicas: 5,
          }),
      });

      await run([
        "frontal",
        "containers",
        "scale",
        "container_123",
        "--replicas",
        "5",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/containers/container_123/scale"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ replicas: 5 }),
        })
      );

      // Restart container
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockContainers[0],
            status: "restarting",
          }),
      });

      await run(["frontal", "containers", "restart", "container_123"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/containers/container_123/restart"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("should handle function deployment workflow", async () => {
      // Create function
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockFunctions[0]),
      });

      await run([
        "frontal",
        "functions",
        "create",
        "--name",
        "process-webhook",
        "--runtime",
        "nodejs18",
        "--handler",
        "handler.process",
        "--memory",
        "256",
        "--timeout",
        "30",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/functions"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "process-webhook",
            runtime: "nodejs18",
            handler: "handler.process",
            memory: 256,
            timeout: 30,
          }),
        })
      );

      // List functions
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: mockFunctions,
            pagination: {
              page: 1,
              limit: 20,
              total: mockFunctions.length,
              totalPages: 1,
            },
          }),
      });

      await run(["frontal", "functions", "list"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/functions"),
        expect.objectContaining({ method: "GET" })
      );

      // Update function
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockFunctions[0],
            memory: 512,
            timeout: 60,
          }),
      });

      await run([
        "frontal",
        "functions",
        "update",
        "func_123",
        "--memory",
        "512",
        "--timeout",
        "60",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/functions/func_123"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            memory: 512,
            timeout: 60,
          }),
        })
      );

      // Delete function
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      await run(["frontal", "functions", "delete", "func_123"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/functions/func_123"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("Multi-environment deployment", () => {
    it("should handle deployment across different environments", async () => {
      // Setup workspaces for different environments
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockWorkspaces),
      });

      await run(["frontal", "workspaces", "list"]);

      // Deploy to staging
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            ...mockDeployments[0],
            environment: "staging",
            workspaceId: "ws_456",
          }),
      });

      await run([
        "frontal",
        "--workspace",
        "ws_456",
        "deployments",
        "create",
        "--name",
        "web-app-staging",
        "--image",
        "nginx:latest",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/deployments"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "web-app-staging",
            image: "nginx:latest",
          }),
        })
      );

      // Deploy to production
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            ...mockDeployments[0],
            environment: "production",
            workspaceId: "ws_123",
          }),
      });

      await run([
        "frontal",
        "--workspace",
        "ws_123",
        "deployments",
        "create",
        "--name",
        "web-app-production",
        "--image",
        "nginx:latest",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/deployments"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "web-app-production",
            image: "nginx:latest",
          }),
        })
      );
    });
  });

  describe("Deployment monitoring and metrics", () => {
    it("should handle deployment metrics collection", async () => {
      // Get deployment metrics
      const mockMetrics = {
        cpu: { usage: 45.2, limit: 100 },
        memory: { usage: 256, limit: 512 },
        requests: { total: 1250, success: 1240, errors: 10 },
        responseTime: { avg: 120, p95: 250, p99: 450 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockMetrics),
      });

      await run(["frontal", "metrics", "deployment", "deploy_123"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/deployments/deploy_123/metrics"),
        expect.objectContaining({ method: "GET" })
      );

      // Get real-time metrics
      vi.clearAllMocks();
      const _mockStreamEvents = [
        { event: "metric", data: { cpu: 50.1, memory: 260 } },
        { event: "metric", data: { cpu: 48.7, memory: 255 } },
      ];

      // Mock streaming response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: () =>
              Promise.resolve({
                done: false,
                value: new TextEncoder().encode('data: {"cpu":50.1}\n\n'),
              }),
          }),
        },
      });

      // Note: This would need proper streaming implementation in the actual code
      // await run(["frontal", "metrics", "stream", "deploy_123"]);
    });
  });

  describe("Error handling in deployment workflow", () => {
    it("should handle deployment failure", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "Invalid image specification",
            details: "Image nginx:latest not found",
          }),
      });

      await expect(
        run([
          "frontal",
          "deployments",
          "create",
          "--name",
          "test-deploy",
          "--image",
          "nginx:latest",
        ])
      ).rejects.toThrow();

      expect(stderrCapture.outputs.join("")).toContain(
        "Invalid image specification"
      );
    });

    it("should handle container scaling limits", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: "Resource limit exceeded",
            details: "Cannot scale beyond 10 replicas",
          }),
      });

      await expect(
        run([
          "frontal",
          "containers",
          "scale",
          "container_123",
          "--replicas",
          "15",
        ])
      ).rejects.toThrow();

      expect(stderrCapture.outputs.join("")).toContain(
        "Resource limit exceeded"
      );
    });

    it("should handle function runtime errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "Unsupported runtime",
            details: "Runtime python3.9 is not supported",
          }),
      });

      await expect(
        run([
          "frontal",
          "functions",
          "create",
          "--name",
          "test-func",
          "--runtime",
          "python3.9",
          "--handler",
          "main.handler",
        ])
      ).rejects.toThrow();

      expect(stderrCapture.outputs.join("")).toContain("Unsupported runtime");
    });
  });

  describe("Configuration and context management", () => {
    it("should use organization and workspace context", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockDeployments),
      });

      await run([
        "frontal",
        "--org",
        "org_456",
        "--workspace",
        "ws_456",
        "deployments",
        "list",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "/organizations/org_456/workspaces/ws_456/deployments"
        ),
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should handle JSON output format", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockDeployments),
      });

      await run(["frontal", "deployments", "list", "--json"]);

      const output = stdoutCapture.outputs.join("");
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(mockDeployments.length);
    });
  });
});
