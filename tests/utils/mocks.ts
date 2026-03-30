import { vi } from "vitest";

// Mock fetch globally
export function mockFetchGlobal() {
  const mockFetch = vi.fn();
  global.fetch = mockFetch as any;
  return mockFetch;
}

// Mock AbortController
export function mockAbortController() {
  const mockAbort = vi.fn();
  const mockSignal = {
    aborted: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const mockController = {
    signal: mockSignal,
    abort: mockAbort,
  };

  vi.stubGlobal(
    "AbortController",
    vi.fn(() => mockController)
  );

  return { mockController, mockAbort, mockSignal };
}

// Mock setTimeout and setInterval
export function mockTimers() {
  vi.useFakeTimers();
  return {
    advanceTime: (ms: number) => vi.advanceTimersByTime(ms),
    runAllTimers: () => vi.runAllTimers(),
    restore: () => vi.useRealTimers(),
  };
}

// Mock process methods
export function mockProcess() {
  const mockExit = vi.fn();
  const mockStdin = {
    setRawMode: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  const mockStdout = {
    write: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  const mockStderr = {
    write: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };

  const originalProcess = { ...process };

  Object.defineProperty(process, "exit", {
    value: mockExit,
    configurable: true,
  });
  Object.defineProperty(process, "stdin", {
    value: mockStdin,
    configurable: true,
  });
  Object.defineProperty(process, "stdout", {
    value: mockStdout,
    configurable: true,
  });
  Object.defineProperty(process, "stderr", {
    value: mockStderr,
    configurable: true,
  });

  return {
    mockExit,
    mockStdin,
    mockStdout,
    mockStderr,
    restore: () => {
      Object.defineProperty(process, "exit", {
        value: originalProcess.exit,
        configurable: true,
      });
      Object.defineProperty(process, "stdin", {
        value: originalProcess.stdin,
        configurable: true,
      });
      Object.defineProperty(process, "stdout", {
        value: originalProcess.stdout,
        configurable: true,
      });
      Object.defineProperty(process, "stderr", {
        value: originalProcess.stderr,
        configurable: true,
      });
    },
  };
}

// Mock file system operations
export function mockFileSystem() {
  const mockFiles = new Map<string, string>();
  const mockStats = {
    isFile: vi.fn(() => true),
    isDirectory: vi.fn(() => false),
    size: 1024,
    mtime: new Date(),
  };

  const mockFs = {
    readFile: vi.fn((path: string) => {
      const content = mockFiles.get(path);
      return content
        ? Promise.resolve(content)
        : Promise.reject(new Error("File not found"));
    }),
    writeFile: vi.fn((path: string, content: string) => {
      mockFiles.set(path, content);
      return Promise.resolve();
    }),
    access: vi.fn((path: string) => {
      if (mockFiles.has(path)) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("Access denied"));
    }),
    stat: vi.fn(() => Promise.resolve(mockStats)),
    mkdir: vi.fn(() => Promise.resolve()),
    readdir: vi.fn(() => Promise.resolve(Array.from(mockFiles.keys()))),
    unlink: vi.fn((path: string) => {
      mockFiles.delete(path);
      return Promise.resolve();
    }),
  };

  vi.mock("fs", () => mockFs);
  vi.mock("fs/promises", () => mockFs);

  return mockFs;
}

// Mock environment variables
export function mockEnv(initialEnv: Record<string, string> = {}) {
  const originalEnv = { ...process.env };

  // Clear existing env
  Object.keys(process.env).forEach((key) => {
    delete process.env[key];
  });

  // Set new env
  Object.assign(process.env, initialEnv);

  return {
    set: (key: string, value: string) => {
      process.env[key] = value;
    },
    get: (key: string) => process.env[key],
    remove: (key: string) => {
      delete process.env[key];
    },
    restore: () => {
      Object.keys(process.env).forEach((key) => {
        delete process.env[key];
      });
      Object.assign(process.env, originalEnv);
    },
  };
}

// Mock network requests
export function mockNetwork() {
  const mockRequests = new Map();

  const mockFetch = vi.fn((url: string, options?: RequestInit) => {
    const key = `${url}:${JSON.stringify(options)}`;
    const mockResponse = mockRequests.get(key);

    if (!mockResponse) {
      return Promise.reject(new Error("No mock response found"));
    }

    return Promise.resolve(mockResponse);
  });

  global.fetch = mockFetch as any;

  return {
    mockFetch,
    addResponse: (url: string, options: RequestInit, response: Response) => {
      const key = `${url}:${JSON.stringify(options)}`;
      mockRequests.set(key, response);
    },
    clear: () => mockRequests.clear(),
  };
}

// Mock CLI prompts
export function mockPrompts() {
  const mockPrompts = {
    text: vi.fn(),
    password: vi.fn(),
    confirm: vi.fn(),
    select: vi.fn(),
    multiselect: vi.fn(),
    group: vi.fn(),
  };

  vi.mock("@clack/prompts", () => mockPrompts);

  return mockPrompts;
}
