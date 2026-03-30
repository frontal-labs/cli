import { vi } from "vitest";

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
