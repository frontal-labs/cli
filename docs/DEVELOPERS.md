# Frontal CLI Developer Guide

This guide is for developers who want to contribute to the Frontal CLI or build tools that integrate with it.

## Development Environment Setup

### Prerequisites

- **Node.js**: 18.0.0 or higher
- **Bun**: 1.3.8 or higher (recommended)
- **Git**: Latest stable version
- **VS Code**: Recommended IDE with extensions

### Repository Setup

```bash
# Clone the repository
git clone https://github.com/frontal-labs/frontal-cli.git
cd frontal-cli

# Install dependencies
bun install

# Run initial build
bun run build

# Run tests to verify setup
bun run test
```

### IDE Configuration

#### VS Code Extensions

Install these extensions for optimal development:

- **TypeScript and JavaScript Language Features** (built-in)
- **Biome** - For linting and formatting
- **GitLens** - Enhanced Git capabilities
- **Thunder Client** - API testing
- **Docker** - Container development

#### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true,
    "**/.DS_Store": true
  }
}
```

#### VS Code Tasks

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build CLI",
      "type": "shell",
      "command": "bun",
      "args": ["run", "build"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "Run Tests",
      "type": "shell",
      "command": "bun",
      "args": ["run", "test"],
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "Run CLI in Development",
      "type": "shell",
      "command": "bun",
      "args": ["run", "dev"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    }
  ]
}
```

## Project Architecture

### Directory Structure

```
frontal-cli/
├── bin/                    # Executable scripts
│   └── frontal.ts         # Main CLI entry point
├── src/                   # Source code
│   ├── commands/          # Command implementations
│   │   ├── auth.ts        # Authentication commands
│   │   ├── config.ts      # Configuration commands
│   │   ├── orgs.ts        # Organization commands
│   │   └── ...            # Other command files
│   ├── config/           # Configuration management
│   │   ├── index.ts      # Configuration exports
│   │   ├── manager.ts    # Configuration manager
│   │   ├── resolve.ts    # Configuration resolution
│   │   └── schema.ts     # Configuration schema
│   ├── errors/           # Error handling
│   │   ├── handler.ts    # Error handler
│   │   └── types.ts      # Error types
│   ├── http/             # HTTP client
│   │   ├── client.ts     # HTTP client implementation
│   │   └── types.ts      # HTTP types
│   ├── output/           # Output formatting
│   │   ├── formatter.ts  # Output formatter
│   │   ├── table.ts      # Table output
│   │   ├── json.ts       # JSON output
│   │   └── yaml.ts       # YAML output
│   ├── utils/            # Utility functions
│   │   ├── logger.ts     # Logging utilities
│   │   ├── spinner.ts    # Progress indicators
│   │   └── validation.ts # Input validation
│   ├── index.ts          # Main entry point
│   └── version.ts        # Version information
├── tests/                # Test files
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── fixtures/        # Test fixtures
├── docs/                # Documentation
└── scripts/             # Build and utility scripts
```

### Core Components

#### CLI Entry Point

The CLI uses Commander.js for command-line parsing:

```typescript
// src/index.ts
import { Command } from "commander";
import { VERSION } from "./version.js";

export async function run(argv: string[]): Promise<void> {
  const program = new Command()
    .name("frontal")
    .description("Frontal platform CLI")
    .version(VERSION);
  
  // Register commands
  registerAuthCommands(program);
  registerConfigCommands(program);
  // ... other commands
  
  await program.parseAsync(argv);
}
```

#### Command Structure

Each command follows this pattern:

```typescript
// src/commands/example.ts
import type { Command } from "commander";
import { handleError } from "../errors/handler.js";

export function registerExampleCommands(program: Command): void {
  const command = program
    .command("example")
    .description("Example command group");
    
  command
    .command("list")
    .description("List examples")
    .option("--format <format>", "Output format", "table")
    .action(async (opts, cmd) => {
      try {
        const result = await listExamples(opts);
        outputResult(result, opts.format);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
```

#### Configuration System

The configuration system supports hierarchical settings:

```typescript
// src/config/manager.ts
export class ConfigManager {
  private config: Config;
  private profile: string;
  
  constructor(profile = "default") {
    this.profile = profile;
    this.config = this.loadConfig();
  }
  
  get(key: string): unknown {
    return this.getNestedValue(this.config, key);
  }
  
  set(key: string, value: unknown): void {
    this.setNestedValue(this.config, key, value);
    this.saveConfig();
  }
  
  private loadConfig(): Config {
    // Load from ~/.frontal/config.json
    // Merge with profile-specific config
    // Apply environment variable overrides
  }
}
```

