import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

// Isolate the CLI from the developer's real ~/.frontal profile store.
process.env.FRONTAL_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), "frontal-cli-test-")
);
// FRONTAL_LIVE gates the network suites in tests/live; everything else that
// could leak a developer's credentials or environment into tests is dropped.
const KEEP = new Set(["FRONTAL_CONFIG_DIR", "FRONTAL_LIVE"]);
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

// Set up global test timeout
vi.setConfig({
  hookTimeout: 10_000,
  testTimeout: 10_000,
});

// Global cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
