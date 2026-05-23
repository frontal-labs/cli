import { vi } from "vitest";

// Setup global test environment
beforeEach(() => {
  // Clear process env modifications
  const originalEnv = { ...process.env };
  vi.restoreAllMocks();

  // Reset environment variables to original state
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
});

// Cleanup after each test
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// Global error handler for unhandled promise rejections in tests
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