#### HTTP Client

The HTTP client handles API communication:

```typescript
// src/http/client.ts
export class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  
  constructor(config: Config) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }
  
  async request<T>(
    method: string,
    path: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }
    
    return response.json();
  }
}
```

## Development Workflow

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/new-command
   ```

2. **Make your changes** following the coding standards

3. **Run tests and linting**:
   ```bash
   bun run test
   bun run lint
   bun run type-check
   ```

4. **Build the project**:
   ```bash
   bun run build
   ```

5. **Test your changes**:
   ```bash
   # Run CLI from source
   bun run dev --help
   
   # Test specific command
   bun run dev new-command --debug
   ```

### Adding New Commands

1. **Create command file** in `src/commands/`:

```typescript
// src/commands/new-feature.ts
import type { Command } from "commander";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { outputResult } from "../output/formatter.js";

export function registerNewFeatureCommands(program: Command): void {
  const command = program
    .command("new-feature")
    .description("New feature commands");
    
  command
    .command("list")
    .description("List new features")
    .option("--format <format>", "Output format", "table")
    .action(async (opts, cmd) => {
      try {
        const config = cmd.optsWithGlobals();
        const client = new ApiClient(config);
        const result = await client.get("/new-features");
        outputResult(result, opts.format);
      } catch (err) {
        handleError(err, config);
      }
    });
}
```

2. **Register the command** in `src/index.ts`:

```typescript
import { registerNewFeatureCommands } from "./commands/new-feature.js";

export async function run(argv: string[]): Promise<void> {
  // ... existing code
  
  registerNewFeatureCommands(program);
  
  await program.parseAsync(argv);
}
```

3. **Add tests** in `tests/unit/`:

```typescript
// tests/unit/commands/new-feature.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerNewFeatureCommands } from "../../../src/commands/new-feature.js";

describe("New Feature Commands", () => {
  it("should register commands", () => {
    const program = { command: vi.fn().mockReturnSelf() };
    registerNewFeatureCommands(program);
    
    expect(program.command).toHaveBeenCalledWith("new-feature");
  });
});
```

### Testing

#### Unit Tests

```bash
# Run all unit tests
bun run test

# Run specific test file
bun run test tests/unit/commands/auth.test.ts

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

#### Integration Tests

```bash
# Run integration tests
bun run test tests/integration/

# Run specific integration test
bun run test tests/integration/auth.test.ts
```

#### Test Structure

```typescript
// tests/unit/example.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfigManager } from "../../src/config/manager.js";

describe("ConfigManager", () => {
  let manager: ConfigManager;
  
  beforeEach(() => {
    manager = new ConfigManager("test");
  });
  
  it("should get configuration values", () => {
    expect(manager.get("defaults.outputFormat")).toBe("table");
  });
  
  it("should set configuration values", () => {
    manager.set("defaults.outputFormat", "json");
    expect(manager.get("defaults.outputFormat")).toBe("json");
  });
});
```

### Code Quality

#### Linting

```bash
# Run linter
bun run lint

# Fix linting issues
bun run lint --fix
```

#### Formatting

```bash
# Format code
bun run format

# Check formatting
bun run format --check
```

#### Type Checking

```bash
# Run TypeScript compiler
bun run type-check
```

## Building and Distribution

### Build Process

```bash
# Build for distribution
bun run build

# Clean build artifacts
bun run clean
```

The build process:

1. Compiles TypeScript to JavaScript
2. Bundles dependencies
3. Creates executable in `dist/`
4. Adds shebang for direct execution

### Package Structure

```
dist/
├── bin/
│   └── frontal.js        # Executable CLI
├── commands/             # Compiled command files
├── config/              # Compiled config files
├── errors/              # Compiled error files
├── http/                # Compiled HTTP files
├── output/              # Compiled output files
├── utils/               # Compiled utility files
├── index.js             # Main entry point
└── version.js           # Version information
```

### Publishing

```bash
# Build and publish to NPM
bun run build
bun run publish

# Publish with specific tag
bun run publish --tag beta
```

## Debugging

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Enable debug for all commands
export FRONTAL_DEBUG=true
frontal <command>

