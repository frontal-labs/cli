import { vi } from "vitest";

// Mock database connections and utilities for testing
export const mockDb = {
  query: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
};

// Mock Redis client
export const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
  flushall: vi.fn(),
  disconnect: vi.fn(),
};

// Database setup utilities
export async function setupTestDatabase() {
  // Initialize test database
  vi.mocked(mockDb.query).mockResolvedValue([]);
  return mockDb;
}

export async function cleanupTestDatabase() {
  // Clean up test database
  vi.clearAllMocks();
}

export async function setupTestRedis() {
  // Initialize test Redis
  vi.mocked(mockRedis.get).mockResolvedValue(null);
  return mockRedis;
}

export async function cleanupTestRedis() {
  // Clean up test Redis
  vi.clearAllMocks();
}
