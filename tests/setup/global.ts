import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

// Isolate the CLI from the developer's real ~/.frontal profile store.
process.env.FRONTAL_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), "frontal-cli-test-")
);
for (const key of Object.keys(process.env)) {
  if (key.startsWith("FRONTAL_") && key !== "FRONTAL_CONFIG_DIR") {
    delete process.env[key];
  }
}

// Global test setup
global.console = {
  ...console,
  // Suppress console.log in tests unless explicitly needed
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Mock environment variables
process.env.NODE_ENV = "test";

// Set up global test timeout
vi.setConfig({
  testTimeout: 10_000,
  hookTimeout: 10_000,
});

// Global cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
