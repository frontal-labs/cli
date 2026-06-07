import { Command } from "commander";
import { vi } from "vitest";

// Mock Command class and utilities
export const createMockCommand = (overrides: Partial<Command> = {}) =>
  ({
    name: vi.fn().mockReturnValue("test-command"),
    description: vi.fn().mockReturnValue("Test command"),
    option: vi.fn().mockReturnThis(),
    argument: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    parseAsync: vi.fn(),
    commands: new Map(),
    options: [],
    args: [],
    ...overrides,
  }) as any;

// Mock command registration
export const mockRegisterCommand = (
  program: Command,
  commandName: string,
  handler: any
) => {
  const mockCommand = createMockCommand({
    name: vi.fn().mockReturnValue(commandName),
    action: vi.fn().mockImplementation(handler),
  });

  program.commands = program.commands || new Map();
  program.commands.set(commandName, mockCommand);

  return mockCommand;
};

// Mock prompt utilities
export const createMockPrompts = () => ({
  text: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
  multiselect: vi.fn(),
  group: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  spinner: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
});

// Mock CLI output utilities
export const createMockOutput = () => ({
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  table: vi.fn(),
  json: vi.fn(),
  yaml: vi.fn(),
});

// Mock process utilities
export const createMockProcess = () => ({
  argv: ["node", "frontal"],
  env: { ...process.env },
  exit: vi.fn(),
  stdin: {
    setRawMode: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    on: vi.fn(),
  },
  stdout: {
    write: vi.fn(),
    on: vi.fn(),
  },
  stderr: {
    write: vi.fn(),
    on: vi.fn(),
  },
});

// Mock child process for CLI execution
export const createMockChildProcess = () => {
  const mockSpawn = vi.fn();
  const mockExec = vi.fn();

  vi.mock("child_process", () => ({
    spawn: mockSpawn,
    exec: mockExec,
  }));

  return { mockSpawn, mockExec };
};

// Mock CLI program setup
export const createMockProgram = () => {
  const program = new Command();
  const mockCommands = new Map();

  // Override command registration to track commands
  const originalCommand = program.command.bind(program);
  program.command = vi.fn((name: string, description?: string) => {
    const command = originalCommand(name, description);
    mockCommands.set(name, command);
    return command;
  });

  return {
    program,
    mockCommands,
    getCommand: (name: string) => mockCommands.get(name),
    getAllCommands: () => Array.from(mockCommands.keys()),
  };
};

// Mock CLI execution context
export const createMockExecutionContext = (overrides: any = {}) => ({
  program: createMockProgram().program,
  config: {
    apiKey: "test-key",
    baseUrl: "https://api.test.com",
    orgId: "org_123",
    workspaceId: "ws_123",
  },
  options: {
    json: false,
    yaml: false,
    quiet: false,
    verbose: false,
    debug: false,
    ...overrides.options,
  },
  args: [],
  ...overrides,
});

// Mock CLI error handling
export const createMockErrorHandler = () => {
  const errors: any[] = [];

  return {
    errors,
    handleError: vi.fn((error: any) => {
      errors.push(error);
    }),
    clearErrors: vi.fn(() => {
      errors.length = 0;
    }),
    hasErrors: vi.fn(() => errors.length > 0),
    getLastError: vi.fn(() => errors.at(-1)),
  };
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mock CLI validation
export const createMockValidator = () => ({
  validateEmail: vi.fn((email: string) =>
    EMAIL_REGEX.test(email) ? true : "Invalid email format"
  ),
  validateApiKey: vi.fn((key: string) =>
    key.startsWith("fr_") ? true : "Invalid API key format"
  ),
  validateUrl: vi.fn((url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return "Invalid URL format";
    }
  }),
  validateRequired: vi.fn((value: any, fieldName: string) =>
    value ? true : `${fieldName} is required`
  ),
});

// Mock CLI formatting utilities
export const createMockFormatter = () => ({
  formatTable: vi.fn((data: any[]) => data),
  formatJson: vi.fn((data: any) => JSON.stringify(data, null, 2)),
  formatYaml: vi.fn((_data: any) => "yaml: output"),
  formatBytes: vi.fn((bytes: number) => `${bytes} bytes`),
  formatDate: vi.fn((date: Date) => date.toISOString()),
  formatDuration: vi.fn((ms: number) => `${ms}ms`),
});

// Mock CLI spinner
export const createMockSpinner = () => {
  const spinner = {
    start: vi.fn(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    text: "",
  };

  return spinner;
};

// Mock CLI progress bar
export const createMockProgressBar = () => {
  const progressBar = {
    start: vi.fn(),
    update: vi.fn(),
    stop: vi.fn(),
    render: vi.fn(),
    value: 0,
    total: 100,
  };

  return progressBar;
};