# Or use debug flag
frontal <command> --debug
```

### VS Code Debugging

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug CLI",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/bin/frontal.ts",
      "args": ["--debug", "orgs", "list"],
      "runtimeArgs": ["--loader", "ts-node/esm"],
      "env": {
        "FRONTAL_DEBUG": "true"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

### Common Debugging Techniques

1. **Use console.log with debug flag**:
   ```typescript
   if (config.debug) {
     console.log("Debug: Processing request", { url, method });
   }
   ```

2. **Use the built-in logger**:
   ```typescript
   import { logger } from "../utils/logger.js";
   
   logger.debug("Processing API request", { endpoint, data });
   ```

3. **Inspect HTTP requests**:
   ```bash
   # Enable HTTP debugging
   export FRONTAL_DEBUG_HTTP=true
   frontal orgs list
   ```

## Performance Considerations

### Optimizing CLI Performance

1. **Lazy loading** of commands and modules
2. **Caching** of API responses where appropriate
3. **Streaming** for large outputs
4. **Parallel processing** for batch operations

```typescript
// Example of lazy loading
export async function loadHeavyModule() {
  const { heavyModule } = await import("./heavy-module.js");
  return heavyModule;
}
```

### Memory Management

1. **Avoid memory leaks** in long-running processes
2. **Clean up resources** properly
3. **Use streams** for large data processing

```typescript
// Example of proper cleanup
export class ResourceManager {
  private resources: Resource[] = [];
  
  addResource(resource: Resource): void {
    this.resources.push(resource);
  }
  
  cleanup(): void {
    for (const resource of this.resources) {
      resource.dispose();
    }
    this.resources = [];
  }
}
```

## API Design

### Internal APIs

When designing internal APIs:

1. **Use TypeScript interfaces** for type safety
2. **Provide clear error messages**
3. **Document function behavior**
4. **Handle edge cases gracefully**

```typescript
// Example internal API
export interface ApiOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export class ApiClient {
  async request<T>(
    method: string,
    path: string,
    options?: ApiOptions
  ): Promise<ApiResponse<T>> {
    // Implementation
  }
}
```

### Plugin Architecture

The CLI supports plugins for extensibility:

```typescript
// Plugin interface
export interface Plugin {
  name: string;
  version: string;
  register(program: Command): void;
}

// Plugin registration
export function registerPlugin(plugin: Plugin): void {
  plugin.register(program);
}
```

## Contributing Guidelines

### Code Style

Follow the established code style:

- **TypeScript** for all new code
- **2 space indentation**
- **Double quotes** for strings
- **Semicolons** required
- **80 character line width**

### Commit Messages

Follow conventional commits:

```
feat: add new command for resource management
fix: resolve authentication timeout issue
docs: update API documentation
test: add integration tests for deployment
```

### Pull Request Process

1. **Create feature branch** from main
2. **Make changes** with tests
3. **Ensure all tests pass**
4. **Update documentation**
5. **Submit pull request** with clear description

## Security Considerations

### API Key Handling

- **Never log API keys**
- **Use secure storage** for credentials
- **Validate API key format**
- **Implement proper error handling**

```typescript
// Example of secure API key handling
export class SecureStorage {
  private static readonly CONFIG_DIR = path.join(os.homedir(), ".frontal");
  
  static async storeApiKey(key: string, profile = "default"): Promise<void> {
    const configPath = path.join(this.CONFIG_DIR, "profiles", `${profile}.json`);
    await fs.ensureDir(path.dirname(configPath));
    
    const config = { apiKey: key };
    await fs.writeJson(configPath, config, { mode: 0o600 });
  }
  
  static async getApiKey(profile = "default"): Promise<string | null> {
    const configPath = path.join(this.CONFIG_DIR, "profiles", `${profile}.json`);
    
    try {
      const config = await fs.readJson(configPath);
      return config.apiKey;
    } catch {
      return null;
    }
  }
}
```

### Input Validation

- **Validate all user inputs**
- **Sanitize file paths**
- **Check for injection attacks**
- **Use parameterized queries**

## Next Steps

- [Review the architecture documentation](./ARCHITECTURE.md)
- [Check the contributing guidelines](../CONTRIBUTING.md)
- [Explore the command reference](./command_reference.md)
- [Review the API documentation](./api_documentation.md)