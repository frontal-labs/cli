import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { clearMockApi } from "../helpers/cli.js";

// Isolate the CLI from the developer's real ~/.frontal profile store.
process.env.FRONTAL_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), "frontal-cli-test-")
);
// FRONTAL_LIVE gates the network suites in tests/live, and FRONTAL_SDK_SOURCE
// points the consumer fixture at an SDK checkout. Everything else that could
// leak a developer's credentials or environment into tests is dropped.
const KEEP = new Set([
  "FRONTAL_CONFIG_DIR",
  "FRONTAL_LIVE",
  "FRONTAL_SDK_SOURCE",
]);
for (const key of Object.keys(process.env)) {
  if (key.startsWith("FRONTAL_") && !KEEP.has(key)) {
    delete process.env[key];
  }
}

// Global test setup
global.console = {
  ...console,
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  // Suppress console.log in tests unless explicitly needed
  log: vi.fn(),
  warn: vi.fn(),
};

// Mock environment variables
process.env.NODE_ENV = "test";

// Import configManager after env is set
import { configManager } from "@/config/manager.js";

// Clear config before each test to prevent cross-test pollution
beforeEach(() => {
  configManager.deleteProfile("default");
  configManager.setActiveProfile("default");
});

// Set up global test timeout
vi.setConfig({
  hookTimeout: 10_000,
  testTimeout: 10_000,
});

// Global cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  clearMockApi();
});
